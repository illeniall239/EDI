import Link from 'next/link';

export const metadata = {
    title: 'How it works',
    description: 'What happens between a question and an answer.',
};

export default function Architecture() {
    return (
        <>
            <div className="edi-kicker-doc">Reference</div>
            <h1>How it works</h1>
            <p className="lede">
                What happens between typing a question and seeing an answer, and why the
                pieces are arranged the way they are.
            </p>

            <h2>The shape of it</h2>
            <pre><code>{`browser ──── /api/* ────► FastAPI ────► your model
   │                         │
   │                         └────────► workspace store
   │                                    (Postgres, or a local file)
   │
   └── remembers an anonymous workspace id in localStorage`}</code></pre>

            <p>
                A workspace is one row keyed by a UUID. The browser keeps that UUID in{' '}
                <code>localStorage</code> and sends it with every request; that is the whole
                identity model. Clearing site data or opening a different browser gets you a
                fresh, empty sheet. There is no sign-in.
            </p>

            <p>
                The browser never talks to the database. Every read and write goes through
                the backend, which is what lets row-level security stay closed against the
                public anon key.
            </p>

            <h2>A question, end to end</h2>
            <ol>
                <li>
                    <strong>Route it.</strong> The message is classified — is this about the
                    data, or conversation? Small models fail here first.
                </li>
                <li>
                    <strong>Hydrate.</strong> The backend re-reads the workspace row and
                    rebuilds an in-memory SQLite database from it. A warm instance keeps the
                    parsed result, keyed by a hash of the rows, and skips the rebuild when
                    nothing changed.
                </li>
                <li>
                    <strong>Generate SQL.</strong> The model is given the schema and the
                    question, and asked for read-only SQL. Markdown fences are stripped —
                    models emit them regardless of instructions.
                </li>
                <li>
                    <strong>Run it</strong> against the in-memory database.
                </li>
                <li>
                    <strong>Write the answer.</strong> The rows go back to the model to be put
                    into prose, and, when the shape suits it, a chart spec — type, axis key,
                    series, rows.
                </li>
                <li>
                    <strong>Render.</strong> The client draws the chart with Recharts.
                </li>
            </ol>

            <div className="edi-note">
                <strong>Charts are data, not images.</strong> The backend returns a spec and
                the browser draws it. Nothing is written to disk, which is what lets the whole
                thing run on serverless functions — and it means charts stay sharp and
                themeable rather than being a PNG rendered at one size.
            </div>

            <h2>Why the backend is stateless</h2>
            <p>
                It used to hold the dataset in a module-level object, which works fine on one
                long-lived server and not at all on serverless: the filesystem is read-only
                apart from <code>/tmp</code>, that does not survive between invocations, and
                consecutive requests are not guaranteed to reach the same instance.
            </p>
            <p>
                So the dataset lives in the workspace row and is re-read per request. Writing
                changes back through the same row means an edit the model makes — a
                deduplication, a filter — is picked up by the spreadsheet UI through its
                normal load path, with no extra syncing.
            </p>
            <p>
                Reading is cheap; parsing and loading into SQLite is not. Hence the
                per-instance cache. Correctness never depends on it: the row is always fetched
                before the cache is consulted.
            </p>

            <h2>What the model is and is not asked to do</h2>
            <p>
                Every call is a plain completion — <code>invoke(prompt)</code>, read{' '}
                <code>.content</code>. There is no tool calling, no structured-output binding,
                no streaming, no async, and no embeddings or vector store anywhere. Structured
                replies are produced by asking for JSON and parsing what comes back.
            </p>
            <p>
                That is a deliberate constraint, and it is why the provider layer is a table
                rather than an integration: the providers differ only in what they name their
                constructor arguments. It is also what makes modest local models viable —
                nothing here requires a model that can survive an agent loop.
            </p>

            <h2>Layout</h2>
            <pre><code>{`backend/
  main.py                 FastAPI routes
  llm_providers.py        the provider table
  settings.py             resolves provider + model from the environment
  check_model.py          tests whether your model can do the job
  agent_services.py       SQL generation, chart specs, conversation memory
  data_handler.py         file parsing, in-memory SQLite
  limits.py               usage limits
  stores/
    __init__.py           picks a backend
    supabase_store.py     Postgres
    sqlite_store.py       a local file
edi-frontend/
  src/app/page.tsx        the app, one route
  src/app/docs/           these pages
  src/components/         spreadsheet, chat sidebar, charts
  src/utils/api.ts        every backend call`}</code></pre>

            <p>
                <Link href="/docs/api">HTTP API</Link> lists the endpoints.
            </p>
        </>
    );
}
