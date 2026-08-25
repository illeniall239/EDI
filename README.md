# EDI

A spreadsheet you can ask questions. Upload a CSV or Excel file, then use plain
English to filter it, clean it, chart it, or have it explained back to you.

There is no sign-up. Opening the app drops you straight into a sheet with the
AI sidebar next to it.

EDI is a harness: you bring the model. It runs on Google, OpenAI, Anthropic,
Groq, a local model through **Ollama**, or anything speaking the
OpenAI-compatible wire format. With nothing configured at all it keeps
workspaces in a local file and looks for Ollama on localhost -- no API key, no
database signup.

Documentation is part of the app: run it and open `/docs`, or read the source
in [`edi-frontend/src/app/docs`](edi-frontend/src/app/docs). It covers the
quickstart, the provider matrix, self-hosting, and how it works.

## How it works

```
browser ──── /api/* ────► FastAPI ────► your model
   │                         │
   │                         └────────► workspace store
   │                                    (Postgres, or a local file)
   │
   └── remembers an anonymous workspace id in localStorage
```

A workspace is a row in Postgres keyed by a UUID. The browser keeps that UUID
in `localStorage` and sends it with every request; that is the whole identity
model. Clearing site data or opening a different browser gets you a fresh,
empty sheet.

The browser never talks to the database. Every read and write goes through the
backend using the service-role key, which lets row-level security stay closed
against the public anon key.

Charts are returned as data, not images. The backend asks the model for
read-only SQL, runs it, and sends back a spec — chart type, axis key, series,
rows — that the client renders with Recharts. Nothing is written to disk, which
is what lets the whole thing run on serverless functions.

## Running it

Nothing is required. With no configuration EDI stores workspaces in a local
SQLite file and looks for a model on `localhost:11434`, where Ollama listens.

```bash
pip install -r backend/requirements.txt
pip install langchain-ollama==0.3.3     # only the provider you use

ollama serve
EDI_LLM_PROVIDER=ollama EDI_LIMITS_ENABLED=0   uvicorn main:app --reload --port 8000 --app-dir backend
```

Check the model can do the job before trusting it — a weak one does not error,
it answers confidently and wrongly:

```bash
EDI_LLM_PROVIDER=ollama python backend/check_model.py
```

To use a hosted model and Postgres instead, copy `sample.env` to `.env`, fill
in a key and your Supabase details, and apply the migrations:

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
echo "BACKEND_ORIGIN=http://127.0.0.1:8000" > .env.local
npm run dev
```

Open http://localhost:3000.

`BACKEND_ORIGIN` is read by `next.config.ts`, server-side, to proxy `/api/*` to
the backend so development is same-origin too. It is deliberately not a
`NEXT_PUBLIC_` variable: those are inlined into the browser bundle at build
time, so a stale one keeps redirecting a deployed site to a host nobody
remembers configuring. In production the two halves are one Vercel project on
one domain, so `BACKEND_ORIGIN` is left unset there.

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

Set a model key (`GOOGLE_API_KEY`, or `EDI_LLM_PROVIDER` plus the matching key
for another provider), `NEXT_PUBLIC_SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY` in the project's environment variables. Supabase is
required here rather than optional: serverless has a read-only filesystem and
no two requests are guaranteed to share an instance.

## Usage limits

The link is public, there is no sign-up, and every question is a model call
billed to whoever deployed it. `backend/limits.py` holds the whole policy:

| | Default | Override |
|---|---|---|
| Questions per visitor per minute | 5 | `EDI_BURST_CALLS`, `EDI_BURST_WINDOW_SECONDS` |
| Questions per visitor per day | 50 | `EDI_DAILY_CALLS_PER_VISITOR` |
| Questions per day, everyone | 1000 | `EDI_DAILY_CALLS_TOTAL` |
| Question length | 2000 chars | `EDI_MAX_QUESTION_CHARS` |
| Upload size | 4 MB | `EDI_MAX_UPLOAD_BYTES` |
| Rows / columns | 20000 / 100 | `EDI_MAX_ROWS`, `EDI_MAX_COLUMNS` |

The per-visitor limits are keyed on client IP, which bounds what one person
can do casually but is not an identity — the *global* daily cap is what
actually bounds the bill, because it counts calls rather than callers and so
survives rotated IPs and cleared browser storage.

Daily counters live in Postgres, not process memory: serverless instances
share no state, so an in-memory counter only sees the traffic that happened to
land on that instance. **They fail open.** If the `usage_counters` migration
has not been applied the app still works, protected only by the per-instance
burst limit. `GET /api/health` reports which of the two you are actually
running under:

```json
"limits": { "daily_counters": "active", "daily_total": 1000, ... }
```

`"unavailable"` there means the migration is missing. `"untested"` means no
question has been asked yet since the instance started.

Set `EDI_LIMITS_ENABLED=0` to switch it all off when running locally against
your own key.

## Other limits worth knowing

- Vercel caps a request or response body at **4.5 MB**, which is why the upload
  limit is 4 MB. Larger files need the backend hosted somewhere without that
  cap.
- The backend is stateless. Every request that touches the data re-reads it
  from the store and rebuilds an in-memory SQLite database, with a per-instance
  cache keyed on a hash of the rows so a warm instance skips the rebuild.
- Anyone who knows a workspace UUID can open it. They are unguessable, but
  this is not a substitute for access control — don't put anything sensitive
  in a deployment you have shared.

## Layout

```
backend/
  main.py               FastAPI routes
  llm_providers.py      the provider table
  settings.py           resolves provider + model from the environment
  check_model.py        tests whether your model can do the job
  agent_services.py     LangChain agents, SQL generation, chart specs
  data_handler.py       file parsing, in-memory SQLite
  stores/               workspace persistence (Postgres or a local file)
  report_generator.py   PDF reports
edi-frontend/
  src/app/page.tsx      the entire app, one route
  src/app/docs/         the documentation site
  src/components/       spreadsheet, chat sidebar, chart renderer
  src/utils/api.ts      every backend call
```

## Built on

**The spreadsheet is [Univer](https://univer.ai)** (Apache-2.0). EDI is a
harness around it, not a spreadsheet of its own — every cell, formula, filter
and sort you interact with is Univer's work. What this project adds is the
part that answers questions about what is in those cells, and the plumbing
that lets a model edit the sheet the way you would.

The rest:

| | |
|---|---|
| [Next.js](https://nextjs.org), [React](https://react.dev), [Tailwind](https://tailwindcss.com) | the frontend (MIT) |
| [Recharts](https://recharts.org) | charts, drawn from the spec the backend returns (MIT) |
| [FastAPI](https://fastapi.tiangolo.com), [Uvicorn](https://www.uvicorn.org) | the backend (MIT, BSD-3) |
| [LangChain](https://www.langchain.com) | one interface across the model providers (MIT) |
| [pandas](https://pandas.pydata.org) | parsing and everything done to the data (BSD-3) |
| [ReportLab](https://www.reportlab.com) | PDF reports (BSD) |
| [Supabase](https://supabase.com) or SQLite | where workspaces live |

And the model, which is yours to pick.

## Licence

MIT. See [LICENSE](LICENSE).
