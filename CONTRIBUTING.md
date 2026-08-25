# Contributing

Thanks for looking. This is a small project, so the process is small too: open
an issue if you want to discuss something first, otherwise a pull request is
fine.

## Getting set up

The fastest loop needs no accounts — a local model through Ollama and a local
file for storage:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
pip install langchain-ollama==0.3.3

EDI_LLM_PROVIDER=ollama EDI_LIMITS_ENABLED=0 \
  uvicorn main:app --reload --port 8000 --app-dir backend
```

```bash
cd edi-frontend
npm install
echo "BACKEND_ORIGIN=http://127.0.0.1:8000" > .env.local
npm run dev
```

`GET /api/health` reports which model and storage backend were actually
resolved, which is the quickest way to find a misconfiguration.

## Before opening a PR

```bash
ruff check backend
cd edi-frontend && npm run lint && npm run build
```

**There are no tests.** Not "the suite is small" — there is no test suite and no
test runner configured. Adding one to a 180 KB `agent_services.py` is its own
project, and a worthwhile contribution if you want one. Until then, changes are
verified by running the thing.

`ruff check backend` is clean and CI enforces it, so a failure there is
something you introduced.

`npm run lint` is **not** clean: it reports 9 errors and a warning, all
React-hooks complaints in pre-existing components (`ChatSidebar`,
`UniversalSpreadsheet`, `ThemeContext` and a few others). CI therefore builds
the frontend but does not lint it. Fixing those is welcome as its own PR —
please don't fold it into a behaviour change, because a diff that does both is
much harder to review.

## House style

The code is commented at the level of *why*, not *what*, and comments that
record a decision or a measurement are load-bearing — several exist because
someone lost an afternoon to the thing they describe. If you change behaviour a
comment explains, update the comment in the same commit.

A few conventions worth knowing:

- **Adding a model provider** means adding a row to `PROVIDERS` in
  `backend/llm_providers.py`. Keep imports lazy so nobody installs an SDK they
  do not use.
- **Adding a storage backend** means implementing the same functions as
  `backend/stores/sqlite_store.py` and adding it to the dispatch in
  `stores/__init__.py`.
- **Anything that spends a model call** should be listed in
  `_METERED_PREFIXES` or `_METERED_SUFFIXES` in `backend/limits.py`. Anything
  that does not, should not be.
- **Never put a secret in a `NEXT_PUBLIC_` variable.** Next inlines them into
  the browser bundle at build time, so it is readable by every visitor. If the
  frontend needs something a model can answer, add a backend endpoint.

## Reporting a security issue

See [SECURITY.md](SECURITY.md). Please don't open a public issue for it.
