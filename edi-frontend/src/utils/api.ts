import { API_ENDPOINTS, API_BASE_URL, SUPPORTED_FILE_TYPES, MAX_FILE_SIZE } from '@/config';
import { LearnQueryResponse, LearningProgress } from '@/types';
import { DataPreview, QueryResponse, Chat, ChatMessage } from '@/types';

export async function uploadFile(file: File, workspaceId: string = 'default'): Promise<DataPreview> {
    if (!SUPPORTED_FILE_TYPES.includes(file.type as string)) {
        throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds the maximum limit of 10MB.');
    }

    const formData = new FormData();
    formData.append('file', file);

    // Add workspace_id as query parameter instead of form data
    const uploadUrl = `${API_ENDPOINTS.upload}?workspace_id=${encodeURIComponent(workspaceId)}`;

    console.log('Sending file upload request...');
    const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();
    console.log('Server response:', data);

    if (!response.ok) {
        throw new Error(data.detail || 'Failed to upload file');
    }

    // Ensure the response has the expected structure
    if (!data || !data.data) {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from server');
    }

    return data;
}

export async function sendClarificationChoice(choiceId: string, originalQuery: string, category: string): Promise<QueryResponse> {
    console.log('🎯 Sending clarification choice:', { choiceId, originalQuery, category });
    
    const response = await fetch(`${API_BASE_URL}/api/clarification-choice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            choice_id: choiceId,
            original_query: originalQuery,
            category: category
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Clarification choice failed:', errorData);
        throw new Error(errorData.detail || 'Failed to process clarification choice');
    }

    const data = await response.json();
    console.log('Clarification choice response:', data);
    return data;
}

export async function sendQuery(query: string, chatId: string, options?: { isVoice?: boolean, mode?: string }): Promise<QueryResponse> {
    console.log('Sending query:', { query, options });
    
    // Check for duplicate removal keywords for debugging
    const duplicatePatterns = [
        'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
        'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
        'unique rows', 'remove duplicates', 'drop duplicates'
    ];
    
    const isDuplicateRemoval = duplicatePatterns.some(pattern => query.toLowerCase().includes(pattern));
    if (isDuplicateRemoval) {
        console.log('🧹 Duplicate removal detected in query:', query);
        console.log('🔍 Matched patterns:', duplicatePatterns.filter(p => query.toLowerCase().includes(p)));
        console.log('📤 Sending duplicate removal request to backend...');
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
            mode: options?.mode || 'simple'
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Query failed:', errorData);
        throw new Error(errorData.detail || 'Failed to send query');
    }

    const data = await response.json();
    console.log('Query response:', data);
    
    if (isDuplicateRemoval) {
        console.log('🧹 === DUPLICATE REMOVAL RESPONSE ANALYSIS ===');
        console.log('🧹 Response object keys:', Object.keys(data));
        console.log('🔄 Data updated flag:', data.data_updated);
        console.log('📊 Updated data included:', !!data.updated_data);
        
        if (data.updated_data) {
            console.log('📈 Updated data rows:', data.updated_data.rows);
            console.log('📈 Updated data columns:', data.updated_data.columns?.length);
            console.log('📊 Sample updated data:', data.updated_data.data?.slice(0, 2));
        } else {
            console.warn('⚠️ No updated_data object in response for duplicate removal request');
        }
        
        if (data.response) {
            console.log('💬 Response message:', data.response);
            // Check if response contains success indicators
            const successIndicators = ['success', 'removed', 'duplicate'];
            const isSuccessMessage = successIndicators.some(indicator => 
                data.response.toLowerCase().includes(indicator)
            );
            console.log('✅ Response appears to indicate success:', isSuccessMessage);
        }
    }
    
    return data;
}

export async function generateReport(options?: { format?: 'pdf' | 'html' }): Promise<{ report_id: string, status: string }> {
    const response = await fetch(API_ENDPOINTS.generateReport, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: options?.format || 'pdf' }),
    });

    if (!response.ok) {
        throw new Error('Failed to generate report');
    }

    return await response.json();
}

export async function downloadReport(reportId: string): Promise<Blob> {
    const downloadUrl = `${API_ENDPOINTS.generateReport.split('/api/')[0]}/api/download-report/${reportId}`;
    const response = await fetch(downloadUrl, {
        method: 'GET',
    });

    if (!response.ok) {
        throw new Error('Failed to download report');
    }

    return response.blob();
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

export async function saveWorkspaceData(workspaceId: string, data: unknown[], filename?: string, sheetState?: unknown): Promise<void> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        // Extract a robust column order from data: union of keys across all rows,
        // preserving the order of first appearance
        const columnOrder: string[] = [];
        if (Array.isArray(data)) {
            for (const row of data) {
                if (row && typeof row === 'object') {
                    for (const key of Object.keys(row)) {
                        if (!columnOrder.includes(key)) {
                            columnOrder.push(key);
                        }
                    }
                }
            }
        }
        
        console.log('💾 Saving workspace data with column order:', columnOrder);
        
        // Try to save with optional sheet_state first (if the column exists)
        let error: unknown = null;
        try {
            const result = await supabase
                .from('workspaces')
                .update({ 
                    data: data,
                    filename: filename || null,
                    column_order: columnOrder,
                    sheet_state: sheetState || null,
                    last_modified: new Date().toISOString()
                })
                .eq('id', workspaceId);
            error = result.error || null;
        } catch (e: unknown) {
            error = e;
        }

        if (error) {
            // Fallback #1: retry without sheet_state
            console.warn('⚠️ saveWorkspaceData: Saving with sheet_state failed, retrying without it...', (error as any)?.message || error);
            const retry1 = await supabase
                .from('workspaces')
                .update({ 
                    data: data,
                    filename: filename || null,
                    column_order: columnOrder,
                    last_modified: new Date().toISOString()
                })
                .eq('id', workspaceId);

            if (retry1.error) {
                console.warn('⚠️ saveWorkspaceData: Fallback #1 failed, retrying with minimal payload...', retry1.error?.message || retry1.error);
                // Fallback #2: minimal payload (data + last_modified only)
                const retry2 = await supabase
                    .from('workspaces')
                    .update({ 
                        data: data,
                        last_modified: new Date().toISOString()
                    })
                    .eq('id', workspaceId);

                if (retry2.error) {
                    console.error('Error saving workspace data (all fallbacks):', retry2.error);
                    throw new Error('Failed to save workspace data');
                } else {
                    console.log('✅ Workspace data saved successfully (fallback #2: minimal payload)');
                }
            } else {
                console.log('✅ Workspace data saved successfully (fallback #1: without sheet_state)');
            }
        } else {
            console.log('✅ Workspace data saved successfully with column order and sheet_state');
        }
    } catch (error) {
        console.error('Error in saveWorkspaceData:', error);
        throw error;
    }
}

export async function loadWorkspaceData(workspaceId: string): Promise<{ data: unknown[], filename?: string, sheetState?: unknown } | null> {
    try {
        const { supabase } = await import('@/utils/supabase');

        // Attempt to fetch including sheet_state
        type WorkspaceData = {
            data: unknown[];
            filename?: string;
            column_order?: string[];
            sheet_state?: unknown;
        };
        let workspace: WorkspaceData | null = null;
        let error: unknown = null;
        try {
            const res = await supabase
                .from('workspaces')
                .select('data, filename, column_order, sheet_state')
                .eq('id', workspaceId)
                .single();
            workspace = res.data as WorkspaceData | null;
            error = res.error;
        } catch (e: unknown) {
            error = e;
        }

        // If selecting sheet_state failed (column might not exist), retry without it
        if (error) {
            console.warn('⚠️ loadWorkspaceData: Selecting sheet_state failed, retrying without it...', (error as Error)?.message || error);
            const res2 = await supabase
                .from('workspaces')
                .select('data, filename, column_order')
                .eq('id', workspaceId)
                .single();
            workspace = res2.data as WorkspaceData | null;
            error = res2.error;
        }

        if (error) {
            console.error('Error loading workspace data:', error);
            return null;
        }

        if (!workspace?.data) {
            console.log('No data found in workspace');
            return null;
        }

        let loadedData = workspace.data;
        
        // Restore column order if available
        if (workspace.column_order && workspace.column_order.length > 0 && loadedData.length > 0) {
            const columnOrder = workspace.column_order ?? [];
            console.log('🔄 Restoring column order:', columnOrder);
            
            loadedData = loadedData.map((row: Record<string, unknown>) => {
                const orderedRow: Record<string, unknown> = {};
                // Place known columns in their saved order
                columnOrder.forEach((column: string) => {
                    if (Object.prototype.hasOwnProperty.call(row, column)) {
                        orderedRow[column] = row[column];
                    }
                });
                // Append any new/extra columns that were not part of the saved order
                for (const key of Object.keys(row)) {
                    if (!columnOrder.includes(key)) {
                        orderedRow[key] = row[key];
                    }
                }
                return orderedRow;
            });
            
            console.log('✅ Column order restored successfully');
        } else {
            console.log('⚠️ No column order saved, using data as-is');
        }

        console.log('✅ Workspace data loaded successfully', {
            rows: loadedData.length,
            filename: workspace.filename,
            columnOrder: workspace.column_order
        });

        return {
            data: loadedData,
            filename: workspace.filename || undefined,
            sheetState: workspace.sheet_state || undefined
        };
    } catch (error) {
        console.error('Error in loadWorkspaceData:', error);
        return null;
    }
}

export async function initializeBackendWithData(data: unknown[], filename?: string): Promise<{ success: boolean, message: string }> {
    try {
        // Use Next.js API route proxy to avoid browser CORS/preflight
        const response = await fetch('/api/initialize-data', {
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
        console.log('✅ Backend initialized successfully:', result);
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

export async function checkReportStatus(reportId: string): Promise<{ status: 'generating' | 'ready' | 'error', error?: string }> {
    try {
        // Use a regular GET request with a special query parameter to check if the file exists
        // without actually downloading the full file
        const downloadUrl = `${API_ENDPOINTS.generateReport.split('/api/')[0]}/api/download-report/${reportId}?check=true`;
        const response = await fetch(downloadUrl, { 
            method: 'GET',
            headers: {
                'X-Check-Only': 'true' // Add a custom header to indicate this is just a check
            }
        });
        
        if (response.ok) {
            return { status: 'ready' };
        } else if (response.status === 404) {
            // 404 means the report is still generating
            return { status: 'generating' };
        } else {
            // Any other error
            return { 
                status: 'error', 
                error: `Error checking report status: ${response.status} ${response.statusText}` 
            };
        }
    } catch (error) {
        return { 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error checking report status'
        };
    }
}

// ============================================
// Learn Mode API Helpers
// ============================================

export async function fetchLearnProgress(workspaceId: string): Promise<LearningProgress[]> {
    const url = API_ENDPOINTS.learnProgress(workspaceId);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load learning progress');
    const data = await res.json();
    return data.progress || [];
}

export async function fetchLearnDatasets(): Promise<unknown[]> {
    const res = await fetch(API_ENDPOINTS.learnDatasets);
    if (!res.ok) throw new Error('Failed to load learning datasets');
    const data = await res.json();
    return data.datasets || [];
}

export async function fetchPracticeChallenge(params: { conceptId: string; difficulty?: string; }): Promise<unknown> {
    const query = new URLSearchParams({
        concept_id: params.conceptId,
        difficulty: params.difficulty || 'beginner'
    });
    const res = await fetch(`${API_ENDPOINTS.learnPracticeChallenge}?${query.toString()}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate practice challenge');
    return res.json();
}

export async function sendLearnQuery(payload: {
  question: string;
  workspaceId: string;
  chatId?: string;
  userProgress?: LearningProgress[];
  sheetContext?: unknown;
  isFirstMessage?: boolean;
  conversationHistory?: unknown[];
}): Promise<LearnQueryResponse> {
    console.log('📡 [API] Sending learn query to backend:', {
        question: payload.question,
        conversationHistoryLength: payload.conversationHistory?.length || 0,
        conversationHistory: payload.conversationHistory,
        chatId: payload.chatId
    });

    const requestBody = {
        question: payload.question,
        workspace_id: payload.workspaceId,
        chat_id: payload.chatId,
        user_progress: payload.userProgress || [],
        sheet_context: payload.sheetContext || null,
        is_first_message: payload.isFirstMessage || false,
        conversation_history: payload.conversationHistory || []
    };

    console.log('📡 [API] Request body:', requestBody);

    const res = await fetch(API_ENDPOINTS.learnQuery, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
    if (!res.ok) throw new Error('Failed to process learn query');
    const response = await res.json();

    console.log('📡 [API] Backend response:', response);
    return response;
}

// Fetch all reports for a workspace
export async function fetchReportsForWorkspace(workspaceId: string): Promise<Array<{ id: string; created_at: string; status: 'ready' | 'generating' | 'error' }>> {
    const response = await fetch(`/api/reports?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) {
        throw new Error('Failed to fetch reports');
    }
    return await response.json();
}

export async function saveChatHistory(workspaceId: string, messages: unknown[]): Promise<void> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('💾 Saving chat history for workspace:', workspaceId, 'Messages:', messages.length);
        
        const { error } = await supabase
            .from('workspaces')
            .update({ 
                chat_messages: messages,
                last_modified: new Date().toISOString()
            })
            .eq('id', workspaceId);

        if (error) {
            console.error('Error saving chat history:', error);
            throw new Error('Failed to save chat history');
        }
        
        console.log('✅ Chat history saved successfully');
    } catch (error) {
        console.error('Error in saveChatHistory:', error);
        throw error;
    }
}

export async function loadChatHistory(workspaceId: string): Promise<unknown[]> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        const { data: workspace, error } = await supabase
            .from('workspaces')
            .select('chat_messages')
            .eq('id', workspaceId)
            .single();

        if (error) {
            console.error('Error loading chat history:', error);
            return [];
        }

        const messages = workspace?.chat_messages || [];

        // Clean up loaded messages - remove typing/analyzing states since these are historical
        const cleanedMessages = messages.map((message: Record<string, unknown>) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { isTyping, isAnalyzing, ...cleanMessage } = message;
            return cleanMessage;
        });
        
        console.log('✅ Chat history loaded successfully', {
            workspaceId,
            messageCount: cleanedMessages.length
        });

        return cleanedMessages;
    } catch (error) {
        console.error('Error in loadChatHistory:', error);
        return [];
    }
}

// ============================================
// NEW: Multiple Chat Management Functions
// ============================================

export async function createNewChat(workspaceId: string, title?: string): Promise<Chat> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('🆕 Creating new chat for workspace:', workspaceId, 'Title:', title || 'New Chat');
        
        const { data: chat, error } = await supabase
            .from('chats')
            .insert({ 
                workspace_id: workspaceId,
                title: title || 'New Chat',
                messages: [],
                context_state: {}
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating new chat:', error);
            throw new Error('Failed to create new chat');
        }
        
        console.log('✅ New chat created successfully:', chat.id);
        return chat;
    } catch (error) {
        console.error('Error in createNewChat:', error);
        throw error;
    }
}

export async function loadChats(workspaceId: string): Promise<Chat[]> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('📂 Loading chats for workspace:', workspaceId);
        
        const { data: chats, error } = await supabase
            .from('chats')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error loading chats:', error);
            return [];
        }
        
        console.log('✅ Chats loaded successfully:', chats?.length || 0, 'chats');
        return chats || [];
    } catch (error) {
        console.error('Error in loadChats:', error);
        return [];
    }
}

export async function saveChatMessages(chatId: string, messages: ChatMessage[]): Promise<void> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('💾 Saving messages for chat:', chatId, 'Messages:', messages.length);
        
        // Clean messages before saving - remove typing/analyzing states since they're temporary UI states
        const cleanedMessages = messages.map((message) => {
            const { ...cleanMessage } = message;
            return cleanMessage;
        });
        
        console.log('🧹 Cleaned messages for saving (removed isTyping/isAnalyzing from', messages.length, 'messages)');
        
        const { error } = await supabase
            .from('chats')
            .update({ 
                messages: cleanedMessages,
                updated_at: new Date().toISOString()
            })
            .eq('id', chatId);

        if (error) {
            console.error('Error saving chat messages:', error);
            throw new Error('Failed to save chat messages');
        }
        
        console.log('✅ Chat messages saved successfully');
    } catch (error) {
        console.error('Error in saveChatMessages:', error);
        throw error;
    }
}

export async function loadChatMessages(chatId: string): Promise<ChatMessage[]> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('📥 Loading messages for chat:', chatId);
        
        const { data: chat, error } = await supabase
            .from('chats')
            .select('messages')
            .eq('id', chatId)
            .single();

        if (error) {
            console.error('Error loading chat messages:', error);
            return [];
        }

        const messages = chat?.messages || [];

        // Clean up loaded messages - remove typing/analyzing states since these are historical
        const cleanedMessages = messages.map((message: Record<string, unknown>) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { isTyping, isAnalyzing, ...cleanMessage } = message;
            return cleanMessage;
        });
        
        console.log('✅ Chat messages loaded successfully:', cleanedMessages.length, 'messages');
        return cleanedMessages;
    } catch (error) {
        console.error('Error in loadChatMessages:', error);
        return [];
    }
}

export async function deleteChat(chatId: string): Promise<void> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('🗑️ Deleting chat:', chatId);
        
        const { error } = await supabase
            .from('chats')
            .delete()
            .eq('id', chatId);

        if (error) {
            console.error('Error deleting chat:', error);
            throw new Error('Failed to delete chat');
        }
        
        console.log('✅ Chat deleted successfully');
    } catch (error) {
        console.error('Error in deleteChat:', error);
        throw error;
    }
}

export async function updateChatTitle(chatId: string, title: string): Promise<void> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        console.log('✏️ Updating chat title:', chatId, 'New title:', title);
        
        const { error } = await supabase
            .from('chats')
            .update({ 
                title: title,
                updated_at: new Date().toISOString()
            })
            .eq('id', chatId);

        if (error) {
            console.error('Error updating chat title:', error);
            throw new Error('Failed to update chat title');
        }
        
        console.log('✅ Chat title updated successfully');
    } catch (error) {
        console.error('Error in updateChatTitle:', error);
        throw error;
    }
}

export async function analyzeWorkspaceInsights(
    workspaceId: string,
    analysisType: 'quick' | 'comprehensive' | 'focused',
    focusArea?: 'anomalies' | 'trends' | 'correlations'
): Promise<unknown> {
    try {
        console.log('🔍 Requesting workspace insights analysis:', { workspaceId, analysisType, focusArea });

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
        console.log('✅ Analysis complete:', data);
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
        console.log('📐 Requesting smart formatting:', { workspaceId, template });

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
        console.log('✅ Smart formatting response:', data);
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
        console.log('📝 Requesting quick data entry:', { workspaceId, action, parameters });

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
        console.log('✅ Quick data entry response:', data);
        return data;

    } catch (error) {
        console.error('Error in quickDataEntryWorkspace:', error);
        throw error;
    }
}