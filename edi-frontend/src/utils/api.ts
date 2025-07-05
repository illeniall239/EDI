import { API_ENDPOINTS, SUPPORTED_FILE_TYPES, MAX_FILE_SIZE } from '@/config';
import { DataPreview, QueryResponse } from '@/types';

export async function uploadFile(file: File, workspaceId: string): Promise<DataPreview> {
    if (!SUPPORTED_FILE_TYPES.includes(file.type as any)) {
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

export async function sendQuery(query: string, options?: { isVoice?: boolean }): Promise<QueryResponse> {
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
            is_speech: options?.isVoice || false
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

export async function saveWorkspaceData(workspaceId: string, data: any[], filename?: string): Promise<void> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        // Extract column order from data
        const columnOrder = data && data.length > 0 ? Object.keys(data[0]) : [];
        
        console.log('💾 Saving workspace data with column order:', columnOrder);
        
        const { error } = await supabase
            .from('workspaces')
            .update({ 
                data: data,
                filename: filename || null,
                column_order: columnOrder,
                last_modified: new Date().toISOString()
            })
            .eq('id', workspaceId);

        if (error) {
            console.error('Error saving workspace data:', error);
            throw new Error('Failed to save workspace data');
        }
        
        console.log('✅ Workspace data saved successfully with column order');
    } catch (error) {
        console.error('Error in saveWorkspaceData:', error);
        throw error;
    }
}

export async function loadWorkspaceData(workspaceId: string): Promise<{ data: any[], filename?: string } | null> {
    try {
        const { supabase } = await import('@/utils/supabase');
        
        const { data: workspace, error } = await supabase
            .from('workspaces')
            .select('data, filename, column_order')
            .eq('id', workspaceId)
            .single();

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
            console.log('🔄 Restoring column order:', workspace.column_order);
            
            loadedData = loadedData.map((row: any) => {
                const orderedRow: any = {};
                workspace.column_order.forEach((column: string) => {
                    if (row.hasOwnProperty(column)) {
                        orderedRow[column] = row[column];
                    }
                });
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
            filename: workspace.filename || undefined
        };
    } catch (error) {
        console.error('Error in loadWorkspaceData:', error);
        return null;
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

// Fetch all reports for a workspace
export async function fetchReportsForWorkspace(workspaceId: string): Promise<Array<{ id: string; created_at: string; status: 'ready' | 'generating' | 'error' }>> {
    const response = await fetch(`/api/reports?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) {
        throw new Error('Failed to fetch reports');
    }
    return await response.json();
} 