"use client";

/**
 * The first thing a new install shows: pick the model.
 *
 * EDI does not ship a model, so on a fresh clone there is a decision to make
 * before anything works, and burying it in a dropdown means the first question
 * gets answered by whatever the backend happened to find. This asks instead.
 *
 * **When it appears** is decided by the backend, not by anything in the
 * browser. `active.source` says how the current model was arrived at:
 *
 *   saved        someone chose it here -- setup is done, never show again
 *   environment  a deployment set EDI_LLM_PROVIDER -- not this user's call
 *   detected     found on the machine, nobody has confirmed it -- ask
 *   default      nothing found and nothing set -- ask, and explain the routes
 *
 * Keeping that on the server rather than in localStorage is what makes "set up
 * once, stays set up" true: clearing site data, opening a different browser,
 * or using the app from a second machine on the same backend all still see a
 * configured install, because the answer lives in .edi-data/model.json next to
 * the workspaces rather than in whichever browser happened to do the setup.
 */

import { useEffect, useState } from 'react';
import { Check, Cpu, KeyRound, Loader2, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useModelCatalog } from '@/hooks/useModelCatalog';
import { ProviderState } from '@/utils/api';

/** What each provider is, in one line, for someone who has not met them. */
const BLURBS: Record<string, string> = {
    ollama: 'Models running on this computer. Nothing you ask or upload leaves it, and there is no bill.',
    claude: 'Claude, through the Claude Code CLI you are already signed in to. No key to paste; uses your existing subscription.',
    'openai-compatible': 'Any server speaking the OpenAI format — LM Studio, vLLM, llama.cpp, OpenRouter. Local if you point it at localhost.',
    google: 'Gemini, with an API key from Google AI Studio.',
    openai: 'GPT models, with an API key from OpenAI.',
    anthropic: 'Claude, billed per token against an Anthropic API key rather than a subscription.',
    groq: 'Open models on fast hardware, with a Groq API key.',
};

