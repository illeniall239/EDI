import Link from 'next/link';

export const metadata = {
    title: 'Quickstart',
    description: 'Clone to running on your own machine, with no accounts. '
        + 'Deploying to a server is the other, optional path.',
};

export default function Quickstart() {
    return (
        <>
            <div className="edi-kicker-doc">Start</div>
            <h1>Quickstart</h1>
            <p className="lede">
                The first path is the one to take: EDI on your own machine, with a local
                model, needing no account anywhere. The second is putting it on a server,
                which is the same thing plus a reverse proxy.
            </p>

            <h2>Prerequisites</h2>
            <ul>
                <li>Python 3.11 or newer, and Node 20 or newer.</li>
                <li>
                    A model. Either <a href="https://ollama.com">Ollama</a> running locally,
                    or an API key from any provider in{' '}
                    <Link href="/models">Choosing a model</Link>.
                </li>
            </ul>

            <h2>Local, with no accounts</h2>
            <p>
                This is the default path, and the one most people should stay on.
                Workspaces go in a local SQLite file, the model runs on your machine, and
                nothing your sheet contains crosses the network.
            </p>

            <h3>1. Backend</h3>
            <pre><code>{`git clone https://github.com/illeniall239/EDI.git
cd EDI

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\\Scripts\\activate

pip install -r backend/requirements.txt
pip install langchain-ollama==0.3.3`}</code></pre>

            <p>Pull a model and start Ollama, if it is not already running:</p>
            <pre><code>{`ollama pull qwen2.5-coder:7b
ollama serve`}</code></pre>

            <p>Check that the model can do the job before going further:</p>
            <pre><code>{`EDI_LLM_PROVIDER=ollama python backend/check_model.py`}</code></pre>

            <p>Then start the backend:</p>
            <pre><code>{`EDI_LLM_PROVIDER=ollama uvicorn main:app --reload --port 8000 --app-dir backend`}</code></pre>

            <h3>2. Frontend</h3>
            <pre><code>{`cd edi-frontend
npm install
echo "BACKEND_ORIGIN=http://127.0.0.1:8000" > .env.local
npm run dev`}</code></pre>

            <p>
                Open <code>http://localhost:3000</code>. <code>BACKEND_ORIGIN</code> is read
                server-side by <code>next.config.ts</code>, which proxies <code>/api/*</code>{' '}
                to the backend so development is same-origin, exactly as production is.
            </p>

            <div className="edi-note">
                <strong>It is not a <code>NEXT_PUBLIC_</code> variable, deliberately.</strong>{' '}
                Those are inlined into the browser bundle at build time, so a stale one keeps
                redirecting a deployed site at a host nobody remembers configuring, long
                after the config that set it is gone.
            </div>

            <h3>3. Check it came up</h3>
            <pre><code>{`curl localhost:8000/api/health`}</code></pre>
            <p>
                The reply names the provider and model it resolved, and where workspaces are
                being kept. If something is misconfigured, this is where it says so rather
                than failing quietly:
            </p>
            <pre><code>{`{
  "status": "healthy",
  "llm_config": { "provider": "ollama", "model": "qwen2.5-coder:7b", ... },
  "store": { "backend": "sqlite", "location": ".edi-data" }
}`}</code></pre>

            <h2>Deployed</h2>
            <p>
                Two long-running processes and a way for the browser to reach both. That
                is the same two commands as above plus a reverse proxy sending{' '}
                <code>/api/*</code> to the backend and everything else to Next. One
                origin, so no CORS.
            </p>
            <p>
                What the host has to give you is a disk. Workspaces are a SQLite file
                under <code>EDI_DATA_DIR</code>, so it needs to be writable and to
                survive a restart. Serverless platforms give you neither, and no two of
                their instances share one, so the app does not run there.
            </p>
            <p>
                <Link href="/self-hosting">Self-hosting</Link> goes through both: where
                workspaces live, what a public URL needs in front of it, and the Vercel
                configuration this documentation site is served by.
            </p>
        </>
    );
}
