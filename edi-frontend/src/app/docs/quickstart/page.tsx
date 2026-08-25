import Link from 'next/link';

export const metadata = {
    title: 'Quickstart',
    description: 'Clone to running, locally with no accounts or deployed to Vercel.',
};

export default function Quickstart() {
    return (
        <>
            <div className="edi-kicker-doc">Start</div>
            <h1>Quickstart</h1>
            <p className="lede">
                Two ways to run EDI. Locally it needs no accounts at all; deployed it needs
                a Supabase project, because serverless has nowhere to keep a file.
            </p>

            <h2>Prerequisites</h2>
            <ul>
                <li>Python 3.11 or newer, and Node 20 or newer.</li>
                <li>
                    A model. Either <a href="https://ollama.com">Ollama</a> running locally,
                    or an API key from any provider in{' '}
                    <Link href="/docs/models">Choosing a model</Link>.
                </li>
            </ul>

            <h2>Local, with no accounts</h2>
            <p>
                This is the default path. Workspaces go in a local SQLite file, and the
                model runs on your machine.
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
            <pre><code>{`EDI_LLM_PROVIDER=ollama EDI_LIMITS_ENABLED=0 \\
  uvicorn main:app --reload --port 8000 --app-dir backend`}</code></pre>

            <div className="edi-note">
                <strong>Why <code>EDI_LIMITS_ENABLED=0</code>.</strong> The usage caps exist
                to stop strangers spending your money on a public URL. Running locally
                against your own model there is no bill to protect, and the default of five
                questions a minute will just get in your way.
            </div>

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
                One Vercel project holds both halves, so the browser only ever makes
                same-origin requests and there is no CORS to configure.
            </p>
            <ol>
                <li>Create a Supabase project and run the migrations with <code>supabase db push</code>.</li>
                <li>Import the repo into Vercel.</li>
                <li>
                    Set <code>NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
                    <code>SUPABASE_SERVICE_ROLE_KEY</code>, and a model key such as{' '}
                    <code>GOOGLE_API_KEY</code>.
                </li>
            </ol>

            <div className="edi-note">
                <strong>Root Directory must be the repository root</strong>, not{' '}
                <code>edi-frontend/</code>. Vercel only reads <code>vercel.json</code> from
                the root directory it is given. Pointed at the subdirectory it silently
                ignores the file, serves the frontend alone, and every <code>/api/*</code>{' '}
                call lands on Next&apos;s 404 page — which looks like a broken app rather
                than a wrong setting.
            </div>

            <p>
                <Link href="/docs/self-hosting">Self-hosting</Link> covers storage, the
                usage limits, and what to change for a deployment that is not a demo.
            </p>
        </>
    );
}
