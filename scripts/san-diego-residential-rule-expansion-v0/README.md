# Packet 78 builder

Run `python3 scripts/san-diego-residential-rule-expansion-v0/build.py` and then
`python3 scripts/san-diego-residential-rule-expansion-v0/test.py`.

The builder consumes only committed zoning summaries and sealed RS standards. It
does not access production, re-run geometry, calculate capacity, or wire a UI.
