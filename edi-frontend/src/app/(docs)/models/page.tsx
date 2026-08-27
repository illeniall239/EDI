import Link from 'next/link';

export const metadata = {
    title: 'Choosing a model',
    description: 'Running a model on your own hardware, the hosted options if you '
        + 'want them, and how to tell whether yours is good enough.',
};

export default function Models() {
    return (
        <>
            <div className="edi-kicker-doc">Configure</div>
            <h1>Choosing a model</h1>
            <p className="lede">
                EDI is a harness. It supplies the spreadsheet, the prompts and the
                plumbing; the model is yours to pick, and the answers you get are a
                property of that choice rather than of this code. The default is{' '}
                <code>ollama</code>, on your own hardware — everything below is what to
                run there, and what the hosted alternatives cost you in exchange for being
                easier.
            </p>

            <h2>You probably do not have to configure this</h2>
            <p>
                The first time you open a new install, EDI asks which model should answer
                your questions and shows what it found on the machine. Pick one and that
                is the end of it — the choice is written next to your workspaces, so it
                survives a restart, a cleared browser and a different browser. The dialog
                only appears while nothing has been chosen.
            </p>
            <p>
                The dropdown at the bottom of the chat box lists what this machine can
                actually reach, asked fresh each time it opens: the models Ollama has
                pulled, Claude if the CLI is signed in, and any provider whose key is
                already in your environment, each under the provider it came from.
                Pick one and it takes effect on the next question — no restart, no{' '}
                <code>.env</code>.
            </p>
            <p>
                The choice is written to <code>.edi-data/model.json</code> next to your
                workspaces and survives a restart. It also <em>overrides</em> the
                environment variables below, on the grounds that a person clicking a menu
                is being more deliberate than a file they edited last month. There is a{' '}
                <strong>Reset</strong> in the same dropdown that forgets it and goes back
                to the environment.
            </p>
            <p>
                A provider with no key yet offers <strong>Add a key</strong> instead of a
                model list. What you type goes to a file on the machine running the
                backend and is never sent back to the browser — there is no endpoint that
                returns a key, only one that reports whether a key exists. Which is also
                why the whole control surface is switched off when{' '}
                <code>EDI_LIMITS_ENABLED=1</code> marks this as a public deployment: there
                the disk belongs to somebody else. <code>EDI_ALLOW_MODEL_SWITCHING</code>{' '}
                overrides that guess either way.
            </p>

            <h2>Providers</h2>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>EDI_LLM_PROVIDER</th>
                            <th>Install</th>
                            <th>Default model</th>
                            <th>Key</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>google</code></td>
                            <td><code>langchain-google-genai</code></td>
                            <td><code>gemini-2.5-flash</code></td>
                            <td><code>GOOGLE_API_KEY</code></td>
                        </tr>
                        <tr>
                            <td><code>openai</code></td>
                            <td><code>langchain-openai</code></td>
                            <td><code>gpt-4o-mini</code></td>
                            <td><code>OPENAI_API_KEY</code></td>
                        </tr>
                        <tr>
                            <td><code>anthropic</code></td>
                            <td><code>langchain-anthropic</code></td>
                            <td><code>claude-sonnet-5</code></td>
                            <td><code>ANTHROPIC_API_KEY</code></td>
                        </tr>
                        <tr>
                            <td><code>groq</code></td>
                            <td><code>langchain-groq</code></td>
                            <td><code>llama-3.3-70b-versatile</code></td>
                            <td><code>GROQ_API_KEY</code></td>
                        </tr>
                        <tr>
                            <td><code>ollama</code></td>
                            <td><code>langchain-ollama</code></td>
                            <td><code>qwen2.5-coder:7b</code></td>
                            <td>none</td>
                        </tr>
                        <tr>
                            <td><code>claude</code></td>
                            <td>the <code>claude</code> CLI</td>
                            <td><code>sonnet</code></td>
                            <td>your own login</td>
                        </tr>
                        <tr>
                            <td><code>openai-compatible</code></td>
                            <td><code>langchain-openai</code></td>
                            <td>you name one</td>
                            <td>optional</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <p>
                <code>openai-compatible</code> is one entry for the long tail — OpenRouter,
                LM Studio, vLLM, Together, llama.cpp&apos;s server. They all speak the OpenAI
                wire format, so pointing at a different <code>EDI_LLM_BASE_URL</code> is the
                whole integration. A local server with no auth needs no key.
            </p>

            <h3>Two ways to Claude</h3>
            <p>
                <code>anthropic</code> and <code>claude</code> reach the same models and
                differ only in how they authenticate. <code>anthropic</code> wants an API
                key and bills per token. <code>claude</code> wants neither: it runs the
                Claude Code CLI already on your PATH, as you, on the subscription you
                already pay for. If <code>claude auth status</code> says you are signed
                in, it appears in the picker with no setup at all — EDI never reads those
                credentials, it runs a binary that is already holding them.
            </p>
            <p>
                The picker lists the four aliases the CLI accepts —{' '}
                <code>sonnet</code>, <code>opus</code>, <code>haiku</code>,{' '}
                <code>fable</code> — each shown with the model it currently resolves
                to, so <code>sonnet · claude-sonnet-5</code> rather than{' '}
                <code>sonnet</code> alone. The alias is what gets sent, which is what
                keeps you on the current model in that tier; the version is there so you
                can see which one that is.
            </p>
            <p>
                There is nothing to read that mapping from — the ids live inside a
                250MB binary, and <code>claude models</code> is not a command, it is a
                prompt. So EDI asks the CLI the only way that works: one one-word
                completion per alias, in the background, cached against the CLI version
                and never repeated. Ordinary answers report their own model id too, so
                the mapping mostly keeps itself current for free. An alias your account
                cannot reach — a tier off your plan, or one that has hit its spend
                limit — simply shows without a version.
            </p>

            <div className="edi-note">
                <strong>Local binary, remote model.</strong> Your question and up to 200
                result rows go to Anthropic exactly as they would with an API key, so
                this is not one of the options that keeps the sheet on your machine. The
                picker marks the ones that do, and does not mark this one.
            </div>
            <p>
                On timing: about <strong>3.6 seconds per model call</strong> once warm,
                and EDI makes two per question. The first call after five idle minutes is
                slower — nearer 25 seconds — because each call is a fresh process and
                pays for the prompt cache again. EDI runs it with the agent tooling
                disabled, which is what keeps the per-call prefix at ~4,400 tokens
                instead of ~22,000; the measurements are in{' '}
                <code>backend/claude_code_llm.py</code>.
            </p>

            <h2>Configuring</h2>
            <pre><code>{`EDI_LLM_PROVIDER=ollama
EDI_LLM_MODEL=llama3.1:8b
EDI_LLM_BASE_URL=http://localhost:11434   # ollama / openai-compatible
EDI_LLM_API_KEY=...                       # or the provider's usual name
EDI_LLM_MAX_TOKENS=8192`}</code></pre>

            <p>
                Only <code>EDI_LLM_PROVIDER</code> and a key are usually needed; every
                provider carries a default model. What happens when you set none of it is
                worth knowing, because it is what a fresh clone does — EDI resolves in
                this order:
            </p>
            <ol>
                <li>a model chosen in the picker, if there is one;</li>
                <li><code>EDI_LLM_PROVIDER</code>, which is how a deployment is pinned;</li>
                <li><code>GOOGLE_API_KEY</code> on its own — unchanged from before there
                    was a registry, so an existing deployment that sets only that keeps
                    resolving to Gemini;</li>
                <li>whatever on this machine answers first.</li>
            </ol>
            <p>
                Step 4 is the one that matters on a clean checkout: it is what makes a
                fresh clone answer questions without being configured first.{' '}
                &quot;First&quot; there is the order the provider table declares them,
                and whatever it lands on is a starting point — the picker changes it in
                a click. <code>GET /api/health</code> reports which step produced the
                answer, under <code>llm_config.source</code>.
            </p>

            <p>
                Install only the provider you use — the imports in{' '}
                <code>backend/llm_providers.py</code> are lazy, so an uninstalled one costs
                nothing:
            </p>
            <pre><code>{`pip install langchain-ollama==0.3.3`}</code></pre>

            <div className="edi-note">
                <strong>Pin to the 0.3.x line.</strong> The 1.x releases of the{' '}
                <code>langchain-*</code> packages moved modules that{' '}
                <code>langchain 0.3.19</code> still imports. An unpinned{' '}
                <code>pip install langchain-ollama</code> pulls <code>langchain-core</code>{' '}
                up to 1.x and the backend stops importing entirely, with a{' '}
                <code>ModuleNotFoundError</code> that does not obviously point back here.
            </div>

            <h2>What the harness asks of a model</h2>
            <p>
                Four things, in the order they are hit. A model that cannot do the earlier
                ones never reaches the later ones:
            </p>
            <ol>
                <li>
                    <strong>Follow a system message.</strong> Every call is a plain
                    completion — there is no tool calling and no structured-output binding
                    anywhere in this app.
                </li>
                <li>
                    <strong>Return strict JSON on request.</strong> Structured replies are
                    produced by asking for JSON and parsing what comes back. Fences are
                    stripped and a stray object is recovered from surrounding prose, but a
                    model that answers in paragraphs will not get far.
                </li>
                <li>
                    <strong>Route the question.</strong> Before any SQL is written, EDI
                    decides whether your message is about the data or is ordinary
                    conversation. Get that wrong and even a model that writes flawless SQL
                    never gets asked for any — it replies that it does not have the
                    information.
                </li>
                <li>
                    <strong>Write SQL.</strong> The load-bearing one, and the one where a
                    weak model hurts most: bad SQL does not raise an error, it returns a
                    confident wrong number.
                </li>
            </ol>

            <h2>Reasoning models</h2>
            <p>
                Models that work out loud &mdash; DeepSeek-R1, QwQ, Qwen3 in thinking mode,
                OpenAI&apos;s o-series, Claude with extended thinking &mdash; work here.
                Their working is removed before anything reads the reply, because nothing
                downstream expects it: the chart path parses the reply as JSON, and the
                read-only SQL check tests that the query starts with <code>SELECT</code>{' '}
                rather than with a paragraph of deliberation.
            </p>
            <p>
                Servers disagree about where the working goes, so all three shapes are
                handled:
            </p>
            <ul>
                <li>
                    <strong>A separate field.</strong> Ollama returns it as{' '}
                    <code>message.thinking</code>, and as <code>reasoning</code> on its
                    OpenAI-compatible route; Anthropic returns a <code>thinking</code>{' '}
                    content block. The reply text is already clean.
                </li>
                <li>
                    <strong>Inline tags.</strong> llama.cpp&apos;s server, LM Studio and
                    vLLM leave <code>&lt;think&gt;&hellip;&lt;/think&gt;</code> in the
                    message. The block is stripped.
                </li>
                <li>
                    <strong>A closing tag with no opening one.</strong> The commonest shape
                    and the least obvious: chat templates usually prefill{' '}
                    <code>&lt;think&gt;</code> into the prompt, so the model emits only the{' '}
                    <code>&lt;/think&gt;</code>. Everything up to it is treated as working.
                </li>
            </ul>
            <p>
                <strong>Unsupported parameters are dropped.</strong> OpenAI&apos;s o-series
                and gpt-5 reject a custom <code>temperature</code>, and want{' '}
                <code>max_completion_tokens</code> where other models want{' '}
                <code>max_tokens</code> &mdash; sending the wrong one fails the request
                outright rather than being ignored. Those models are recognised by name and
                sent what they accept.
            </p>

            <div className="edi-note">
                <strong>Do not turn thinking off to make it faster.</strong> It is the
                obvious move and it backfires. Qwen3 with Ollama&apos;s{' '}
                <code>think: false</code> does not stop reasoning &mdash; it reasons in the
                answer instead, as plain prose, and the server stops separating it out for
                you. You trade a clean reply for a messy one and save nothing. Leave
                thinking on, or pick a non-reasoning model.
            </div>

            <h3>They are slower, and rarely worth it here</h3>
            <p>
                The work this
                app asks of a model is short and well-specified: write one SQL query,
                return one JSON object, answer with one word. On <code>qwen3:4b</code>,
                a one-line <code>GROUP BY</code> took 713 characters of thinking to produce
                54 characters of SQL, and a question that a non-reasoning model of the same
                size answers in seconds took around two minutes. Those tokens are billed
                and waited on without changing the answer. An instruction- or code-tuned
                model of the same size is usually the better choice; reach for reasoning
                when questions genuinely need several steps.
            </p>
            <p>
                Budget for the wait, too. A reasoning model on modest hardware can take
                minutes on a single question, and anything sitting between the browser and
                the backend needs to allow for that. The bundled dev proxy is set to ten
                minutes; a reverse proxy of your own will have its own timeout, usually 30
                or 60 seconds, and a request cut off there looks to the user exactly like
                the app being broken.
            </p>

            <h2>Running it on your own hardware</h2>
            <p>
                Ollama is the one provider where the machine is yours, so it is the one
                with anything to say about GPUs and memory. It decides all of this for
                itself and is usually right; these are for when it is not. All are
                optional, and unset means Ollama chooses.
            </p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Variable</th><th>What it does</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>EDI_OLLAMA_NUM_GPU</code></td>
                            <td>
                                How many layers to put on the GPU. <code>0</code> forces
                                CPU — worth having when the card is busy with something
                                else. Fewer layers than the model has means the rest runs
                                on the CPU, which is slower but fits.
                            </td>
                        </tr>
                        <tr>
                            <td><code>EDI_OLLAMA_NUM_THREAD</code></td>
                            <td>CPU threads. Only matters for whatever is not on the GPU.</td>
                        </tr>
                        <tr>
                            <td><code>EDI_OLLAMA_NUM_CTX</code></td>
                            <td>
                                Context window. See below — this one can change answers,
                                not just speed.
                            </td>
                        </tr>
                        <tr>
                            <td><code>EDI_OLLAMA_KEEP_ALIVE</code></td>
                            <td>
                                How long the weights stay loaded after a request,
                                e.g. <code>30m</code>. Ollama unloads after five minutes
                                and the reload is paid by whoever asks the next question.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                <code>GET /api/health</code> reports whichever of these are set, under{' '}
                <code>llm_config.runtime</code>. An empty value there means every choice
                was left to Ollama. Anything your version of the client does not accept is
                dropped with a line in the log rather than failing to start.
            </p>
            <p>
                There is no switch here for turning thinking off, on purpose. It is the
                first thing anyone reaches for and it makes the answer worse rather than
                faster, for the reason in the note above — and{' '}
                <code>langchain-ollama</code> did not accept the argument at all until
                0.3.4, a release that wants a <code>langchain-core</code> this backend
                cannot import. If you want a model that does not think, use one.
            </p>

            <div className="edi-note">
                <strong>A context too small does not fail, it truncates.</strong> The SQL
                prompt carries your sheet&apos;s schema and a few sample rows, so it grows
                with the width of the sheet. If it does not fit the context, the front of
                it is dropped — which is the end holding the schema — and the model writes
                confident SQL against columns it can no longer see. If answers on a wide
                sheet are wrong in ways that look like the model guessing at column names,
                raise <code>EDI_OLLAMA_NUM_CTX</code> before blaming the model. A larger
                context costs memory, so raise it until it fits rather than as far as it
                will go.
            </div>

            <h3>Is it actually on the GPU?</h3>
            <p>
                Ollama will quietly fall back to the CPU — an unsupported card, a driver
                it does not like, a model too big for the memory available. Ask it:
            </p>
            <pre><code>{`curl http://localhost:11434/api/ps`}</code></pre>
            <p>
                Compare <code>size_vram</code> against <code>size</code>. Equal means all
                of it is on the GPU; zero means none of it is, and you are on the CPU
                whatever the card in the machine. Nothing is loaded at all until the first
                request, so ask a question first.
            </p>

            <h2>Testing yours</h2>
            <p>
                Rather than trusting a recommendation, measure the model you actually have:
            </p>
            <pre><code>{`python backend/check_model.py`}</code></pre>
            <p>It reads the same environment the app does, and reports on each of the four:</p>
            <pre><code>{`  provider   ollama
  model      qwen2.5-coder:7b
  endpoint   http://localhost:11434

  PASS  reachable      2.1s  OK
  PASS  strict JSON    0.5s  {"intent": "filter", "confidence": 0.9}
  PASS  SQL            0.5s  SELECT SUM(revenue) ... -> 1500.5
  PASS  routing        0.4s  3/3 routed correctly`}</code></pre>

            <p>
                The SQL check runs the query it gets back against a small fixture and
                compares the number, rather than eyeballing whether the SQL looks plausible.
            </p>

            <div className="edi-note">
                <strong>A pass is a floor, not a guarantee.</strong> These prompts are short
                and unambiguous; the app&apos;s real ones are much longer and carry
                conversation history. A model can clear every check and still lose the
                thread in use — we have seen exactly that. Treat a failure as decisive and a
                pass as &ldquo;worth trying&rdquo;.
            </div>

            <h2>Picking well</h2>
            <ul>
                <li>
                    <strong>Hosted models are the safe default.</strong> If you want it to
                    just work, use a current model from any provider above.
                </li>
                <li>
                    <strong>Local models vary enormously.</strong> Instruction- and
                    code-tuned models do far better here than chat- or roleplay-tuned ones
                    of the same size, because three of the four demands above are
                    format-following rather than conversation.
                </li>
                <li>
                    <strong>Bigger helps most at routing.</strong> That step is where small
                    models most often fail in a way that looks like the app being broken.
                </li>
                <li>
                    <strong>Everything is one call.</strong> There is no agent loop and no
                    retry storm, so a slower local model costs you latency, not multiplied
                    tokens.
                </li>
            </ul>

            <p>
                <Link href="/architecture">How it works</Link> traces exactly where each
                of these calls happens.
            </p>
        </>
    );
}
