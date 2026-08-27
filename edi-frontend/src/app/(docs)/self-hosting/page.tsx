import Link from 'next/link';

export const metadata = {
    title: 'Self-hosting',
    description: 'Where workspaces live, and what changes when you put EDI '
        + 'somewhere other than your own machine.',
};

export default function SelfHosting() {
    return (
        <>
            <div className="edi-kicker-doc">Configure</div>
            <h1>Self-hosting</h1>
            <p className="lede">
                Everything here is optional. Run EDI on your own machine and the local
                SQLite store is already doing the job. This page is for the other case:
                putting it on a server, where the storage changes, the data leaves your
                machine, and a public URL can spend your money.
            </p>

            <h2>Storage</h2>
            <p>
                A SQLite file, holding workspaces, chats and the usage counters. It
                writes to <code>EDI_DATA_DIR</code>, <code>./.edi-data/</code> by
                default. There is nothing to provision, no migration to run and no
                second set of credentials to keep out of the browser bundle.
            </p>

            <div className="edi-note">
                <strong>Which means the host needs a disk.</strong> Vercel Functions, as
                one example, have a read-only filesystem apart from <code>/tmp</code>,
                which does not survive between invocations, and two consecutive requests
                are not guaranteed to reach the same instance. Whichever one handled your
                upload is rarely the one handling your next question, so there is nowhere
                for a workspace to live. A VPS, a container with a volume, or any host
                that gives you persistent storage is fine.
            </div>

            <p>
                There used to be a Postgres backend beside this one, through Supabase,
                for exactly that case. It went with the hosted app it existed to serve.
                What it cost was a schema to provision, a service-role key to keep
                server-side, a row-level-security posture to explain, and a setup path
                that was never verified end to end. The seam it left is still in{' '}
                <code>backend/stores/</code>, so a second store is one module and one
                import rather than a hunt through the app.
            </p>

            <h2>Deploying</h2>
            <p>
                Two processes, a Python ASGI app and a Next.js app, so host them the way
                you host those. Nothing in this project is written for a particular
                platform. What it needs from wherever you put it is three things:
            </p>
            <ul>
                <li>
                    <strong>A disk.</strong> Somewhere writable that survives a restart,
                    for the SQLite file the workspaces live in.
                </li>
                <li>
                    <strong>A route from the browser to the API.</strong> Simplest is one
                    origin: a reverse proxy sending <code>/api/*</code> to the Python process
                    and everything else to Next. Then CORS never enters into it.
                </li>
                <li>
                    <strong>A model</strong>: a provider key, or an Ollama the backend can
                    reach.
                </li>
            </ul>
            <pre><code>{`uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend
cd edi-frontend && npm run build && npm start`}</code></pre>

            <h3>Separate domains</h3>
            <p>
                If the frontend and the API are not on one origin, name the origins the
                browser will be on:
            </p>
            <pre><code>{`EDI_CORS_ORIGINS=https://edi.example.com,https://staging.example.com`}</code></pre>
            <p>
                A wildcard is refused rather than accepted with a warning. It used to be the
                default here, and what it meant in practice was that any page on the
                internet could call this API from a visitor&apos;s browser, including the
                endpoints that spend model calls.
            </p>

            <h3>Vercel, as one worked example</h3>
            <p>
                <code>vercel.json</code> is in the repository because it is what this
                site runs on. Only Vercel reads it, so it costs nothing if you deploy elsewhere,
                and it is worth copying the shape: both halves as services of one project,{' '}
                <code>/api/*</code> to Python, everything else to Next, one domain, no CORS.
            </p>

            <div className="edi-note">
                <strong>Root Directory must be the repository root.</strong> Vercel only reads{' '}
                <code>vercel.json</code> from the directory it is given. Pointed at{' '}
                <code>edi-frontend/</code> it ignores the file, serves the frontend alone, and
                every API call hits Next&apos;s 404 page.
            </div>

            <h3>Deploying the documentation without the app</h3>
            <p>
                This site is that deployment. The app is at <code>/app</code>, and it is
                there in every clone; what the hosted copy does is redirect it away, because
                an empty spreadsheet asking a stranger for a file they have not got is a
                worse landing page than the documentation. One variable at build time:
            </p>
            <pre><code>{`EDI_DOCS_ONLY=1`}</code></pre>
            <p>
                Read by <code>edi-frontend/next.config.ts</code>, not the backend, so it
                belongs in the frontend&apos;s environment. Unset, which is the default and
                what you get by cloning, <code>/app</code> serves the whole application. It
                is not inferred from being on Vercel: deploying the real app there is a
                supported setup, and guessing would break it.
            </p>

            <h2>Putting it on a public URL</h2>
            <p>
                Put authentication in front of it. A reverse proxy asking for a password
                is the whole answer, and it is a better one than any setting this project
                could offer.
            </p>
            <p>
                There are no usage caps. There used to be, sized for a public demo that no
                longer exists, and every one of them was off unless you switched it on. On
                your own machine they were an obstacle and nothing else: your model, your
                key, your bill.
            </p>
            <p>
                Which leaves the shape of a public deployment plain, and worth stating
                rather than mitigating badly. There is no sign-up, so every visitor is
                anonymous. Every question is a model call charged to you, and nothing
                counts them. Anyone who knows a workspace UUID can open it. And the model
                picker will let a visitor repoint the backend or store a key on your disk
                unless you turn it off:
            </p>
            <pre><code>{`EDI_ALLOW_MODEL_SWITCHING=0`}</code></pre>
            <p>
                That last one is worth setting even behind a password, because it is the
                only one where a visitor&apos;s action lands on your filesystem.
            </p>

            <h2>Worth knowing</h2>
            <ul>
                <li>
                    Sheets are capped at 11 MB of data and a bigger one is refused, which is
                    about 100,000 rows six columns wide, 50,000 at twelve columns, 13,000 at
                    forty. The ceiling is the browser rather than the server: the grid holds
                    an object per cell and runs out of memory, while the backend parsed and
                    stored 200,000 rows in three seconds. Set <code>EDI_MAX_DATA_MB</code> to
                    move the cap, or <code>EDI_MAX_DATA_MB=0</code> to remove it.
                </li>
                <li>
                    Anyone who knows a workspace UUID can open it. They are unguessable, but
                    this is not access control. Do not put anything sensitive in a deployment
                    you have shared.
                </li>
                <li>
                    The <code>@univerjs/*</code> packages are pinned to one version by an{' '}
                    <code>overrides</code> block in <code>edi-frontend/package.json</code>.
                    Upgrading one without the rest breaks the spreadsheet.
                </li>
            </ul>

            <p>
                <Link href="/architecture">How it works</Link> explains why the backend is
                stateless and what that costs.
            </p>
        </>
    );
}
