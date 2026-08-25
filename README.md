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
EDI_LLM_PROVIDER=ollama uvicorn main:app --reload --port 8000 --app-dir backend
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

Two processes: a Python ASGI app and a Next.js app. Host them however you
host those. Nothing here is written for a particular platform.

What the app needs from wherever you put it:

- **Somewhere to keep workspaces.** A disk is enough — `EDI_STORE=sqlite`
  writes to `EDI_DATA_DIR`. Postgres via Supabase is the alternative, and
  becomes necessary when the backend has no persistent disk or runs as more
  than one instance.
- **A route from the browser to the API.** Simplest is one origin: put a
  reverse proxy in front and send `/api/*` to the Python process, everything
  else to Next. Then there is no CORS to think about. If you would rather run
  them on separate domains, name the frontend's origin in `EDI_CORS_ORIGINS`
  — the API refuses a wildcard, because that would let any page on the
  internet call it.
- **A model.** A key for a hosted provider, or an Ollama the backend can
  reach. See [Choosing a model](https://github.com/illeniall239/EDI#the-model).

A plain server is two commands and a proxy:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend
cd edi-frontend && npm run build && npm start      # BACKEND_ORIGIN unset if proxied
```

### Vercel, as one worked example

`vercel.json` is in the repository because it is what the demo runs on. It is
read only by Vercel and ignored everywhere else, so it costs nothing if you
deploy elsewhere — and it is a reasonable thing to copy if you want the same
shape: both halves as services of one project, `/api/*` to Python, everything
else to Next, one domain, no CORS.

Two things about that platform specifically, both of which fail in ways that
look like something else:

- **Root Directory must be the repository root**, not `edi-frontend/`. Vercel
  only reads `vercel.json` from the directory it is given. Pointed at the
  subdirectory it ignores the file, serves the frontend alone, and every
  `/api/*` call lands on Next's 404 page.
- **Supabase is required rather than optional**, because the filesystem is
  read-only apart from `/tmp`, that does not survive between invocations, and
  two consecutive requests are not guaranteed to reach the same instance.
  This is a property of serverless, not of EDI — a VPS with a disk has neither
  problem and can stay on SQLite.

## Usage limits, if you put this on a public URL

**Off by default.** Running EDI for yourself there is nobody to rate limit,
and a cap of a few questions a minute is only an obstacle.

Turn them on before anyone else can reach it:

```bash
EDI_LIMITS_ENABLED=1
```

What they defend against is specific to that situation: there is no sign-up,
so every visitor is anonymous, and every question is a model call billed to
you. Without limits one visitor with a loop can spend the whole quota, and
the deployment doubles as a free LLM proxy for anyone who finds it.

`backend/limits.py` holds the whole policy, and every number is overridable —
the defaults were sized for a handful of people trying out a link, not for a
deployment with real users:

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
