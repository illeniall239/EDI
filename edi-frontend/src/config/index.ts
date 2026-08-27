// Always same-origin: the browser calls /api/... on the host it was served
// from. Getting it there is the deployment's job -- a reverse proxy, or a
// platform that routes /api/* to the Python service -- and in development
// next.config.ts proxies to BACKEND_ORIGIN. Hosting the two halves on separate
// domains works too; that is what EDI_CORS_ORIGINS is for.
//
// This deliberately reads no NEXT_PUBLIC_ variable. Those are inlined into the
// bundle at build time, so one left over in a project's settings keeps
// redirecting the deployed site to a host nobody remembers configuring, long
// after the config that set it is gone. Point BACKEND_ORIGIN at a remote
// backend instead -- it is read server-side, at request time.
export const API_BASE_URL = '';

export const API_ENDPOINTS = {
    upload: `${API_BASE_URL}/api/upload`,
    query: `${API_BASE_URL}/api/query`,
    classifyCommand: `${API_BASE_URL}/api/classify-command`,
    cancelOperation: `${API_BASE_URL}/api/cancel-operation`,
    resetState: `${API_BASE_URL}/api/reset-state`,
    // NEW: Universal Query Router endpoint
    orchestrate: `${API_BASE_URL}/api/orchestrate`,
    // Workspace + chat persistence. These go through the backend, which is the
    // only thing that touches the store.
    initializeData: `${API_BASE_URL}/api/initialize-data`,
    createWorkspace: `${API_BASE_URL}/api/workspace`,
    workspace: (id: string) => `${API_BASE_URL}/api/workspace/${id}`,
    workspaces: `${API_BASE_URL}/api/workspaces`,
    chats: (workspaceId: string) => `${API_BASE_URL}/api/workspace/${workspaceId}/chats`,
    chat: (chatId: string) => `${API_BASE_URL}/api/chats/${chatId}`,
    // The model picker. `models` reports what this machine can reach and
    // never returns a key -- only whether one exists. See backend/model_prefs.py
    // for why a key posted to `providerKey` stays on the machine it was typed on.
    formula: `${API_BASE_URL}/api/formula`,
    models: `${API_BASE_URL}/api/models`,
    selectModel: `${API_BASE_URL}/api/models/select`,
    resetModel: `${API_BASE_URL}/api/models/reset`,
    providerKey: `${API_BASE_URL}/api/models/key`,
    forgetProviderKey: (provider: string) => `${API_BASE_URL}/api/models/key/${provider}`
};

// File upload configuration
export const SUPPORTED_FILE_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// Nothing enforces a size any more. This is kept as a reference point, not a
// rule: the grid renders about 70,000 rows comfortably and degrades past
// that, and a 4MB CSV is roughly 120,000 rows. It is your machine and your
// file; the app will try whatever you give it.
export const LARGE_FILE_HINT = 4 * 1024 * 1024; 