# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

EDI.ai is a spreadsheet you can ask questions: a Python FastAPI backend and a
Next.js frontend. Upload a CSV or Excel file, then use plain English to filter
it, clean it, chart it, or have it explained back.

It is a **harness, not a model**. The model is chosen by whoever runs it:
Google, OpenAI, Anthropic, Groq, a local model through Ollama, or any
OpenAI-compatible endpoint. Answer quality follows from that choice, so avoid
writing anything that assumes a specific provider or model.

### Key components

**Backend** (`backend/`):
- `main.py`: every FastAPI route, plus the demo-limits middleware
- `llm_providers.py`: the provider table; adding a provider is adding a row
- `settings.py`: resolves provider, model and store from the environment
- `model_catalog.py`: probes what this machine can reach: Ollama's pulled
  models, a signed-in Claude Code CLI, a keyed provider's own model list. It
  reports and does not rank; `TRY_ORDER` is declaration order, not preference
- `model_prefs.py`: the model chosen in the app, and any keys typed into it,
  in `.edi-data/model.json`. Never returned over HTTP, and writable only when
  `control_allowed()` says this is not a public deployment
- `claude_code_llm.py`: the `claude` CLI as a LangChain chat model
- `check_model.py`: tests whether the configured model can do the job
- `agent_services.py`: SQL generation, chart specs, conversation memory
- `data_handler.py`: file parsing into pandas and an in-memory SQLite database
- `stores/`: workspace persistence: `sqlite_store.py` (local file) or
  `supabase_store.py` (Postgres), chosen in `stores/__init__.py`
- `limits.py`: usage limits; off unless `EDI_LIMITS_ENABLED=1`

**Frontend** (`edi-frontend/`):
- Next.js 16, React 19, Tailwind 4, TypeScript
- Univer (Apache-2.0) for the spreadsheet. This is a harness around it, not a
  spreadsheet of its own. Recharts draws the charts
- `src/app/app/page.tsx`: the whole app, one route, served at `/app`
- `src/app/(docs)/`: the documentation site, served at `/`. A route group,
  so the docs shell wraps the root without a `/docs` path segment
- `src/utils/api.ts`: every backend call

**Data flow**: upload → parsed by `data_handler` into an in-memory SQLite
database → question classified → model asked for read-only SQL → SQL run →
rows returned to the model for prose and, when it fits, a chart spec the client
renders.

The backend is **stateless**: it re-reads the workspace from the store on every
request that touches data, because serverless instances share nothing.

## Development commands

### Backend

```bash
pip install -r backend/requirements.txt
pip install langchain-ollama==0.3.3          # only the provider you use

uvicorn main:app --reload --port 8000 --app-dir backend

ruff check backend                            # must be clean; CI enforces it
python backend/check_model.py                 # test the configured model
```

### Frontend

```bash
cd edi-frontend
npm install
npm run dev          # Turbopack
npm run build
npm run lint         # must be clean; CI enforces it
```

## Environment configuration

Nothing is required. With no configuration, workspaces go in a local SQLite
file and the model is looked for on `localhost:11434` (Ollama). See
`sample.env` for the full surface. The ones that matter:

- `EDI_LLM_PROVIDER`: `google` | `openai` | `anthropic` | `groq` | `ollama` |
  `claude` | `openai-compatible`. `anthropic` and `claude` are the same models
  authenticated differently: API key versus the signed-in CLI. Unset means
  resolve in order: a choice saved from the picker, this variable,
  `GOOGLE_API_KEY` alone, then the first detected provider that answers
- `EDI_ALLOW_MODEL_SWITCHING`: may the app's dropdown change the model and
  store keys. Defaults to on unless `EDI_LIMITS_ENABLED=1`
- `EDI_LLM_MODEL`, `EDI_LLM_API_KEY`, `EDI_LLM_BASE_URL`: or the provider's
  conventional key name (`GOOGLE_API_KEY`, `OPENAI_API_KEY`, …)
- `EDI_STORE`: `sqlite` | `supabase`. Guessed from
  `SUPABASE_SERVICE_ROLE_KEY` when unset
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: for the Supabase store
- `EDI_LIMITS_ENABLED=1`: turn the usage caps on, for a public deployment
- `EDI_CORS_ORIGINS`: only when the browser and the API are on different
  origins. Unset means no CORS middleware at all; a wildcard is refused
- `BACKEND_ORIGIN`: goes in `edi-frontend/.env.local`, proxies `/api/*` in dev

`GET /api/health` reports what was actually resolved. Reach for it first when
something is misconfigured.

## Conventions worth keeping

- **Never put a secret in a `NEXT_PUBLIC_` variable.** Next inlines them into
  the browser bundle, so every visitor can read them. If the frontend needs
  something from a model, add a backend endpoint.
- **Anything that spends a model call** belongs in `_METERED_PREFIXES` or
  `_METERED_SUFFIXES` in `limits.py`. Anything that does not, does not.
- **No endpoint may return an API key.** `/api/models` reports `has_key` and
  `key_source` and nothing more. A key reaches the backend once, going in.
- **"Runs on this machine" is a claim about the endpoint, not the provider.**
  `model_catalog.runs_on_this_machine()` decides it from the base URL, so
  `openai-compatible` pointed at LM Studio counts and the same provider
  pointed at OpenRouter does not. `claude` never counts: local binary, remote
  model.
- **The picker reports; it does not advise.** No recommended option, no
  ranking. Ordering is declaration order with unreachable providers last, and
  that is a usability call rather than an opinion about somebody else's
  hardware, bill or data.
- **Keep provider imports lazy** in `llm_providers.py` so nobody installs an
  SDK they do not use.
- **Stay on the 0.3.x line** of every `langchain-*` package. The 1.x releases
  moved modules `langchain 0.3.19` still imports, and an unpinned install
  breaks the backend entirely.
- Comments here record decisions and measurements. If you change behaviour a
  comment explains, update the comment in the same commit.

## File structure notes

- `.edi-data/`: the local workspace store (gitignored)
- `supabase/migrations/`: one migration holding the whole schema

## Testing

There is no test suite and no test runner. `ruff check backend` and
`npm run build` are what CI runs. Changes are verified by running the app.
