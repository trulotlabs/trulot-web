# Elevate ROW Revenue Opportunity Interview

## Purpose

This private pilot calibrates which public permit and project signals Elevate wants TruLot to surface. It assumes San Diego County, any project size, and broad public ROW scope. The approved `Elevate Signal Calibration Summary v0.1` guides an initial manual batch of 5–10 real leads.

The feature is intentionally separate from TruLot’s parcel intelligence and production data paths.

## Architecture

- `app/elevate/interview/[token]` is a dynamic, noindex/nofollow server route. It compares the URL token to `ELEVATE_INTERVIEW_TOKEN` before rendering any interview UI.
- The application owns a fixed four-step sequence: valuable signals, actionable evidence, obvious noise, and first-batch delivery. The model cannot select the next step or set progress.
- `app/api/elevate/interview` revalidates the token, validates the structured state, applies an in-memory request limit, and returns only a schema-validated acknowledgement or one same-step clarification.
- `lib/elevate-interview` contains the Zod schemas, deterministic summary builder, signal options, private prompt, token validation, and mock responses.
- The official OpenAI JavaScript SDK calls the Responses API only from the server route. `OPENAI_MODEL` is runtime-configurable; no model is a hidden code dependency.
- Interview state is saved under a token-derived SHA-256 v3 key. The token, API key, and private prompt are not stored there. Older questionnaire sessions are intentionally not imported.
- Approval, Markdown/JSON downloads, clipboard actions, and the `mailto:` handoff happen in the browser.

The OpenAI request uses strict structured output, `store: false`, and a privacy-preserving safety identifier. The application resends the visible transcript on each turn and does not depend on server-side conversation storage.

## Environment variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ELEVATE_INTERVIEW_TOKEN` | Yes | Long random secret embedded in the private invite URL |
| `ELEVATE_INTERVIEW_MOCK` | Local/test | `true` uses the deterministic scripted interview |
| `OPENAI_API_KEY` | Real mode | Server-only OpenAI API key |
| `OPENAI_MODEL` | Real mode | A currently supported Responses API model |
| `NEXT_PUBLIC_ELEVATE_RESULTS_EMAIL` | Optional | Recipient used by the final `mailto:` action |

`.env.example` shows `gpt-5` as an example, not a hidden dependency. Keep the value configurable and confirm the selected Responses API model is available to the project before inviting a participant.

Never commit a real token, API key, or participant email address.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

With the example token, open:

```text
http://localhost:3000/elevate/interview/replace-with-a-long-random-invite-token
```

### Mock mode

Set:

```text
ELEVATE_INTERVIEW_MOCK=true
```

Mock mode needs no OpenAI key. It exercises the same four-step controls, progress, review, correction, approval, downloads, clipboard actions, email handoff, and restart used in real mode.

### Real OpenAI mode

Set:

```text
ELEVATE_INTERVIEW_MOCK=false
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Restart the development server after changing environment variables. The private prompt and credentials never enter the client bundle.

## Private links and token rotation

The invite link is:

```text
https://<host>/elevate/interview/<ELEVATE_INTERVIEW_TOKEN>
```

Generate a long random token, add it to the deployment environment, and share the complete URL only with the intended participant. To revoke old links, replace the environment value and redeploy. Old URLs will show the same neutral access-denied page as any invalid URL.

Changing the token also changes the browser-storage namespace. A participant will not automatically see a draft saved under the previous token.

## Results email

Set `NEXT_PUBLIC_ELEVATE_RESULTS_EMAIL` to Brian’s intended recipient address. After approval, the button opens the participant’s mail client with a concise summary. The participant should attach a downloaded Markdown or JSON packet when the complete transcript is needed.

No email provider, inbox connector, or server-side sending is included.

## Testing

```bash
npm run lint
npm run build
npm run qa:production-freeze
npm run test:e2e:elevate
```

The Playwright suite runs in desktop and mobile Chromium and covers invalid and valid links, deterministic sequence, attempted model jumps, signal classification, unresolved handling, refresh/resume, review, correction, approval, Markdown/JSON downloads, clipboard actions, email handoff, restart, console errors, framework overlays, and phone-width overflow.

## Security and data boundaries

- Invalid or missing tokens do not render the interview or call its API.
- The API validates the token independently and returns neutral, non-sensitive errors.
- Request bodies, per-message size, transcript length, total characters, and request rate are bounded.
- Model output is validated against a narrow Zod contract before it reaches the UI. Structured selections remain authoritative.
- The API key, server environment, and full interviewer prompt stay server-only.
- `store: false` is explicitly set on Responses API requests.
- No Supabase migration, production database object, database write, or production-freeze exception is used.
- `npm run qa:production-freeze` runs the repository’s authoritative current-main production database freeze guard. The Elevate feature does not replace or weaken that guard.

## Persistence limitations

Local storage is device- and browser-specific. Clearing site data, using another browser, rotating the token, or losing the device loses the saved draft. Local storage is suitable for this bounded pilot, but it is not a durable system of record and does not synchronize across devices.

Exports are available only after explicit approval. Before approval, the participant can still return with the same private link on the same browser.

## Future curated email-context seam

`ElevateContextSource` separates approved context from the interviewer and UI. A future, explicitly curated process could add customer names, historical scopes, won/lost estimates, target GCs, project examples, Cesar’s terminology, and relationship evidence as `curated_email` or `customer_note` sources.

This pilot does not ingest an inbox, add connector credentials, or automatically send email content to OpenAI. Any future ingestion should include human selection, provenance, minimization, and participant-appropriate retention controls.

## Known limitations

- In-memory rate limiting is instance-local and intentionally lightweight for a private pilot; it is not a distributed abuse-control system.
- The browser owns session continuity, so no cross-device resume or administrative recovery exists.
- `mailto:` behavior depends on the participant’s configured mail client and URL-length limits.
- The model can identify potential contradictions, but final operating judgment and approval remain Cesar’s.
- Production database storage and automated downstream lead filtering are intentionally deferred.
