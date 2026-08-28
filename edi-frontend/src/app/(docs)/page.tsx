import Link from 'next/link';

export const metadata = {
    // The layout supplies the "· EDI.ai" suffix; `absolute` opts this one page
    // out of it so the landing page is not "EDI.ai · EDI.ai".
    title: { absolute: 'EDI.ai · your data, your model, your machine' },
    description:
        'Ask CSV and Excel files questions in plain English, answered by a model '
        + 'running on your own machine. No account, no API key, nothing uploaded.',
};

export default function DocsHome() {
    return (
        <>
            <div className="edi-kicker-doc">Overview</div>
            <h1>Your data, your model, your machine.</h1>
            <p className="lede">
                Open a CSV or Excel file and ask it things in plain English: filter it,
                clean it, chart it, write formulas for it, or have it explained back to
                you. You pick the model, and by default it runs on your own hardware.
                No account, no API key, nothing uploaded. The cloud is there if you want
                it, and off by default.
            </p>

            <video
                className="mt-8 block w-full rounded-xl"
                style={{ background: '#08080a', border: '1px solid var(--edi-hairline)' }}
                autoPlay
                loop
                muted
                playsInline
                /* Muted autoplay is permitted nearly everywhere, so this
                   plays on its own. `controls` is the fallback for where it
                   is not -- iOS in low power mode, a strict Firefox setting,
                   data saver -- which would otherwise leave a poster frame
                   and no way to start it. `metadata` so the scrubber knows
                   the duration before anyone touches it. */
                controls
                preload="metadata"
                poster="/edi-demo-poster.jpg"
                aria-label="Asking a spreadsheet which region earned most, following that up, adding a formula column, charting revenue by product, sorting the rows and pivoting revenue by region and product onto a new sheet -- all from the chat, answered by a model on the same machine"
            >
                {/* WebM first, which is the usual order but was not always
                    the right one here. On an earlier recording VP9 came
                    out larger than H.264 however it was tuned, so the mp4
                    led. It has won on every take since: 5.75MB against
                    7.32MB on this one, at the settings in the build script.
                    Measured per recording, because the answer changed once
                    and could change again. */}
                <source src="/edi-demo.webm" type="video/webm" />
                <source src="/edi-demo.mp4" type="video/mp4" />
            </video>

            <h2>What it does</h2>
            <p>
                A question typed into the sidebar becomes read-only SQL, run against your
                sheet, and the result comes back as prose, or as a chart when the answer
                is shaped like one. Asking it to filter, sort, clean or reformat the sheet
                works the same way: the chat is the whole interface, and everything the app
                does goes through it. <Link href="/asking">What you can ask</Link> lists
                what that covers today, and what it does not.
            </p>
            <p>
                Nothing is written to disk while it runs, and charts are returned as data
                rather than images, which is what lets the whole thing work on serverless
                functions.
            </p>

            <h2>Local sheet, local model</h2>
            <p>
                Both halves run on your machine, and that is the default rather than a
                mode you switch into: <a href="https://ollama.com">Ollama</a> on{' '}
                <code>localhost:11434</code> answers the questions, a local SQLite file
                holds the workspaces. Nothing your sheet contains crosses the network.
                Not the rows, not the column names, not the question you asked. There is
                no account to make and no key to paste, because there is nobody on the
                other end.
            </p>
            <p>
                That matters for the spreadsheets people actually have: salaries, patient
                lists, client records, anything under an NDA, anything an employer&apos;s
                policy says cannot be pasted into a chat window. The usual answer to those
                is that you cannot use this kind of tool at all.
            </p>

            <h3>If you do point it at a hosted model</h3>
            <p>
                Then be clear-eyed about what travels, because it is more than the
                question. Per question, a hosted provider receives:
            </p>
            <ul>
                <li>the question you typed, and the last few messages of the conversation;</li>
                <li>your column names, plus the distinct values of small text columns
                    when it draws a chart, so it does not invent categories;</li>
                <li>up to 200 rows of that query&apos;s results, with totals computed
                    locally over all of them;</li>
                <li>on the pandas path, the first five rows of the sheet.</li>
            </ul>
            <p>
                None of that is unusual for a tool like this, and all of it is avoidable by
                staying local. It is written down here because &quot;your data stays
                private&quot; is a claim worth being precise about, in both directions.
            </p>

            <h2>You still bring the model</h2>
            <p>
                Local is the default, not the limit. EDI is a harness: it talks to a local
                model through <strong>Ollama</strong>, to anything speaking the
                OpenAI-compatible wire format (LM Studio, vLLM, llama.cpp, OpenRouter),
                to <strong>Claude</strong> through the CLI you are already signed in
                to, or to Google, OpenAI, Anthropic and Groq. Pick one, and the quality
                of the answers follows from that choice rather than from anything in this
                repo.
            </p>
            <p>
                Picking is a dropdown in the chat box, not a config file. It lists what
                your machine can actually reach: the models Ollama has pulled, Claude if
                the CLI is signed in, any provider whose key is already in your
                environment, each listed under the provider it came from. It switches
                between them without a restart. A key typed in there is written to a file
                next to your workspaces and never sent back to the browser.{' '}
                <Link href="/models">Choosing a model</Link> has the rest.
            </p>
            <div className="edi-note">
                <strong>That cuts both ways.</strong> A weak model does not error. It
                answers confidently and wrongly. Before trusting a model you have not used
                here, run <code>python backend/check_model.py</code>, which tests the four
                things this app actually asks of one. See{' '}
                <Link href="/models">Choosing a model</Link>.
            </div>

            <h2>Running it with no accounts</h2>
            <p>
                There is nothing to configure for the local path; it is what you get by
                default. Six lines, none of which asks you for a key:
            </p>
            <pre><code>{`git clone https://github.com/illeniall239/EDI.git
cd EDI
pip install -r backend/requirements.txt
pip install langchain-ollama==0.3.3

ollama serve
EDI_LLM_PROVIDER=ollama uvicorn main:app --app-dir backend --port 8000`}</code></pre>
            <p>
                The <Link href="/quickstart">Quickstart</Link> covers the frontend and
                the hosted path as well.
            </p>

            <h2>Built on Univer</h2>
            <p>
                The spreadsheet is <a href="https://univer.ai">Univer</a>, an open-source
                office suite under Apache-2.0. EDI is a harness around it rather than a
                spreadsheet of its own: every cell, formula, filter and sort you touch is
                Univer&apos;s work. What this project adds is the part that answers
                questions about what is in those cells, and the adapter that lets a model
                edit the sheet the way you would, through the same API.
            </p>
            <p>
                Alongside it: <a href="https://nextjs.org">Next.js</a> and{' '}
                <a href="https://react.dev">React</a> for the interface,{' '}
                <a href="https://recharts.org">Recharts</a> for the charts,{' '}
                <a href="https://fastapi.tiangolo.com">FastAPI</a> and{' '}
                <a href="https://pandas.pydata.org">pandas</a> on the server, and{' '}
                <a href="https://www.langchain.com">LangChain</a> for one interface across
                the model providers.
            </p>

            <h2>Where to go next</h2>
            <ul>
                <li>
                    <Link href="/quickstart">Quickstart</Link>: clone to running on
                    your own machine, in about five minutes.
                </li>
                <li>
                    <Link href="/asking">What you can ask</Link>: the questions and
                    commands it handles, tested against a real sheet.
                </li>
                <li>
                    <Link href="/models">Choosing a model</Link>: what to run locally,
                    the hosted options, and how to tell whether yours is good enough.
                </li>
                <li>
                    <Link href="/self-hosting">Self-hosting</Link>, optional: what
                    changes when EDI lives somewhere other than your machine.
                </li>
                <li>
                    <Link href="/architecture">How it works</Link>: what happens between
                    a question and an answer.
                </li>
                <li>
                    <Link href="/http-api">HTTP API</Link>: the endpoints.
                </li>
            </ul>
        </>
    );
}
