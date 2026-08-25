import { API_ENDPOINTS, API_BASE_URL, SUPPORTED_FILE_TYPES, MAX_FILE_SIZE } from '@/config';
import { DataPreview, QueryResponse, Chat, ChatMessage } from '@/types';

/**
 * A refusal from the demo's usage limits: 429 (too many questions) or 413
 * (question, file, or dataset too large).
 *
 * Kept distinct from an ordinary failure because the backend's message is
 * already a complete explanation written for the person who hit it -- it says
 * what the limit is and what to do about it. Callers render it as-is rather
 * than wrapping it in "something went wrong", which would read as a bug in the
 * app instead of a deliberate boundary.
 */
export class LimitError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'LimitError';
        this.status = status;
    }
}

function limitRefusal(response: Response, detail?: string): LimitError | null {
    if (response.status !== 429 && response.status !== 413) return null;
    return new LimitError(
        detail || 'This demo limits how much it will do at once. Please try again in a moment.',
        response.status
    );
}

export async function uploadFile(file: File, workspaceId: string = 'default'): Promise<DataPreview> {
    if (!SUPPORTED_FILE_TYPES.includes(file.type as string)) {
        throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds the maximum limit of 4MB.');
    }

    const formData = new FormData();
    formData.append('file', file);

    // Add workspace_id as query parameter instead of form data
    const uploadUrl = `${API_ENDPOINTS.upload}?workspace_id=${encodeURIComponent(workspaceId)}`;

    const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
        throw limitRefusal(response, data.detail) || new Error(data.detail || 'Failed to upload file');
    }

    // Ensure the response has the expected structure
    if (!data || !data.data) {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from server');
    }

    return data;
}

export async function sendQuery(query: string, chatId: string, options?: { isVoice?: boolean, mode?: string, workspaceId?: string }): Promise<QueryResponse> {
    
    // Check for duplicate removal keywords for debugging
    const duplicatePatterns = [
        'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
        'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
        'unique rows', 'remove duplicates', 'drop duplicates'
    ];
    
    const isDuplicateRemoval = duplicatePatterns.some(pattern => query.toLowerCase().includes(pattern));
    if (isDuplicateRemoval) {
    }
    
    const response = await fetch(API_ENDPOINTS.query, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            question: query,
            chat_id: chatId,
            is_speech: options?.isVoice || false,
            mode: options?.mode || 'simple',
            workspace_id: options?.workspaceId
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Query failed:', errorData);
        throw limitRefusal(response, errorData.detail) || new Error(errorData.detail || 'Failed to send query');
    }

    const data = await response.json();
    
    if (isDuplicateRemoval) {
        
        if (data.updated_data) {
        } else {
            console.warn('⚠️ No updated_data object in response for duplicate removal request');
        }
        
    }
    
    return data;
}

export async function cancelOperation(operationId?: string): Promise<void> {
    const response = await fetch(API_ENDPOINTS.cancelOperation, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation_id: operationId }),
    });

    if (!response.ok) {
        throw new Error('Failed to cancel operation');
    }
}

export async function resetState(workspaceId?: string): Promise<void> {
    const response = await fetch(API_ENDPOINTS.resetState, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspace_id: workspaceId }),
    });

    if (!response.ok) {
        throw new Error('Failed to reset state');
    }
}

async function workspaceRequest(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || response.statusText);
    }
    return response.json();
}

export async function saveWorkspaceData(workspaceId: string, data: unknown[], filename?: string, sheetState?: unknown): Promise<void> {
    // Column order is the union of keys across all rows, in order of first
    // appearance -- rows are not guaranteed to carry the same keys, so taking
    // it from row 0 alone drops columns that appear later.
    const columnOrder: string[] = [];
    for (const row of Array.isArray(data) ? data : []) {
        if (row && typeof row === 'object') {
            for (const key of Object.keys(row)) {
                if (!columnOrder.includes(key)) columnOrder.push(key);
            }
        }
    }

    await workspaceRequest(API_ENDPOINTS.workspace(workspaceId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data,
            filename: filename ?? null,
            column_order: columnOrder,
            sheet_state: sheetState ?? null
        })
    });
}

export async function loadWorkspaceData(workspaceId: string): Promise<{ data: unknown[], filename?: string, sheetState?: unknown } | null> {
    try {
        const workspace = await workspaceRequest(API_ENDPOINTS.workspace(workspaceId));
        const rows: unknown[] = workspace.data || [];
        const columnOrder: string[] = workspace.column_order || [];

        // Re-key each row so the saved column order survives the round trip;
        // object key order is what the spreadsheet renders from.
        const ordered = columnOrder.length
            ? rows.map((row) => {
                  const source = (row || {}) as Record<string, unknown>;
                  const result: Record<string, unknown> = {};
                  for (const key of columnOrder) {
                      if (key in source) result[key] = source[key];
                  }
                  for (const key of Object.keys(source)) {
                      if (!(key in result)) result[key] = source[key];
                  }
                  return result;
              })
            : rows;

        return {
            data: ordered,
            filename: workspace.filename || undefined,
            sheetState: workspace.sheet_state || undefined
        };
    } catch (error) {
        console.error('Error in loadWorkspaceData:', error);
        return null;
    }
}

