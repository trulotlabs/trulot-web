"""Focused tests for sealed production connection construction and redaction."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import stat
import sys
import tempfile
import types
from types import SimpleNamespace
from unittest.mock import patch

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sealed_parcel_import_connection", HERE / "import.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(IMPORTER)

checks = 0


def test(name: str, condition: bool) -> None:
    global checks
    if not condition:
        raise AssertionError(name)
    checks += 1
    print("PASS", name)


def args(mode: str = "parcel-only", *, authorized: bool = True, boundary: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        boundary=boundary,
        mode=mode,
        authorize_production_load=authorized,
        database_url_env="TRULOT_TEST_DATABASE_URL",
    )


project = "qockltdzvjxdlwrpgtsd"
secret = "packet-6b-secret-marker"
uri = f"postgresql://postgres.{project}:{secret}@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require"

with patch.dict(
    os.environ,
    {"TRULOT_TEST_DATABASE_URL": uri, "TRULOT_V2_PARCEL_LOAD_AUTHORIZED": "1"},
    clear=False,
):
    with patch.object(IMPORTER, "validate_production_dsn", wraps=IMPORTER.validate_production_dsn) as validate:
        parcel_target = IMPORTER.target_from_args(args())
        test("production identity validation runs before target construction", validate.call_count == 1)

expected_command = [IMPORTER.PSQL, "-X", "-v", "ON_ERROR_STOP=1", "--dbname", uri]
test("production URI uses the explicit psql dbname argument", parcel_target.command == expected_command)
test("production URI is not assigned to PGDATABASE", "PGDATABASE" not in parcel_target.environment)
test("sanitized production environment remains the sealed environment", parcel_target.environment == IMPORTER.ENV)

with patch.dict(
    os.environ,
    {"TRULOT_TEST_DATABASE_URL": uri, "TRULOT_V2_PRODUCTION_LOAD_AUTHORIZED": "1"},
    clear=False,
):
    integrated_target = IMPORTER.target_from_args(args("integrated"))
test("integrated production mode uses the same corrected mechanism", integrated_target.command == expected_command)
test("parcel-only and integrated production commands are deterministic", parcel_target.command == integrated_target.command)

for label, candidate in (
    ("database", uri.replace("/postgres?", "/wrong?")),
    ("project", uri.replace(project, "wrongproject")),
):
    try:
        IMPORTER.validate_production_dsn(candidate, IMPORTER.PARCEL_ONLY_EXPECTED)
    except ValueError:
        test(f"wrong production {label} remains rejected", True)
    else:
        raise AssertionError(f"wrong production {label} was accepted")

for name, production_args, environment in (
    ("missing explicit CLI authorization remains rejected", args(authorized=False), {"TRULOT_TEST_DATABASE_URL": uri, "TRULOT_V2_PARCEL_LOAD_AUTHORIZED": "1"}),
    ("missing parcel authorization environment gate remains rejected", args(), {"TRULOT_TEST_DATABASE_URL": uri}),
):
    with patch.dict(os.environ, environment, clear=True):
        try:
            IMPORTER.target_from_args(production_args)
        except ValueError:
            test(name, True)
        else:
            raise AssertionError(name)

wrong_database_target = SimpleNamespace(label="separately-authorized-production", sql=lambda _query: "wrong")
try:
    IMPORTER.verify_target_database(wrong_database_target, IMPORTER.PARCEL_ONLY_EXPECTED)
except ValueError:
    test("connected database identity verification remains mandatory", True)
else:
    raise AssertionError("wrong connected database was accepted")

local_module = types.ModuleType("local")
local_module.connection = lambda boundary: ["local-psql", "--boundary", boundary]
with patch.dict(sys.modules, {"local": local_module}):
    local_target = IMPORTER.target_from_args(args(boundary="/private/tmp/local-boundary.json"))
test(
    "local rehearsal command path remains unchanged",
    local_target.command == ["local-psql", "--boundary", "/private/tmp/local-boundary.json"]
    and local_target.label == "isolated-local-rehearsal"
    and local_target.secret is None,
)


def stream_failure(target, log):
    with target.stream(log) as process:
        assert process.stdin is not None
        process.stdin.write("select 1;\n")
        process.stdin.close()


with tempfile.TemporaryDirectory() as temporary:
    temporary_path = pathlib.Path(temporary)
    fake_psql = temporary_path / "fake-psql"
    fake_psql.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >&2\ncat >/dev/null\nexit 9\n")
    fake_psql.chmod(fake_psql.stat().st_mode | stat.S_IXUSR)
    failure_target = IMPORTER.Target(
        [str(fake_psql), "--dbname", uri],
        "simulated-production",
        IMPORTER.ENV,
        secret=uri,
    )
    log = temporary_path / "psql.log"
    errors: list[str] = []
    captured_stdout = io.StringIO()
    captured_stderr = io.StringIO()
    with contextlib.redirect_stdout(captured_stdout), contextlib.redirect_stderr(captured_stderr):
        for operation in (
            lambda: failure_target.sql("select 1"),
            lambda: failure_target.run("select 1;", log),
            lambda: stream_failure(failure_target, log),
        ):
            try:
                operation()
            except RuntimeError as error:
                errors.append(str(error))
            else:
                raise AssertionError("simulated psql failure was accepted")
    combined = "\n".join(errors) + captured_stdout.getvalue() + captured_stderr.getvalue() + log.read_text()
    test("simulated psql failures never expose the credential-bearing URI", uri not in combined and secret not in combined)
    test("psql log redacts a URI echoed by a failed subprocess", "<redacted-database-uri>" in log.read_text())


class ReceiptTarget:
    label = "separately-authorized-production"
    command = ["psql", "--dbname", uri]
    secret = uri

    def sql(self, statement: str) -> str:
        if statement == "select current_database()":
            return "postgres"
        if "concat_ws" in statement:
            return "VALIDATED|PARCEL_ONLY|NULL"
        if "selected_snapshot" in statement or "parcel_serving_v2" in statement or "parcel_intelligence_serving_v2" in statement:
            return "0"
        if "json_build_object('startedAt'" in statement:
            return json.dumps({"startedAt": "2026-09-26T00:00:00Z", "completedAt": "2026-09-26T00:00:01Z", "status": "VALIDATED", "runKind": "PARCEL_ONLY"})
        raise AssertionError(statement)


with tempfile.TemporaryDirectory() as temporary:
    output = pathlib.Path(temporary) / "receipt"
    safe_counts = {
        "parcelAcquisitions": 1,
        "importRuns": 1,
        "parcelSource": 1089758,
        "parcelAccepted": 1088430,
        "parcelQuarantine": 1328,
        "cityParcels": 393733,
        "cityDistinctApns": 393733,
        "orphanAccepted": 0,
        "orphanQuarantine": 0,
        "zoningRows": 0,
        "mappingRows": 0,
        "selectedSnapshots": 0,
    }
    argv = [
        "import.py", "--mode", "parcel-only", "--database-url-env", "TRULOT_TEST_DATABASE_URL",
        "--authorize-production-load", "--validate-only", "--manifest", "unused.json", "--output", str(output),
    ]
    receipt_stdout = io.StringIO()
    with (
        patch.object(sys, "argv", argv),
        patch.object(IMPORTER, "target_from_args", return_value=ReceiptTarget()),
        patch.object(IMPORTER, "load_manifest", return_value=("sealed-materialization", {}, {})),
        patch.object(IMPORTER, "matching_import_run", return_value="123e4567-e89b-42d3-a456-426614174000"),
        patch.object(IMPORTER, "validate_parcel_only_candidate", return_value=(safe_counts, IMPORTER.PARCEL_ONLY_EXPECTED["fingerprints"])),
        contextlib.redirect_stdout(receipt_stdout),
    ):
        IMPORTER.main()
    persisted = (output / "receipt.json").read_text()
    test("generated receipt and normal output never include the connection URI", uri not in persisted + receipt_stdout.getvalue() and secret not in persisted + receipt_stdout.getvalue())

print(f"{checks} production connection checks passed.")
