# SDA source reconciliation

SDA results are temporarily unavailable while the source is reconciled. The application exposes a typed reconciliation-pending state and does not interpret missing or incomplete SDA data as a negative result. Other supported overlay results remain independent.

A temporary production database freeze is active. Repository-controlled production database workflows fail closed through the authoritative guard and must not use production credentials or database commands while the freeze is active. Migrations `20260713022000` and `20260713025206` are explicitly prohibited.

The `TruLot Production Database Freeze Guard / verify-freeze` check must remain required on the protected production branch. Unfreezing requires a separately reviewed code change after the private SDA recovery acceptance criteria pass.

Detailed incident evidence is maintained in the private TruLot operations record.
