# Parcel RS standards runtime V0

This is a repository-local, deterministic adapter over Packet 9 Base Zoning V2 evidence and Packet 12 RS standards. It has no network, database, browser, production-runtime, compliance, or capacity behavior.

```sh
python3 scripts/parcel-rs-standards-runtime-v0/build.py
python3 scripts/parcel-rs-standards-runtime-v0/test.py
```

Resolve one compatible JSON input with:

```sh
python3 scripts/parcel-rs-standards-runtime-v0/resolver.py input.json
```