export default function ModelSetupDialog() {
    const {
        catalog, active, loading, busy, error, reload, choose, saveKey,
    } = useModelCatalog();
    const [dismissed, setDismissed] = useState(false);
    const [keyFor, setKeyFor] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState('');
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!done) return;
        const timer = setTimeout(() => setDismissed(true), 900);
        return () => clearTimeout(timer);
    }, [done]);

    // Nothing to decide until the catalog is in, and nothing to decide at all
    // unless the backend says this install is unconfigured and changeable.
    const needsSetup = Boolean(
        catalog
        && catalog.can_change
        && (active?.source === 'detected' || active?.source === 'default')
    );

    if (!needsSetup || dismissed) return null;

    const providers = catalog?.providers ?? [];
    const ready = providers.filter((p) => p.reachable && p.models.length > 0);
    const suggestion = active?.configured && active.model
        ? { provider: active.provider, model: active.model }
        : null;

    const pick = async (provider: string, model: string) => {
        if (await choose(provider, model)) setDone(true);
    };

    const submitKey = async (provider: string) => {
        if (await saveKey(provider, keyValue)) {
            setKeyValue('');
            setKeyFor(null);
        }
    };

    const renderProvider = (provider: ProviderState) => (
        <div key={provider.id} className="border-t border-white/10 px-5 py-4">
            <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-medium text-white">{provider.label}</h3>
                {provider.local && (
                    <span className="flex items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-px text-[10px] font-semibold text-emerald-300">
                        <Cpu className="h-2.5 w-2.5" />
                        on this machine
                    </span>
                )}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                {BLURBS[provider.id] ?? provider.detail}
            </p>

            {provider.models.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {provider.models.slice(0, 12).map((model) => {
                        const selected = active?.provider === provider.id && active?.model === model;
                        const working = busy === `${provider.id}:${model}`;
                        return (
                            <button
                                key={model}
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void pick(provider.id, model)}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors',
                                    'disabled:cursor-not-allowed disabled:opacity-50',
                                    selected
                                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                                        : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/10'
                                )}
                            >
                                {working && <Loader2 className="h-3 w-3 animate-spin" />}
                                {model}
                            </button>
                        );
                    })}
                    {provider.models.length > 12 && (
                        <span className="self-center text-[11px] text-white/30">
                            +{provider.models.length - 12} more in the chat box
                        </span>
                    )}
                </div>
            ) : (
                <div className="mt-2">
                    <p className="text-[12px] text-white/40">{provider.detail}</p>
                    {provider.needs_key && !provider.has_key && (
                        keyFor === provider.id ? (
                            <form
                                className="mt-2 flex items-center gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitKey(provider.id);
                                }}
                            >
                                <input
                                    autoFocus
                                    type="password"
                                    value={keyValue}
                                    onChange={(event) => setKeyValue(event.target.value)}
                                    placeholder={`${provider.label} API key`}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 rounded border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[11px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={busy !== null || !keyValue.trim()}
                                    className="rounded bg-white/10 px-3 py-1.5 text-[11px] text-white hover:bg-white/20 disabled:opacity-40"
                                >
                                    {busy === `key:${provider.id}` ? 'Checking…' : 'Save'}
                                </button>
                            </form>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { setKeyFor(provider.id); setKeyValue(''); }}
                                className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/85"
                            >
                                <KeyRound className="h-3 w-3" />
                                Add a key
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-[#0b0b0d]"
                style={{ border: '1px solid var(--edi-hairline, rgba(255,255,255,0.12))' }}
                role="dialog"
                aria-modal="true"
                aria-label="Choose a model"
            >
                <div className="px-5 pb-4 pt-5">
                    <h2 className="text-lg font-semibold text-white">Choose a model</h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
                        EDI is the spreadsheet and the plumbing; the model that answers your
                        questions is yours to pick. Here is what this computer can reach right
                        now. You can change it any time from the dropdown next to the message
                        box — this asks once.
                    </p>
                </div>

                {done && (
                    <p className="mx-5 mb-4 flex items-center gap-2 rounded-md bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-200">
                        <Check className="h-4 w-4" />
                        Set up. {active?.model} will answer your questions.
                    </p>
                )}

                {error && (
                    <p className="mx-5 mb-3 rounded-md bg-red-400/10 px-3 py-2 text-[12px] text-red-300">
                        {error}
                    </p>
                )}

                {/* The one-click path. Whatever the backend settled on already
                    works, so confirming it is a button rather than a hunt --
                    and confirming is what writes the choice down and stops
                    this dialog coming back. */}
                {suggestion && !done && (
                    <div className="mx-5 mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3">
                        <p className="text-[12px] text-white/60">
                            Found and ready to use:
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
                            <code className="font-mono text-[13px] text-white">
                                {suggestion.model}
                            </code>
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void pick(suggestion.provider, suggestion.model)}
                                className="rounded-md bg-white px-3.5 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-50"
                            >
                                {busy ? 'Setting up…' : 'Use this one'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {loading && !catalog && (
                        <p className="px-5 py-6 text-[13px] text-white/40">
                            Looking for models on this computer…
                        </p>
                    )}
                    {ready.length === 0 && !loading && (
                        <p className="mx-5 mb-2 rounded-md bg-white/[0.04] px-3 py-2.5 text-[12px] leading-relaxed text-white/50">
                            Nothing is answering yet. Install{' '}
                            <a href="https://ollama.com" className="underline">Ollama</a> and run{' '}
                            <code className="text-white/70">ollama pull qwen2.5-coder:7b</code>, sign
                            in with <code className="text-white/70">claude auth login</code>, or add
                            an API key below — then press Rescan.
                        </p>
                    )}
                    {providers.map(renderProvider)}
                </div>

                <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                    <button
                        type="button"
                        onClick={() => void reload(true)}
                        className="flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white/80"
                    >
                        <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                        Rescan
                    </button>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="text-[12px] text-white/40 hover:text-white/75"
                    >
                        {/* Not "never show again": nothing has been chosen, so
                            the install is still unconfigured and saying
                            otherwise would be a lie the next start exposes. */}
                        Decide later
                    </button>
                </div>
            </div>
        </div>
    );
}
