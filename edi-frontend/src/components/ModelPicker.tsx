"use client";

/**
 * Which model answers the questions.
 *
 * The list is not a list of what EDI supports -- it is a list of what this
 * machine can reach, asked of the machine each time the menu opens. Ollama is
 * asked which models have been pulled; the Claude Code CLI whether it is
 * signed in; a hosted provider with a key for its own catalogue. So the
 * common case is that someone opens this and their own setup is already in
 * it, selected, working.
 *
 * It lists; it does not rank. Providers appear in the order the backend
 * declares them, with the ones that can actually answer first, and there is
 * no recommended option and no default anybody has to undo. Which model suits
 * a sheet depends on the sheet, the question, the hardware and whose bill it
 * is, none of which a dropdown is in a position to know.
 *
 * Two things it is careful about:
 *
 * - **"On this machine" is a fact, not a nudge.** It is computed from the
 *   endpoint rather than the provider's name, so it is right about LM Studio
 *   on localhost versus the same provider pointed at OpenRouter. Claude does
 *   not carry it -- local binary, remote model -- because the front page
 *   makes a specific promise about where the rows go.
 * - **A key typed in here goes to the machine running the backend and is
 *   never read back.** The component can ask whether a key exists; there is
 *   no endpoint that would return one. On a public deployment the whole
 *   control surface is disabled server-side, and `can_change` says so.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu, Cloud, KeyRound, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
    ActiveModel,
    ModelCatalog,
    ProviderState,
    fetchModelCatalog,
    forgetProviderKey,
    saveProviderKey,
    selectModel,
} from '@/utils/api';

interface ModelPickerProps {
    disabled?: boolean;
    onModelChange?: (active: ActiveModel) => void;
}

/** "qwen2.5-coder:7b" is the interesting part of "qwen2.5-coder:7b"; a long
 *  hosted id like "models/gemini-2.5-flash-preview-09-2025" is not. */
function shortLabel(model: string | null): string {
    if (!model) return 'No model';
    const tail = model.split('/').pop() || model;
    return tail.length > 28 ? `${tail.slice(0, 27)}…` : tail;
}

