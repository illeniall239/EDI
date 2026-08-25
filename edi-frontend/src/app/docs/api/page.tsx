import Link from 'next/link';

export const metadata = {
    title: 'HTTP API',
    description: 'The endpoints the frontend calls, and what each costs.',
};

type Row = { method: string; path: string; note: string; metered?: boolean };

const CORE: Row[] = [
    { method: 'GET', path: '/api/health', note: 'Resolved provider and model, storage backend, limit state. Start here when something is wrong.' },
    { method: 'POST', path: '/api/upload', note: 'Upload a CSV or Excel file.' },
    { method: 'POST', path: '/api/query', note: 'Ask a question about the data. The main one.', metered: true },
    { method: 'POST', path: '/api/initialize-data', note: 'Load rows into a workspace without a file upload.' },
    { method: 'GET', path: '/api/columns', note: 'Column names of the loaded dataset.' },
];

const MODEL: Row[] = [
    { method: 'POST', path: '/api/generate-formula', note: 'Describe a calculation, get a spreadsheet formula bound to real cell ranges.', metered: true },
    { method: 'POST', path: '/api/classify-command', note: 'Classify a spreadsheet command. Returns only a validated classification object.', metered: true },
    { method: 'POST', path: '/api/orchestrate', note: 'Decompose a compound request into steps.', metered: true },
    { method: 'POST', path: '/api/extract-columns', note: 'Pull structured columns out of free text.', metered: true },
    { method: 'POST', path: '/api/generate-report', note: 'Build a PDF report.', metered: true },
];

const WORKSPACE: Row[] = [
    { method: 'POST', path: '/api/workspace', note: 'Create a workspace.' },
    { method: 'GET', path: '/api/workspace/{id}', note: 'Everything the sheet needs to restore itself.' },
    { method: 'PUT', path: '/api/workspace/{id}', note: 'Save data, sheet state, or chat messages. Only the fields sent are written.' },
    { method: 'GET', path: '/api/workspace/{id}/chats', note: 'Chat threads, newest first.' },
    { method: 'POST', path: '/api/workspace/{id}/chats', note: 'Start a thread.' },
    { method: 'GET', path: '/api/chats/{id}', note: 'One thread.' },
    { method: 'PUT', path: '/api/chats/{id}', note: 'Save messages or rename.' },
];

const SHEET: Row[] = [
    { method: 'POST', path: '/api/workspace/{id}/analyze-insights', note: 'Profile the data. Mostly computed; asks the model only for the written summary.', metered: true },
    { method: 'POST', path: '/api/workspace/{id}/smart-format', note: 'Detect column types and derive formats. Pure Python, no model call.' },
    { method: 'POST', path: '/api/workspace/{id}/quick-data-entry', note: 'Generate rows to fill a sheet.', metered: true },
    { method: 'POST', path: '/api/cancel-operation', note: 'Cancel an in-flight operation.' },
    { method: 'POST', path: '/api/reset-state', note: 'Clear server-side state.' },
    { method: 'GET', path: '/api/download-report/{id}', note: 'Download a generated report.' },
];

function Table({ rows }: { rows: Row[] }) {
    return (
        <div className="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th style={{ width: '4.5rem' }}>Method</th>
                        <th style={{ width: '17rem' }}>Path</th>
                        <th>What it does</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={`${r.method} ${r.path}`}>
                            <td>
                                <span
                                    className="font-mono text-[11px]"
                                    style={{ color: r.method === 'GET' ? 'rgba(255,255,255,0.5)' : 'var(--edi-signal)' }}
                                >
                                    {r.method}
                                </span>
                            </td>
                            <td><code>{r.path}</code></td>
                            <td>
                                {r.note}
                                {r.metered && (
                                    <span className="ml-1.5 whitespace-nowrap text-[11px] text-white/35">
                                        · metered
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function Api() {
    return (
        <>
            <div className="edi-kicker-doc">Reference</div>
            <h1>HTTP API</h1>
            <p className="lede">
                Everything the frontend calls, all same-origin under <code>/api/</code>.
                Getting those requests to the Python service is the deployment's job — a
                reverse proxy, or a platform's routing rules; in development{' '}
                <code>next.config.ts</code> proxies them to <code>BACKEND_ORIGIN</code>.
            </p>

            <div className="edi-note">
                <strong>Metered</strong> means the endpoint spends a model call and counts
                against the usage limits. Everything else — the workspace and chat
                persistence in particular — is unmetered, because the sheet writes on every
                edit and capping that at a few calls a minute would break ordinary use while
                protecting nothing.
            </div>

            <h2>Core</h2>
            <Table rows={CORE} />

            <h2>Model-backed</h2>
            <Table rows={MODEL} />

            <h2>Workspaces and chats</h2>
            <Table rows={WORKSPACE} />

            <h2>Sheet operations</h2>
            <Table rows={SHEET} />

            <h2>Health</h2>
            <p>
                <code>GET /api/health</code> is the one to reach for when something is not
                working. It reports what was actually resolved rather than what you meant to
                configure:
            </p>
            <pre><code>{`{
  "status": "healthy",
  "llm": "available",
  "llm_config": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "configured": true,
    "detail": null
  },
  "store": { "backend": "sqlite", "location": ".edi-data" },
  "limits": { "enabled": false, "daily_counters": "untested", ... }
}`}</code></pre>
            <p>
                <code>llm_config.detail</code> carries the reason when a model could not be
                built — a missing key, an unnamed model, an uninstalled provider package.
            </p>

            <h2>Errors</h2>
            <p>
                Refusals come back as JSON with a <code>detail</code> string written for the
                person who will read it. A <code>429</code> means a usage limit was hit and
                carries <code>Retry-After</code>; <code>503</code> means no model is
                configured; <code>502</code> means the model was reached but returned
                something unusable.
            </p>

            <div className="edi-note">
                <strong>FastAPI's own schema is not routed.</strong> It generates one at{' '}
                <code>/openapi.json</code>, with interactive docs at <code>/docs</code>, and
                both work when you run the backend directly. Behind a proxy that forwards
                only <code>/api/*</code> they reach the frontend instead and 404. Forward
                them too if you want them public — and consider whether you do, since they
                describe every endpoint to anyone who asks.
            </div>

            <p>
                <Link href="/docs/architecture">How it works</Link> covers what happens behind{' '}
                <code>/api/query</code>.
            </p>
        </>
    );
}
