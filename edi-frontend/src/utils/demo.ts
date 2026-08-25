import { API_ENDPOINTS } from '@/config';

/**
 * Demo mode, as the browser sees it.
 *
 * The hosted demo hands every visitor the same sample dataset and forgets
 * them when they leave. The switch lives on the backend -- one EDI_DEMO_MODE
 * for the whole deployment, rather than a NEXT_PUBLIC_ copy that could
 * disagree with it -- so the browser has to ask.
 *
 * Asking costs nothing visible: the app already shows "Opening your sheet..."
 * while it resolves a workspace, and this resolves inside that.
 */
let pending: Promise<boolean> | null = null;
let known: boolean | null = null;

/** Whether this deployment is a demo. Asked once, then remembered. */
export async function isDemo(): Promise<boolean> {
    if (known !== null) return known;
    if (pending) return pending;

    pending = (async () => {
        try {
            const response = await fetch(API_ENDPOINTS.health);
            if (!response.ok) return false;
            const body = await response.json();
            return body?.demo === true;
        } catch {
            // A backend that cannot be reached is a bigger problem than this
            // flag, and the boot below will report it. Assume the normal app.
            return false;
        }
    })();

    try {
        known = await pending;
        return known;
    } finally {
        pending = null;
    }
}

/**
 * Start a demo session: a workspace holding the sample data.
 *
 * Deliberately not remembered in localStorage. See startDemoSession's caller
 * in page.tsx for the sessionStorage half, which is what lets a reload keep
 * the conversation while a new visit starts clean.
 */
export async function createDemoSession(): Promise<{ id: string; name: string }> {
    const response = await fetch(API_ENDPOINTS.demoSession, { method: 'POST' });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Could not start the demo: ${detail || response.statusText}`);
    }
    const body = await response.json();
    if (!body?.id) throw new Error('The demo started but returned no workspace.');
    return { id: body.id as string, name: (body.name as string) || 'Sample data' };
}