export default function ModelPicker({ disabled = false, onModelChange }: ModelPickerProps) {
    const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [keyFor, setKeyFor] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState('');
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const keyInputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async (refresh = false) => {
        setLoading(true);
        try {
            setCatalog(await fetchModelCatalog(refresh));
            setError(null);
        } catch {
            setError('Could not reach the backend.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Once on mount, so the button names the real model rather than a
    // placeholder. Written out rather than calling load() because every
    // setState here has to happen in a callback: React's lint rule against
    // synchronous setState in an effect body is correct, and load() sets
    // `loading` on its first line.
    //
    // Re-probing when the menu opens is handled in onOpenChange instead --
    // an event handler, where calling load() directly is fine, and where it
    // belongs anyway. Starting Ollama with the app already open should not
    // need a reload to be noticed.
    useEffect(() => {
        let cancelled = false;
        fetchModelCatalog()
            .then((next) => { if (!cancelled) { setCatalog(next); setError(null); } })
            .catch(() => { if (!cancelled) setError('Could not reach the backend.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (keyFor) keyInputRef.current?.focus();
    }, [keyFor]);

    const active = catalog?.active;

    const choose = async (provider: string, model: string) => {
        setBusy(`${provider}:${model}`);
        setError(null);
        try {
            const next = await selectModel(provider, model);
            setCatalog((current) => (current ? { ...current, active: next } : current));
            onModelChange?.(next);
            setOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not switch model');
        } finally {
            setBusy(null);
        }
    };

    const submitKey = async (provider: string) => {
        if (!keyValue.trim()) return;
        setBusy(`key:${provider}`);
        setError(null);
        try {
            await saveProviderKey(provider, keyValue.trim());
            setKeyValue('');
            setKeyFor(null);
            await load(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save that key');
        } finally {
            setBusy(null);
        }
    };

    const dropKey = async (provider: string) => {
        setBusy(`key:${provider}`);
        try {
            await forgetProviderKey(provider);
            await load(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove that key');
        } finally {
            setBusy(null);
        }
    };

    const renderProvider = (provider: ProviderState) => {
        const isActive = active?.provider === provider.id;
        const canType = catalog?.can_change && provider.needs_key && !provider.has_key;

        return (
            <div key={provider.id} className="px-1 py-1.5">
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/50">
                        {provider.local
                            ? <Cpu className="h-3 w-3 text-emerald-400" />
                            : <Cloud className="h-3 w-3 text-white/35" />}
                        {provider.label}
                        {provider.local && (
                            <span className="rounded bg-emerald-400/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-emerald-300">
                                on this machine
                            </span>
                        )}
                    </div>
                    {provider.has_key && catalog?.can_change && provider.key_source === 'saved' && (
                        <button
                            type="button"
                            onClick={() => void dropKey(provider.id)}
                            className="text-[10px] text-white/35 hover:text-white/70"
                        >
                            forget key
                        </button>
                    )}
                </div>

                {provider.models.length > 0 ? (
                    <div className="flex flex-col">
                        {provider.models.map((model) => {
                            const selected = isActive && active?.model === model;
                            const working = busy === `${provider.id}:${model}`;
                            return (
                                <button
                                    key={model}
                                    type="button"
                                    disabled={!catalog?.can_change || busy !== null}
                                    onClick={() => void choose(provider.id, model)}
                                    className={cn(
                                        'flex items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-[13px]',
                                        'text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60',
                                        selected && 'bg-white/[0.07]'
                                    )}
                                >
                                    <span className="truncate font-mono text-[12px]">{model}</span>
                                    {working
                                        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/50" />
                                        : selected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="px-2 pb-1 text-[11px] leading-snug text-white/40">
                        {provider.detail}
                    </p>
                )}

                {provider.models.length > 0 && provider.detail && (
                    <p className="px-2 pt-1 text-[10px] leading-snug text-white/35">
                        {provider.detail}
                    </p>
                )}

                {canType && (
                    keyFor === provider.id ? (
                        <form
                            className="flex items-center gap-1.5 px-2 pt-1.5"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void submitKey(provider.id);
                            }}
                        >
                            <input
                                ref={keyInputRef}
                                type="password"
                                value={keyValue}
                                onChange={(event) => setKeyValue(event.target.value)}
                                placeholder={`${provider.label} API key`}
                                autoComplete="off"
                                spellCheck={false}
                                className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
                            />
                            <button
                                type="submit"
                                disabled={busy !== null || !keyValue.trim()}
                                className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20 disabled:opacity-40"
                            >
                                {busy === `key:${provider.id}` ? '…' : 'Save'}
                            </button>
                        </form>
                    ) : (
                        <button
                            type="button"
                            onClick={() => { setKeyFor(provider.id); setKeyValue(''); }}
                            className="mx-2 mt-1 flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white/80"
                        >
                            <KeyRound className="h-3 w-3" />
                            Add a key
                        </button>
                    )
                )}
            </div>
        );
    };

    const needle = filter.trim().toLowerCase();
    const matching = (catalog?.providers ?? [])
        .map((provider) => (needle
            ? { ...provider, models: provider.models.filter((m) => m.toLowerCase().includes(needle)) }
            : provider))
        // With a filter typed, a provider with nothing left is noise -- but
        // one that never had models is the thing you most need to see, since
        // it is where "add a key" lives.
        .filter((provider) => !needle || provider.models.length > 0
            || provider.label.toLowerCase().includes(needle));

    const activeIsLocal = catalog?.providers.some((p) => p.id === active?.provider && p.local);

    return (
        <DropdownMenu
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setFilter('');
                setKeyFor(null);
                if (next) void load(true);
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    disabled={disabled}
                    className="flex h-8 items-center gap-1 rounded-md pl-1 pr-2 text-xs text-white hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:ring-offset-0"
                    title={active?.model ? `${active.provider} · ${active.model}` : 'Choose a model'}
                >
                    {activeIsLocal
                        ? <Cpu className="h-4 w-4 text-emerald-400/80" />
                        : <Cloud className="h-4 w-4 opacity-70" />}
                    <span className="max-w-[9rem] truncate">{shortLabel(active?.model ?? null)}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="start"
                className="max-h-[26rem] w-[21rem] overflow-y-auto border-white/10 bg-black/95 p-0 backdrop-blur-sm"
            >
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <span className="text-[11px] uppercase tracking-wide text-white/45">
                        Model
                    </span>
                    <button
                        type="button"
                        onClick={() => void load(true)}
                        className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/80"
                    >
                        <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                        {loading ? 'Looking' : 'Rescan'}
                    </button>
                </div>

                {/* Worth having because one provider with a key can return
                    twenty-five models, and scrolling a flat list to find
                    "flash" is the wrong way to spend a click. */}
                <input
                    type="text"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter models…"
                    className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:outline-none"
                />

                {error && (
                    <p className="border-b border-white/10 px-3 py-2 text-[11px] text-red-300">{error}</p>
                )}

                {catalog && !catalog.can_change && (
                    <p className="border-b border-white/10 px-3 py-2 text-[11px] leading-snug text-white/45">
                        This deployment sets its own model. Running EDI on your own
                        machine is what puts you in charge of this list.
                    </p>
                )}

                {!catalog && loading && (
                    <p className="px-3 py-4 text-[12px] text-white/40">Looking for models…</p>
                )}

                {catalog && matching.length === 0 && (
                    <p className="px-3 py-4 text-[12px] text-white/40">
                        {needle ? 'No model matches that.' : 'No models found.'}
                    </p>
                )}

                {matching.map(renderProvider)}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
