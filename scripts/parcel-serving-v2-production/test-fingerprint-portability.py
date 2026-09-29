"""Regression checks for the sealed Parcel V2 float-rendering contract."""

from __future__ import annotations

import importlib.util
import inspect
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sealed_fingerprint_importer", HERE / "import.py")
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


fixture = json.loads((HERE / "fingerprint-rendering-fixtures.json").read_text())
cases = fixture["cases"]

test("fixture seals extra_float_digits=1", fixture["setting"] == "extra_float_digits=1")
test("fixture covers every known problematic value", [case["input"] for case in cases] == ["0.97", "1.41", "4.56"])
test(
    "fixture records each exact stored float literal",
    [case["exactFloatLiteral"] for case in cases]
    == ["0.9700000000000001", "1.4100000000000001", "4.5600000000000005"],
)
test("PostgreSQL 17.6 defaults differ from the canonical rendering", all(case["postgres17_6Default"] != case["canonical"] for case in cases))
test("PostgreSQL 17.9-compatible rendering equals the canonical rendering", all(case["postgres17_9Compatible"] == case["canonical"] for case in cases))
test(
    "fingerprint statements explicitly set the canonical rendering before the query",
    IMPORTER.bounded_fingerprint_statement("copy (select 1) to stdout")
    == "set statement_timeout = '30min';\nset extra_float_digits = 1;\ncopy (select 1) to stdout",
)
test(
    "all PostgreSQL-streamed fingerprint paths use the canonical session wrapper",
    "bounded_fingerprint_statement" in inspect.getsource(IMPORTER.stream_fingerprint)
    and "bounded_fingerprint_statement" in inspect.getsource(IMPORTER.integrated_fingerprint),
)
test(
    "the mapping fingerprint remains independent of PostgreSQL rendering",
    "mapping_fingerprint.update((canonical(entry) + \"\\n\").encode())"
    in pathlib.Path(IMPORTER.__file__).read_text(),
)
test(
    "the importer has no persistent float-rendering configuration",
    "alter database" not in pathlib.Path(IMPORTER.__file__).read_text().lower()
    and "alter role" not in pathlib.Path(IMPORTER.__file__).read_text().lower(),
)

print(f"{checks} fingerprint-portability checks passed.")
