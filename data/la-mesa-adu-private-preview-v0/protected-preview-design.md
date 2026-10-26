# Protected private-preview design

Design only; no deployment is authorized or performed in Packet 70.

- Use a Vercel Preview deployment protected by Vercel Authentication or equivalent access control.
- Set `TRULOT_LA_MESA_ADU_PREVIEW=1` only in the protected Preview environment.
- Keep the current runtime production guard, `noindex` metadata, sitemap exclusion, and absence of a canonical public route.
- Do not attach a production/custom domain.
- Keep lookup data bundled from the sealed local artifact; do not add a production database dependency.
- Keep lead delivery disabled and labeled local-only.
- Give access only to named pilot participants and remove access when the pilot closes.
