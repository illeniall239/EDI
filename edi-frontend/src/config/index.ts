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
    generateReport: `${API_BASE_URL}/api/generate-report`,
    generateFormula: `${API_BASE_URL}/api/generate-formula`,
    classifyCommand: `${API_BASE_URL}/api/classify-command`,
    cancelOperation: `${API_BASE_URL}/api/cancel-operation`,
    resetState: `${API_BASE_URL}/api/reset-state`,
    // NEW: Universal Query Router endpoint
    orchestrate: `${API_BASE_URL}/api/orchestrate`,
    // Workspace + chat persistence. These go through the backend rather than
    // straight to Supabase so the table can stay closed to the public anon key.
    initializeData: `${API_BASE_URL}/api/initialize-data`,
    createWorkspace: `${API_BASE_URL}/api/workspace`,
    workspace: (id: string) => `${API_BASE_URL}/api/workspace/${id}`,
    chats: (workspaceId: string) => `${API_BASE_URL}/api/workspace/${workspaceId}/chats`,
    chat: (chatId: string) => `${API_BASE_URL}/api/chats/${chatId}`
};

// File upload configuration
export const SUPPORTED_FILE_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// Matches EDI_MAX_UPLOAD_BYTES on the backend. 4MB is the demo's setting,
// chosen to stay under the 4.5MB body cap Vercel Functions impose; a host
// without that cap can raise both.
export const MAX_FILE_SIZE = 4 * 1024 * 1024; 