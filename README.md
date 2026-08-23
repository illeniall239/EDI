# EDI

A spreadsheet you can ask questions. Upload a CSV or Excel file, then use plain
English to filter it, clean it, chart it, or have it explained back to you.

There is no sign-up. Opening the app drops you straight into a sheet with the
AI sidebar next to it.

## How it works

```
browser ──── /api/* ────► FastAPI ────► Gemini
   │                         │
   │                         └────────► Supabase (the sheet's rows)
   │
   └── remembers an anonymous workspace id in localStorage
```

A workspace is a row in Postgres keyed by a UUID. The browser keeps that UUID
in `localStorage` and sends it with every request; that is the whole identity
model. Clearing site data or opening a different browser gets you a fresh,
empty sheet.

The browser never talks to Supabase. Every read and write goes through the
backend using the service-role key, which lets row-level security stay closed
against the public anon key.

Charts are returned as data, not images. The backend asks Gemini for read-only
SQL, runs it, and sends back a spec — chart type, axis key, series, rows — that
the client renders with Recharts. Nothing is written to disk, which is what
lets the whole thing run on serverless functions.

## Running it

You need a Google AI Studio key and a Supabase project.

```bash
cp sample.env .env      # then fill in the three values
```

Apply the schema change that makes workspaces ownerless. Paste
[`supabase/migrations/20260823000000_remove_auth_requirement.sql`](supabase/migrations/20260823000000_remove_auth_requirement.sql)
into the Supabase SQL editor, or run it with the CLI:

```bash
supabase db push
```

Then start the two halves:

```bash
# backend
pip install -r backend/requirements.txt
uvicorn main:app --reload --port 8000 --app-dir backend

# frontend
cd edi-frontend
npm install
echo "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000" > .env.local
npm run dev
```

Open http://localhost:3000.

In production the two are one Vercel project and same-origin, so
`NEXT_PUBLIC_API_BASE_URL` is left unset there.

## Deploying

`vercel.json` declares both halves as services of a single Vercel project:
Next.js from `edi-frontend/` and the FastAPI app from `backend/`, with `/api/*`
routed to Python and everything else to Next. Frontend and backend end up on
one domain, so the browser only ever makes same-origin requests and there is no
CORS to configure.

One project setting matters, and getting it wrong fails in a way that looks
like something else:

- **Root Directory must be the repository root**, not `edi-frontend/`. Vercel
  only reads `vercel.json` from the root directory it is given. Pointed at the
  subdirectory it silently ignores this file, serves the frontend alone, and
  every `/api/*` call lands on Next's 404 page.

Set `GOOGLE_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY` in the project's environment variables.

## Limits worth knowing

- Vercel caps a request or response body at **4.5 MB**, so uploads are limited
  to 4 MB. Larger files need the backend hosted somewhere without that cap.
- The backend is stateless. Every request that touches the data re-reads it
  from Supabase and rebuilds an in-memory SQLite database, with a per-instance
  cache keyed on a hash of the rows so a warm instance skips the rebuild.
- Anyone who knows a workspace UUID can open it. They are unguessable, but
  this is not a substitute for access control — don't put anything sensitive
  in a deployment you have shared.

## Layout

```
backend/
  main.py               FastAPI routes
  agent_services.py     LangChain agents, SQL generation, chart specs
  data_handler.py       file parsing, in-memory SQLite
  workspace_store.py    all Supabase access
  report_generator.py   PDF reports
edi-frontend/
  src/app/page.tsx      the entire app, one route
  src/components/       spreadsheet, chat sidebar, chart renderer
  src/utils/api.ts      every backend call
```

## Stack

Next.js 16 · React 19 · Tailwind 4 · Univer (spreadsheet) · Recharts ·
FastAPI · LangChain · Gemini 2.5 Flash · pandas · Supabase Postgres
