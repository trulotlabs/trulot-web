# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Doctrine

TruLot is a **deterministic parcel intelligence engine**. The engine determines. AI explains.

**Core rules:**
- Never invent zoning conclusions
- Never aggregate conditional density into guaranteed unit counts
- Always separate `source-backed` / `inferred` / `unknown`
- Prefer deterministic SQL and computed views over autonomous agents or speculative AI features

**Goal:** Help developers understand what exists, what changed, what may be possible, what is uncertain, and what to investigate next.

**Avoid:** autonomous agents, overengineering, speculative AI features, giant raw permit tables.

**Current sprint:** Build Parcel Page V1 only.

**Priority sections:** (1) Parcel identity (2) What can be built (3) Existing structure (4) Project state (5) Permit timeline (6) Activity signal (7) Comparable nearby projects (8) Confidence labels

## Commands

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm run lint     # ESLint
```

No test framework is configured.

## Architecture

**TruLot** is a Next.js 16 (App Router) parcel intelligence web app for San Diego County. It lets developers/investors search parcels, assess development stage, track permits, and identify opportunities.

### Tech Stack
- Next.js 16 + React 19, TypeScript 5, Tailwind CSS 4
- Supabase (PostgreSQL) via `@supabase/supabase-js`
- Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Data Flow

```
/parcel/[apn] (force-dynamic page)
  → getParcelPageData(apn)          # lib/get-parcel-page-data.ts
    → parallel Supabase queries:
        parcel_page_api_v2           # core parcel record
        parcel_primary_project_v1    # primary permit/project
        parcel_permit_terminal_v2    # all permits
      → normalization + stage derivation + conflict detection
      → opportunity layer + jobs-to-engage generation
      → inferPhase()                 # lib/infer-phase.ts
    → ParcelPageResult               # lib/parcel-page-contract.ts
  → multi-section dashboard render
```

### Core Logic (`/lib`)

- **`get-parcel-page-data.ts`** (~860 lines) — master orchestrator. Contains:
  - Data normalization: APN formatting, year (pre-1930 ambiguity → null), bath encoding
  - `extractAduCount()`: priority-ordered regex matching (explicit total > classified types > flexible scan) against permit descriptions
  - `getDevelopmentStage()`: rule cascade → `INACTIVE | EARLY | ACTIVE | SCALING | STALLED | COMPLETE`
  - Conflict detection: flags when primary permit scope ≠ proposed project scope
  - Opportunity layer: `interpretation` + `key_triggers` string arrays
  - `jobs_to_engage`: contractor/supplier roles derived from stage + scope
  - Capacity calculation: SD zoning rules (RS-1-X, RM-X-X, IB-400 ADU program)

- **`infer-phase.ts`** — deterministic rule cascade → 11 construction phases (`ENTITLEMENT` → `COMPLETED`), returns `signals_used` and stall detection

- **`parcel-page-contract.ts`** — all TypeScript interfaces; source of truth for data shapes

- **`supabase.ts`** — Supabase client singleton

### Confidence System
Four tiers used throughout: `"source-backed"` | `"inferred"` | `"conditional"` | `"unknown"`. Attached to most computed fields to surface data quality to the UI.

### API Routes (`/app/api/`)
- `GET /api/search?q=` — address/APN search, returns results with momentum badges
- `GET /api/parcel/[apn]/` — full parcel detail (calls `getParcelPageData`)
- `GET /api/alerts/subscribe/` — alert subscription
- `GET /api/jobs-feed/` — aggregated jobs opportunities

### SD-Specific Domain Rules
- Land use codes and RS/RM zoning patterns are hardcoded in `get-parcel-page-data.ts`
- ADU capacity rules follow San Diego's IB-400 program
- Stage/phase logic encodes SD permit process timing assumptions
