import Link from 'next/link';

export const metadata = {
    title: 'Self-hosting',
    description: 'Storage backends, deployment, and the usage limits.',
};

export default function SelfHosting() {
    return (
        <>
            <div className="edi-kicker-doc">Configure</div>
            <h1>Self-hosting</h1>
            <p className="lede">
                Where workspaces live, how to deploy, and how to stop a public URL spending
                your money.
            </p>

            <h2>Storage</h2>
            <p>Two backends behind one set of functions:</p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>EDI_STORE</th>
                            <th>Keeps data in</th>
                            <th>Use when</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>sqlite</code></td>
                            <td>a local file</td>
                            <td>running on your own machine or any server with a disk</td>
                        </tr>
                        <tr>
                            <td><code>supabase</code></td>
                            <td>Postgres</td>
                            <td>serverless, or more than one instance</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <p>
                The choice is made for you unless you state it: a{' '}
                <code>SUPABASE_SERVICE_ROLE_KEY</code> in the environment selects Supabase,
                since configuring one is a clear statement of intent, and its absence selects
                the local file. <code>EDI_STORE</code> overrides both. The local store writes
                to <code>EDI_DATA_DIR</code>, <code>./.edi-data/</code> by default.
            </p>

            <div className="edi-note">
                <strong>SQLite will not work on serverless.</strong> Vercel Functions have a
                read-only filesystem apart from <code>/tmp</code>, which does not survive
                between invocations, and two consecutive requests are not guaranteed to reach
                the same instance. Whichever instance handled your upload is rarely the one
                that handles your next question — so the dataset has to live somewhere both
                can see.
            </div>

            <h2>Supabase setup</h2>
            <pre><code>{`supabase db push`}</code></pre>
            <p>Three migrations, in order:</p>
            <ul>
                <li>
                    <code>20240101000000_baseline_schema.sql</code> — creates{' '}
                    <code>workspaces</code> and <code>chats</code>. Every statement is
                    guarded, so it is safe to run against a project that already has them.
                </li>
                <li>
                    <code>20260823000000_remove_auth_requirement.sql</code> — makes workspaces
                    ownerless, since there is no sign-in.
                </li>
                <li>
                    <code>20260824000000_usage_counters.sql</code> — the counters the daily
                    caps are enforced with.
                </li>
            </ul>

            <p>
                Row-level security is enabled on every table with <strong>no policies at
                all</strong>. That looks like an oversight and is not. The anon key ships
                inside the browser bundle by design, so any policy written for it is a policy
                written for the public. The browser never queries these tables — every read
                and write goes through the backend with the service-role key, which bypasses
                RLS. Closed by default is the correct posture here; opening it up is what
                would be the bug.
            </p>

            <h2>Deploying</h2>
            <p>
                <code>vercel.json</code> declares both halves as services of one project:
                Next.js from <code>edi-frontend/</code>, FastAPI from <code>backend/</code>,
                with <code>/api/*</code> routed to Python and everything else to Next. They
                end up on one domain, so the browser only makes same-origin requests and
                there is no CORS to configure.
            </p>

            <div className="edi-note">
                <strong>Root Directory must be the repository root.</strong> Vercel only reads{' '}
                <code>vercel.json</code> from the directory it is given. Pointed at{' '}
                <code>edi-frontend/</code> it ignores the file, serves the frontend alone, and
                every API call hits Next&apos;s 404 page.
            </div>

            <h2>Usage limits</h2>
            <p>
                A public link with no sign-up means every question is a model call charged to
                whoever deployed it. <code>backend/limits.py</code> holds the whole policy:
            </p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Limit</th><th>Default</th><th>Variable</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Questions per visitor per minute</td>
                            <td>5</td>
                            <td><code>EDI_BURST_CALLS</code>, <code>EDI_BURST_WINDOW_SECONDS</code></td>
                        </tr>
                        <tr>
                            <td>Questions per visitor per day</td>
                            <td>50</td>
                            <td><code>EDI_DAILY_CALLS_PER_VISITOR</code></td>
                        </tr>
                        <tr>
                            <td>Questions per day, everyone</td>
                            <td>1000</td>
                            <td><code>EDI_DAILY_CALLS_TOTAL</code></td>
                        </tr>
                        <tr>
                            <td>Question length</td>
                            <td>2000 chars</td>
                            <td><code>EDI_MAX_QUESTION_CHARS</code></td>
                        </tr>
                        <tr>
                            <td>Upload size</td>
                            <td>4 MB</td>
                            <td><code>EDI_MAX_UPLOAD_BYTES</code></td>
                        </tr>
                        <tr>
                            <td>Rows / columns</td>
                            <td>20000 / 100</td>
                            <td><code>EDI_MAX_ROWS</code>, <code>EDI_MAX_COLUMNS</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <p>
                The per-visitor limits are keyed on client IP, which bounds what one person
                does casually but is not an identity. The <strong>global</strong> daily cap is
                what actually bounds the bill, because it counts calls rather than callers and
                so survives rotated IPs and cleared browser storage.
            </p>

            <p>
                Daily counters live in the database rather than process memory: serverless
                instances share no state, so an in-memory counter only ever sees the traffic
                that happened to land on that instance.
            </p>

            <div className="edi-note">
                <strong>They fail open.</strong> If the <code>usage_counters</code> migration
                has not been applied the app still works, protected only by the per-instance
                burst limit. <code>GET /api/health</code> reports which of the two you are
                actually running under — <code>&quot;daily_counters&quot;</code> reads{' '}
                <code>&quot;unavailable&quot;</code> when the migration is missing, and{' '}
                <code>&quot;untested&quot;</code> when no question has been asked yet.
            </div>

            <p>
                Set <code>EDI_LIMITS_ENABLED=0</code> to switch it all off. Reasonable against
                your own local model; not reasonable on anything with a public URL.
            </p>

            <h2>Other limits worth knowing</h2>
            <ul>
                <li>
                    Vercel caps a request or response body at <strong>4.5 MB</strong>, which is
                    why the upload limit is 4 MB. Larger files need the backend hosted
                    somewhere without that cap.
                </li>
                <li>
                    Anyone who knows a workspace UUID can open it. They are unguessable, but
                    this is not access control — do not put anything sensitive in a deployment
                    you have shared.
                </li>
                <li>
                    The <code>@univerjs/*</code> packages are pinned to one version by an{' '}
                    <code>overrides</code> block in <code>edi-frontend/package.json</code>.
                    Upgrading one without the rest breaks the spreadsheet.
                </li>
            </ul>

            <p>
                <Link href="/docs/architecture">How it works</Link> explains why the backend is
                stateless and what that costs.
            </p>
        </>
    );
}