export interface WorkspaceSummary {
    id: string;
    name: string;
    filename?: string | null;
    /** Null on stores that cannot count rows cheaply; show the filename instead. */
    row_count?: number | null;
    last_modified?: string | null;
}

/**
 * Summarise the given workspaces, newest first.
 *
 * The ids come from localStorage rather than from the server: with no
 * sign-in, the browser is the only thing that knows which workspaces are
 * yours. Ids the store does not recognise are dropped from the result.
 */
export async function fetchWorkspaceSummaries(ids: string[]): Promise<WorkspaceSummary[]> {
    if (!ids.length) return [];
    try {
        const response = await fetch(API_ENDPOINTS.workspaces, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        if (!response.ok) throw new Error(await response.text() || response.statusText);
        const body = await response.json();
        return (body.workspaces || []) as WorkspaceSummary[];
    } catch (error) {
        console.error('Error in fetchWorkspaceSummaries:', error);
        return [];
    }
}

/** Rename a workspace. Goes through the ordinary save, which leaves data alone. */
export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
    const response = await fetch(API_ENDPOINTS.workspace(workspaceId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    if (!response.ok) {
        throw new Error(await response.text() || response.statusText);
    }
}

/** Delete a workspace and everything in it. Its chats go by cascade. */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
    const response = await fetch(API_ENDPOINTS.workspace(workspaceId), { method: 'DELETE' });
    // Already gone is the outcome the caller wanted.
    if (!response.ok && response.status !== 404) {
        throw new Error(await response.text() || response.statusText);
    }
}

export async function initializeBackendWithData(data: unknown[], filename?: string): Promise<{ success: boolean, message: string }> {
    try {
        // Use Next.js API route proxy to avoid browser CORS/preflight
        const response = await fetch(API_ENDPOINTS.initializeData, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: data,
                filename: filename
            })
        });

        if (!response.ok) {
            // Return a graceful failure instead of throwing to avoid blocking UI
            const message = await response.text().catch(() => response.statusText);
            return { success: false, message: message || 'Backend initialization failed' };
        }

        const result = await response.json();
        return {
            success: true,
            message: result.message || 'Backend initialized'
        };
    } catch (error) {
        console.error('❌ Error initializing backend:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to initialize backend'
        };
    }
}

export async function createNewChat(workspaceId: string, title?: string): Promise<Chat> {
    return workspaceRequest(API_ENDPOINTS.chats(workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'New Chat' })
    });
}

export async function loadChats(workspaceId: string): Promise<Chat[]> {
    try {
        const { chats } = await workspaceRequest(API_ENDPOINTS.chats(workspaceId));
        return chats || [];
    } catch (error) {
        console.error('Error in loadChats:', error);
        return [];
    }
}

/** Transient UI flags are not worth persisting and are misleading on reload. */
function stripTransientState(message: Record<string, unknown>): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isTyping, isAnalyzing, ...rest } = message;
    return rest;
}

export async function saveChatMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    await workspaceRequest(API_ENDPOINTS.chat(chatId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: messages.map((m) => stripTransientState(m as unknown as Record<string, unknown>))
        })
    });
}

export async function loadChatMessages(chatId: string): Promise<ChatMessage[]> {
    try {
        const chat = await workspaceRequest(API_ENDPOINTS.chat(chatId));
        const messages: Record<string, unknown>[] = chat.messages || [];
        return messages.map(stripTransientState) as unknown as ChatMessage[];
    } catch (error) {
        console.error('Error in loadChatMessages:', error);
        return [];
    }
}

export async function analyzeWorkspaceInsights(
    workspaceId: string,
    analysisType: 'quick' | 'comprehensive' | 'focused',
    focusArea?: 'anomalies' | 'trends' | 'correlations'
): Promise<unknown> {
    try {

        const params = new URLSearchParams({
            analysis_type: analysisType
        });

        if (focusArea) {
            params.append('focus_area', focusArea);
        }

        const response = await fetch(
            `${API_BASE_URL}/api/workspace/${workspaceId}/analyze-insights?${params}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(errorData.detail || `Analysis failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Error analyzing workspace insights:', error);
        throw error;
    }
}

export async function smartFormatWorkspace(
    workspaceId: string,
    template: 'professional' | 'financial' | 'minimal' = 'professional'
): Promise<unknown> {
    try {

        const params = new URLSearchParams({
            template: template
        });

        const response = await fetch(
            `${API_BASE_URL}/api/workspace/${workspaceId}/smart-format?${params.toString()}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Smart formatting failed:', errorData);
            throw new Error(errorData.detail || 'Failed to generate formatting');
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Error in smartFormatWorkspace:', error);
        throw error;
    }
}

/**
 * Quick data entry endpoint for natural language data insertion
 */
export async function quickDataEntryWorkspace(
    workspaceId: string,
    action: 'add_single_row' | 'generate_multiple_rows' | 'create_headers',
    parameters: Record<string, unknown>
): Promise<unknown> {
    try {

        const response = await fetch(
            `${API_BASE_URL}/api/workspace/${workspaceId}/quick-data-entry`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    parameters,
                    workspace_id: workspaceId
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Quick data entry failed:', errorData);
            throw new Error(errorData.detail || 'Failed to process data entry');
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Error in quickDataEntryWorkspace:', error);
        throw error;
    }
}