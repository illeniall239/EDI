"use client";

/**
 * The model list, and the four things anyone does to it.
 *
 * Shared by the dropdown in the chat box and the setup dialog on first run.
 * They show the same providers and write the same file, so they read from one
 * place rather than two that agree until they do not.
 */

import { useCallback, useEffect, useState } from 'react';

import {
    ActiveModel,
    ModelCatalog,
    fetchModelCatalog,
    forgetProviderKey,
    saveProviderKey,
    selectModel,
} from '@/utils/api';

export interface UseModelCatalog {
    catalog: ModelCatalog | null;
    active: ActiveModel | undefined;
    loading: boolean;
    /** `provider:model` or `key:provider` while that row is being acted on. */
    busy: string | null;
    error: string | null;
    setError: (message: string | null) => void;
    reload: (refresh?: boolean) => Promise<void>;
    choose: (provider: string, model: string) => Promise<ActiveModel | null>;
    saveKey: (provider: string, apiKey: string) => Promise<boolean>;
    dropKey: (provider: string) => Promise<void>;
}

export function useModelCatalog(): UseModelCatalog {
    const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async (refresh = false) => {
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

    // Spelled out rather than calling reload(), because every setState here
    // has to happen in a callback: React's rule against synchronous setState
    // in an effect body is right, and reload() sets `loading` on its first
    // line. Callers refresh from event handlers, where reload() is fine.
    useEffect(() => {
        let cancelled = false;
        fetchModelCatalog()
            .then((next) => { if (!cancelled) { setCatalog(next); setError(null); } })
            .catch(() => { if (!cancelled) setError('Could not reach the backend.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const choose = useCallback(async (provider: string, model: string) => {
        setBusy(`${provider}:${model}`);
        setError(null);
        try {
            const next = await selectModel(provider, model);
            // Patched in rather than re-fetched: the answer is already here,
            // and a round trip would make the tick appear late.
            setCatalog((current) => (current ? { ...current, active: next } : current));
            // Returned rather than left for the caller to read off `catalog`:
            // that value is the one captured when the handler was created, so
            // a caller reading it back would get the model it just replaced.
            return next;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not switch model');
            return null;
        } finally {
            setBusy(null);
        }
    }, []);

    const saveKey = useCallback(async (provider: string, apiKey: string) => {
        if (!apiKey.trim()) return false;
        setBusy(`key:${provider}`);
        setError(null);
        try {
            await saveProviderKey(provider, apiKey.trim());
            await reload(true);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save that key');
            return false;
        } finally {
            setBusy(null);
        }
    }, [reload]);

    const dropKey = useCallback(async (provider: string) => {
        setBusy(`key:${provider}`);
        try {
            await forgetProviderKey(provider);
            await reload(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove that key');
        } finally {
            setBusy(null);
        }
    }, [reload]);

    return {
        catalog,
        active: catalog?.active,
        loading,
        busy,
        error,
        setError,
        reload,
        choose,
        saveKey,
        dropKey,
    };
}
