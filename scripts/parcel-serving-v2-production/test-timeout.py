"""Verify the sealed bulk-import and post-commit validation timeouts.

Usage: python3 test-timeout.py BOUNDARY
"""

from __future__ import annotations

import importlib.util
import inspect
import io
import os
import pathlib
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
from local import ENV, connection  # noqa: E402

SPEC = importlib.util.spec_from_file_location("sealed_timeout_importer", HERE / "import.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(IMPORTER)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    psql = connection(pathlib.Path(sys.argv[1]).resolve())
    checks = 0

    def test(name: str, condition: bool) -> None:
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name, flush=True)

    def session(statements: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(psql + ["-qAt"], input=statements, text=True, env=ENV, capture_output=True)

    source = pathlib.Path(IMPORTER.__file__).read_text()
    test("bulk-load timeout contract is exactly 30min", IMPORTER.BULK_IMPORT_STATEMENT_TIMEOUT == "30min")
    test("post-commit validation timeout contract is exactly 30min", IMPORTER.VALIDATION_STATEMENT_TIMEOUT == "30min")
    test("fingerprint float rendering contract is exactly one extra digit", IMPORTER.FINGERPRINT_EXTRA_FLOAT_DIGITS == 1)
    test(
        "parcel-only, integrated and candidate loaders share the transaction timeout boundary",
        source.count("begin_bulk_import(process)") == 3,
    )

    stream = SimpleNamespace(stdin=io.StringIO())
    IMPORTER.begin_bulk_import(stream)
    test(
        "bulk transaction begins before one transaction-local timeout statement",
        stream.stdin.getvalue() == "begin;\nset local statement_timeout = '30min';\n",
    )

    commit = session("""
      select current_setting('statement_timeout');
      begin;
      set local statement_timeout = '30min';
      select current_setting('statement_timeout');
      commit;
      select current_setting('statement_timeout');
    """)
    commit_values = [line for line in commit.stdout.splitlines() if line]
    test(
        "transaction-local timeout is 30min and resets after commit",
        commit.returncode == 0
        and len(commit_values) == 3
        and commit_values[1] == "30min"
        and commit_values[0] == commit_values[2]
        and commit_values[0] != "30min",
    )

    rollback = session("""
      select current_setting('statement_timeout');
      begin;
      set local statement_timeout = '30min';
      select current_setting('statement_timeout');
      rollback;
      select current_setting('statement_timeout');
    """)
    rollback_values = [line for line in rollback.stdout.splitlines() if line]
    test(
        "transaction-local timeout is 30min and resets after rollback",
        rollback.returncode == 0
        and len(rollback_values) == 3
        and rollback_values[1] == "30min"
        and rollback_values[0] == rollback_values[2]
        and rollback_values[0] != "30min",
    )

    canceled = session("""
      begin;
      set local statement_timeout = '1ms';
      select pg_sleep(0.05);
    """)
    test(
        "deliberately short local timeout cancels a harmless long statement",
        canceled.returncode != 0 and "statement timeout" in canceled.stderr.lower(),
    )

    bounded = session("""
      select current_setting('statement_timeout');
      begin;
      set local statement_timeout = '30min';
      select current_setting('statement_timeout');
      select pg_sleep(0.05);
      rollback;
      select current_setting('statement_timeout');
    """)
    bounded_values = [line for line in bounded.stdout.splitlines() if line]
    test(
        "importer bound permits the harmless statement and rollback restores baseline",
        bounded.returncode == 0
        and len(bounded_values) == 3
        and bounded_values[1] == "30min"
        and bounded_values[0] == bounded_values[2],
    )

    short_target = IMPORTER.Target(
        psql,
        "short-default-validation-test",
        {**ENV, "PGOPTIONS": "-c statement_timeout=1ms"},
    )
    try:
        short_target.sql("select pg_sleep(0.05)")
    except RuntimeError:
        short_canceled = True
    else:
        short_canceled = False
    test("default short validation timeout cancels an expensive query", short_canceled)

    bounded_value = short_target.sql(
        "select pg_sleep(0.05); select current_setting('statement_timeout')",
        validation=True,
    )
    test("sealed validation timeout allows the same query", bounded_value == "30min")
    test(
        "validation timeout applies only to its psql connection",
        short_target.sql("select current_setting('statement_timeout')") == "1ms",
    )
    baseline_target = IMPORTER.Target(psql, "baseline-timeout-test", ENV)
    test(
        "subsequent session defaults remain unchanged",
        baseline_target.sql("select current_setting('statement_timeout')") not in {"30min", "1ms"},
    )

    lowered = source.lower()
    test("importer never alters database timeout configuration", "alter database" not in lowered)
    test("importer never alters role timeout configuration", "alter role" not in lowered)
    test(
        "importer never disables statement timeout",
        not any(
            forbidden in lowered
            for forbidden in ("statement_timeout = 0", "statement_timeout='0'", 'statement_timeout = "0"')
        ),
    )
    test(
        "parcel-only count validation uses the separate validation timeout",
        "validation=True" in inspect.getsource(IMPORTER.query_parcel_only_counts),
    )
    test(
        "count and fingerprint validation share the bounded connection contract",
        "validation=True" in inspect.getsource(IMPORTER.query_counts)
        and "validation=True" in inspect.getsource(IMPORTER.query_integrated_candidate_counts)
        and "bounded_fingerprint_statement" in inspect.getsource(IMPORTER.stream_fingerprint)
        and "bounded_fingerprint_statement" in inspect.getsource(IMPORTER.parcel_zone_mapping_fingerprint)
        and "bounded_fingerprint_statement" in inspect.getsource(IMPORTER.integrated_fingerprint),
    )
    test(
        "fingerprint rendering is session-scoped and precedes each fingerprint query",
        IMPORTER.bounded_fingerprint_statement("select 1")
        == "set statement_timeout = '30min';\nset extra_float_digits = 1;\nselect 1",
    )
    test(
        "general validation does not inherit the fingerprint rendering override",
        "extra_float_digits" not in IMPORTER.bounded_validation_statement("select 1"),
    )
    main_source = inspect.getsource(IMPORTER.main)
    test(
        "validate-only and resume-validation share the sealed validation path",
        "validate-only" in main_source
        and "resume-validation" in main_source
        and main_source.count("validate_parcel_only_candidate(target, import_run_id)") == 1,
    )

    production_args = SimpleNamespace(
        boundary=None,
        mode="parcel-only",
        authorize_production_load=True,
        database_url_env="TRULOT_TEST_DATABASE_URL",
    )
    fake_url = "postgresql://postgres.qockltdzvjxdlwrpgtsd@aws-0-us-west-1.pooler.supabase.com/postgres"
    with patch.dict(os.environ, {"TRULOT_TEST_DATABASE_URL": fake_url}, clear=True):
        try:
            IMPORTER.target_from_args(production_args)
        except ValueError as error:
            authorization_rejected = "TRULOT_V2_PARCEL_LOAD_AUTHORIZED=1" in str(error)
        else:
            authorization_rejected = False
    test("production authorization gate remains required", authorization_rejected)

    test(
        "timeout contracts do not add a production CLI override",
        "statement-timeout" not in source and "timeout" not in inspect.getsource(IMPORTER.target_from_args),
    )

    print(f"{checks} bulk-import and validation-timeout checks passed.")


if __name__ == "__main__":
    main()
