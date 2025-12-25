export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

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
    learnPracticeChallenge: `${API_BASE_URL}/api/learn/practice-challenge`
};

// Static files base URL for visualizations
export const STATIC_BASE_URL = API_BASE_URL;

// File upload configuration
export const SUPPORTED_FILE_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes 