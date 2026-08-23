import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * True once the component has hydrated on the client, false during SSR and on
 * the first client render.
 *
 * The usual way to write this is a `useState(false)` plus an effect that sets
 * it to true, but that is a setState synchronously inside an effect, which
 * costs an extra render pass and is what react-hooks/set-state-in-effect
 * objects to. useSyncExternalStore expresses the same thing directly: it has a
 * separate server snapshot, so React knows the value differs across hydration
 * instead of having to be told after the fact.
 */
export function useMounted(): boolean {
    return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
