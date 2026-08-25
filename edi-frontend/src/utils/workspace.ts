import { API_ENDPOINTS } from '@/config';

/**
 * Anonymous workspace identity.
 *
 * EDI has no sign-in. A workspace is just a row keyed by a UUID, and the
 * browser remembers which ones are "yours" in localStorage. That is the whole
 * of the identity model: clearing site data or opening another browser gets
 * you a fresh, empty sheet, and nothing is shared between devices.
 *
 * Because the backend has no idea who is asking, the list of workspaces lives
 * here rather than in a query. The alternative -- a "list all workspaces"
 * endpoint -- would hand every visitor everyone else's sheets on any shared
 * deployment. The browser holds the ids and asks about those.
 *
 * The list is shared by every tab; which workspace is open is not. See the
 * note on the two stores below.
 *
 * The ids are only ever handed to our own backend, which is what talks to the
 * store. Nothing here needs the database credentials.
 */
const ACTIVE_KEY = 'edi.workspaceId';
const LIST_KEY = 'edi.workspaceIds';

/** In-flight creation, so a double render cannot create two workspaces. */
let pending: Promise<string> | null = null;

function read(store: Storage | null, key: string): string | null {
    try {
        return store?.getItem(key) ?? null;
    } catch {
        // Private mode and blocked site data both throw here rather than
        // returning null. Losing persistence is survivable; crashing is not.
        return null;
    }
}

function write(store: Storage | null, key: string, value: string): void {
    try {
        store?.setItem(key, value);
    } catch {
        // Same as above: the session still works, it just will not be
        // remembered after a reload.
    }
}

/**
 * The two stores, and why there are two.
 *
 * The list of workspaces belongs to the browser, so it lives in
 * localStorage and every tab sees the same one. Which workspace is *open*
 * belongs to the tab: with a single shared key, opening a second workbook in
 * one tab silently redirected every other tab the next time it reloaded.
 * sessionStorage is per-tab and survives a reload, which is exactly the
 * lifetime wanted.
 *
 * The shared key is still written, so a newly opened tab lands on whatever
 * you last had open rather than on an arbitrary workspace.
 */
function local(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

function session(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.sessionStorage;
    } catch {
        return null;
    }
}

function readRaw(key: string): string | null {
    return read(local(), key);
}

function writeRaw(key: string, value: string): void {
    write(local(), key, value);
}

/**
 * Every workspace id this browser knows about, most recently added first.
 *
 * Migrates the single-id key that predates multiple workspaces: anyone who
 * used EDI before this existed has one sheet under `edi.workspaceId`, and it
 * should show up in their list rather than being orphaned.
 */
export function listWorkspaceIds(): string[] {
    const stored = readRaw(LIST_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
            }
        } catch {
            // Corrupt value; fall through to the single-id migration.
        }
    }

    const legacy = readRaw(ACTIVE_KEY);
    return legacy ? [legacy] : [];
}

function writeWorkspaceIds(ids: string[]): void {
    writeRaw(LIST_KEY, JSON.stringify(ids));
}

/** Remember a workspace, newest first, without duplicating it. */
export function rememberWorkspaceId(id: string): void {
    const ids = listWorkspaceIds().filter((existing) => existing !== id);
    writeWorkspaceIds([id, ...ids]);
}

/** Forget a workspace. Does not delete anything server-side. */
export function forgetWorkspaceId(id: string): void {
    writeWorkspaceIds(listWorkspaceIds().filter((existing) => existing !== id));
    if (readRaw(ACTIVE_KEY) === id) {
        writeRaw(ACTIVE_KEY, '');
    }
    if (read(session(), ACTIVE_KEY) === id) {
        write(session(), ACTIVE_KEY, '');
    }
}

/**
 * The workspace this tab should open.
 *
 * This tab's own choice wins. A tab that has not made one -- a newly opened
 * tab -- falls back to whatever was last opened anywhere, then to the first
 * workspace in the list.
 */
export function getActiveWorkspaceId(): string | null {
    const mine = read(session(), ACTIVE_KEY);
    if (mine) return mine;

    const shared = readRaw(ACTIVE_KEY);
    if (shared) return shared;

    return listWorkspaceIds()[0] ?? null;
}

/**
 * Whether this tab has already chosen a workbook.
 *
 * False in a tab that has just been opened -- including after closing the
 * browser and coming back -- which is when the opener is worth showing. True
 * after a reload, because a reload is not "coming back", it is staying put.
 */
export function hasTabChosenWorkspace(): boolean {
    return Boolean(read(session(), ACTIVE_KEY));
}

export function setActiveWorkspaceId(id: string): void {
    write(session(), ACTIVE_KEY, id);   // this tab, across reloads
    writeRaw(ACTIVE_KEY, id);           // the default for the next new tab
    rememberWorkspaceId(id);
}

/** Create a workspace server-side and remember it. */
export async function createWorkspace(name = 'Untitled'): Promise<string> {
    const response = await fetch(API_ENDPOINTS.createWorkspace, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Could not create a workspace: ${detail || response.statusText}`);
    }

    const { id } = await response.json();
    if (!id) throw new Error('Backend created a workspace but returned no id.');

    rememberWorkspaceId(id as string);
    return id as string;
}

/**
 * Return the workspace to open, creating one on first visit.
 *
 * A stored id that the backend no longer recognises (the row was deleted, or
 * it came from a different store) is discarded rather than left to fail every
 * subsequent request.
 */
export async function getOrCreateWorkspaceId(): Promise<string> {
    if (pending) return pending;

    pending = (async () => {
        const stored = getActiveWorkspaceId();
        if (stored) {
            const response = await fetch(API_ENDPOINTS.workspace(stored));
            if (response.ok) {
                setActiveWorkspaceId(stored);
                return stored;
            }
            if (response.status !== 404) {
                const detail = await response.text();
                throw new Error(`Could not open your sheet: ${detail || response.statusText}`);
            }
            forgetWorkspaceId(stored);
        }

        const id = await createWorkspace('My Sheet');
        setActiveWorkspaceId(id);
        return id;
    })();

    try {
        return await pending;
    } finally {
        pending = null;
    }
}
