// Always same-origin. In production the frontend and backend are two services
// of one Vercel project behind a single domain; in development next.config.ts
// proxies /api/* to BACKEND_ORIGIN. Either way the browser calls /api/... on
// the host it was served from.
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
    data: `${API_BASE_URL}/api/data`,
    generateReport: `${API_BASE_URL}/api/generate-report`,
    cancelOperation: `${API_BASE_URL}/api/cancel-operation`,
    resetState: `${API_BASE_URL}/api/reset-state`,
    // spreadsheetCommand removed: deprecated backend endpoint
    rangeFilter: `${API_BASE_URL}/api/range-filter`,
    generateSyntheticDataset: `${API_BASE_URL}/api/generate-synthetic-dataset`,
    // NEW: Universal Query Router endpoint
    orchestrate: `${API_BASE_URL}/api/orchestrate`,
    // Learn Mode endpoints
    learnQuery: `${API_BASE_URL}/api/learn/query`,
    learnProgress: (workspaceId: string) => `${API_BASE_URL}/api/learn/progress/${workspaceId}`,
    learnDatasets: `${API_BASE_URL}/api/learn/datasets`,
    learnPracticeChallenge: `${API_BASE_URL}/api/learn/practice-challenge`,
    // Workspace + chat persistence. These go through the backend rather than
    // straight to Supabase so the table can stay closed to the public anon key.
    initializeData: `${API_BASE_URL}/api/initialize-data`,
    createWorkspace: `${API_BASE_URL}/api/workspace`,
    workspace: (id: string) => `${API_BASE_URL}/api/workspace/${id}`,
    chats: (workspaceId: string) => `${API_BASE_URL}/api/workspace/${workspaceId}/chats`,
    chat: (chatId: string) => `${API_BASE_URL}/api/chats/${chatId}`
};

// Static files base URL for visualizations
export const STATIC_BASE_URL = API_BASE_URL;

// File upload configuration
export const SUPPORTED_FILE_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// Vercel Functions cap a request body at 4.5MB, so anything larger is
// rejected by the platform before it reaches the backend.
export const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB, under the 4.5MB limit 