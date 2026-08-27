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

            <h2>How big a sheet it will open</h2>
            <p>
                Eleven megabytes of data, and a bigger sheet is refused with a message saying
                what would fit. That is about 100,000 rows six columns wide, 50,000 at twelve
                columns, 13,000 at forty.
            </p>
            <p>
                <strong>Of data, not of file.</strong> Nothing caps the file you upload. What
                is measured is the sheet after parsing, as the JSON the browser is handed,
                which is a different number in both directions:
            </p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>The same 100,000 x 6 sheet</th>
                            <th style={{ width: '7rem' }}>Size</th>
                            <th style={{ width: '9rem' }}>Capped?</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>as a CSV on disk</td>
                            <td>3.18 MB</td>
                            <td className="text-white/40">no</td>
                        </tr>
                        <tr>
                            <td>as an <code>.xlsx</code> on disk</td>
                            <td>2.57 MB</td>
                            <td className="text-white/40">no</td>
                        </tr>
                        <tr>
                            <td>as rows in the browser</td>
                            <td>10.05 MB</td>
                            <td style={{ color: 'var(--edi-signal)' }}>yes, against 11 MB</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                An <code>.xlsx</code> is a zip, so a 2.5 MB upload can be 10 MB of sheet. A
                workbook can also go the other way: EDI reads the first tab, so a 5 MB file of
                twenty tabs and a chart may be a tenth of a megabyte of data. A limit on
                bytes would be wrong in both cases, which is why there is not one.
            </p>

            <h3>Where the number comes from</h3>
            <p>
                The ceiling is the browser, not the server. The grid holds a JavaScript object
                per cell and runs out of memory; the backend parsed and stored 200,000 rows in
                three seconds. It is a cliff rather than a slope, so past it you get a spinner
                that never stops rather than a slow sheet, which is why it refuses instead of
                trying.
            </p>
            <p>
                Fifteen sheets were measured, one fresh browser each, timing an upload through
                to a grid that had painted and could still answer a frame. Neither rows nor
                cells predict where it falls over:
            </p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: '9rem' }}>Sheet</th>
                            <th style={{ width: '7rem' }}>Cells</th>
                            <th style={{ width: '6rem' }}>CSV</th>
                            <th style={{ width: '6rem' }}>JSON</th>
                            <th>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ['100,000 x 6', '600,000', '3.2 MB', '10.0 MB', '7.8s', true],
                            ['110,000 x 6', '660,000', '3.5 MB', '11.1 MB', '8.0s', true],
                            ['120,000 x 6', '720,000', '3.8 MB', '12.1 MB', 'never finished', false],
                            ['55,000 x 12', '660,000', '4.3 MB', '12.2 MB', 'never finished', false],
                            ['27,500 x 24', '660,000', '4.8 MB', '13.1 MB', 'never finished', false],
                            ['100,000 x 12', '1,200,000', '7.8 MB', '22.2 MB', 'never finished', false],
                        ].map(([sheet, cells, csv, json, result, ok]) => (
                            <tr key={sheet as string}>
                                <td><code>{sheet}</code></td>
                                <td className="text-white/50">{cells}</td>
                                <td className="text-white/50">{csv}</td>
                                <td>{json}</td>
                                <td style={{ color: ok ? 'var(--edi-signal)' : 'rgba(255,255,255,0.4)' }}>
                                    {result}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p>
                660,000 cells renders six columns wide and hangs at twelve, so cells are not
                it. 110,000 rows renders and 55,000 hangs, so rows are not it either. The
                JSON column is the only one with every success above every failure, and the
                cap sits at 11 MB: a tenth below the smallest sheet measured to hang.
            </p>
            <p>
                <code>EDI_MAX_DATA_MB</code> moves it, and <code>EDI_MAX_DATA_MB=0</code>{' '}
                removes it. These numbers came off one machine, and one with less memory meets
                the wall sooner.
            </p>

            <h2>Worth knowing</h2>
            <ul>
                <li>
                    Nothing caps the size of an upload, and the backend reads and parses the
                    whole file before it can measure anything. Refusing a 30 MB file takes
                    about three seconds; a file large enough to exhaust memory will do that
                    first.
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
