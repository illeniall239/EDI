import { API_ENDPOINTS } from '@/config';

/**
 * Anonymous workspace identity.
 *
 * EDI has no sign-in. A workspace is just a row keyed by a UUID, and the
 * browser remembers which one is "yours" in localStorage. That is the whole
 * of the identity model: clearing site data or opening another browser gets
 * you a fresh, empty sheet, and nothing is shared between devices.
 *
 * The id is only ever handed to our own backend, which is what talks to
 * Supabase. Nothing here needs the database credentials.
 */
const STORAGE_KEY = 'edi.workspaceId';

/** In-flight creation, so a double render cannot create two workspaces. */
let pending: Promise<string> | null = null;

function readStored(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Private mode and blocked site data both throw here rather than
        // returning null. Losing persistence is survivable; crashing is not.
        return null;
    }
}

function writeStored(id: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // Same as above: the session still works, it just will not be
        // remembered after a reload.
    }
}

async function createWorkspace(): Promise<string> {
    const response = await fetch(API_ENDPOINTS.createWorkspace, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Sheet' })
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Could not create a workspace: ${detail || response.statusText}`);
    }

    const { id } = await response.json();
    if (!id) throw new Error('Backend created a workspace but returned no id.');
    return id as string;
}

/**
 * Return the current workspace id, creating one on first visit.
 *
 * A stored id that the backend no longer recognises (the row was deleted, or
 * it came from a different Supabase project) is discarded rather than left to
 * fail every subsequent request.
 */
export async function getOrCreateWorkspaceId(): Promise<string> {
    if (pending) return pending;

    pending = (async () => {
        const stored = readStored();
        if (stored) {
            const response = await fetch(API_ENDPOINTS.workspace(stored));
            if (response.ok) return stored;
            if (response.status !== 404) {
                const detail = await response.text();
                throw new Error(`Could not open your sheet: ${detail || response.statusText}`);
            }
        }

        const id = await createWorkspace();
        writeStored(id);
        return id;
    })();

    try {
        return await pending;
    } finally {
        pending = null;
    }
}
