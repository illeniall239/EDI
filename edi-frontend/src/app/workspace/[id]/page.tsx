'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import NativeSpreadsheet from '@/components/NativeSpreadsheet';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { DataPreview } from '@/types';
import { uploadFile, saveWorkspaceData, loadWorkspaceData } from '@/utils/api';

interface Workspace {
    id: string;
    name: string;
    description: string;
    created_at: string;
}

export default function WorkspacePage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params?.id as string;
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [isCreatingSheet, setIsCreatingSheet] = useState(false);
    const [currentFilename, setCurrentFilename] = useState<string | undefined>();
    const { setCurrentWorkspace } = useWorkspace();

    useEffect(() => {
        if (workspaceId) {
            fetchWorkspace();
        }
    }, [workspaceId]);

    // Listen for data updates from child components (like ChatInterface)
    useEffect(() => {
        const handleDataUpdate = (event: CustomEvent) => {
            console.log('📊 WorkspacePage: Data update event received', event.detail);
            
            if (event.detail && event.detail.data) {
                const newData = event.detail.data;
                console.log('📊 Received updated data with', newData.length, 'rows');
                
                // Compare with current data to detect duplicate removal
                if (data.length > 0 && newData.length < data.length) {
                    console.log('🧹 Data rows reduced from', data.length, 'to', newData.length);
                    console.log('🧹 Rows removed:', data.length - newData.length);
                }
                
                // Log other data changes
                if (data.length > 0) {
                    const oldColumns = data[0] ? Object.keys(data[0]).sort() : [];
                    const newColumns = newData[0] ? Object.keys(newData[0]).sort() : [];
                    
                    if (JSON.stringify(oldColumns) !== JSON.stringify(newColumns)) {
                        console.log('📋 Column structure changed:');
                        console.log('  Old columns:', oldColumns);
                        console.log('  New columns:', newColumns);
                    }
                }
                
                // Update state with new data
                console.log('🔄 Setting new data to state...');
                setData(newData);
                console.log('✅ Data state updated');
                
                // Save updated data to workspace
                saveDataToWorkspace(newData, currentFilename);
            } else {
                console.warn('⚠️ Data update event received but no data found in event');
            }
        };

        // Add event listener with type assertion for CustomEvent
        window.addEventListener('dataUpdate', handleDataUpdate as EventListener);
        
        return () => {
            // Clean up event listener
            window.removeEventListener('dataUpdate', handleDataUpdate as EventListener);
        };
    }, [data]);

    // Helper function to save data to workspace
    const saveDataToWorkspace = async (newData: any[], filename?: string) => {
        if (!workspaceId) return;
        
        try {
            await saveWorkspaceData(workspaceId, newData, filename);
            console.log('💾 Data saved to workspace successfully');
        } catch (error) {
            console.error('❌ Failed to save data to workspace:', error);
            // Don't show error to user as this is auto-save
        }
    };

    const fetchWorkspace = async () => {
        try {
            const { data: workspaceData, error } = await supabase
                .from('workspaces')
                .select('*')
                .eq('id', workspaceId)
                .single();

            if (error) {
                console.error('Error fetching workspace:', error);
                router.push('/workspaces');
                return;
            }

            setWorkspace(workspaceData);
            setCurrentWorkspace(workspaceData);

            // Load saved data if it exists
            console.log('🔄 Loading workspace data...');
            const savedData = await loadWorkspaceData(workspaceId);
            if (savedData && savedData.data.length > 0) {
                console.log('✅ Found saved data, restoring...', {
                    rows: savedData.data.length,
                    filename: savedData.filename
                });
                
                // Initialize backend data handler with saved data
                try {
                    // Convert data array to CSV string
                    const headers = Object.keys(savedData.data[0]).join(',');
                    const rows = savedData.data.map(row => 
                        Object.values(row).map(val => 
                            typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
                        ).join(',')
                    );
                    const csvContent = [headers, ...rows].join('\n');
                    
                    // Create CSV file
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const file = new File([blob], savedData.filename || 'workspace_data.csv', { type: 'text/csv' });
                    
                    // Upload to backend to initialize data handler
                    console.log('🔄 Initializing backend data handler...');
                    await uploadFile(file, workspaceId);
                    console.log('✅ Backend data handler initialized');
                } catch (error) {
                    console.error('❌ Failed to initialize backend:', error);
                }

                setData(savedData.data);
                setCurrentFilename(savedData.filename);
            } else {
                console.log('📭 No saved data found in workspace');
            }
        } catch (error) {
            console.error('Error:', error);
            router.push('/workspaces');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsCreatingSheet(true);
        
        try {
            console.log('Uploading file:', file.name);
            const result = await uploadFile(file, workspaceId);
            
            if (result.data && result.data.length > 0) {
                console.log('File uploaded successfully, data preview:', result.preview);
                console.log(`Successfully loaded ${result.data.length} rows from ${file.name}`);
                setData(result.data);
                setCurrentFilename(file.name);
                
                // Save data to workspace
                await saveDataToWorkspace(result.data, file.name);
            } else {
                console.error('No data received from upload');
                alert('Failed to process the uploaded file. Please try again.');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload file. Please try again.');
        } finally {
            setIsCreatingSheet(false);
            // Reset the file input
            event.target.value = '';
        }
    };

    const handleClearData = async () => {
        setData([]);
        setCurrentFilename(undefined);
        
        // Reset backend state to ensure clean slate for new data generation
        try {
            console.log('🧹 Clearing backend state...');
            const response = await fetch('http://localhost:8000/api/reset-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            
            if (response.ok) {
                console.log('✅ Backend state cleared successfully');
            } else {
                console.warn('⚠️ Failed to clear backend state:', response.statusText);
            }
        } catch (error) {
            console.error('❌ Error clearing backend state:', error);
        }
        
        // Save empty state to workspace
        await saveDataToWorkspace([], undefined);
    };

    const handleSpreadsheetCommand = async (command: string) => {
        // For now, return a simple response
        // In the future, this could call the backend for complex AI operations
        return {
            success: true,
            message: `Processed command: "${command}"`
        };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <div className="flex justify-center items-center h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </div>
        );
    }

    if (!workspace) {
        return (
            <div className="min-h-screen bg-white">
                <div className="flex justify-center items-center h-screen">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Workspace not found</h2>
                        <button
                            onClick={() => router.push('/workspaces')}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                        >
                            Back to Workspaces
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="h-[calc(100vh-4rem)]">
                <div className="h-full flex flex-col">
                    {/* Spreadsheet */}
                    <div className="flex-1">
                        {isCreatingSheet ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-gray-600">Processing your data...</p>
                                </div>
                            </div>
                        ) : (
                            <NativeSpreadsheet
                                data={data}
                                onCommand={handleSpreadsheetCommand}
                                onDataUpdate={setData}
                                onFileUpload={handleFileUpload}
                                onClearData={handleClearData}
                                isDataEmpty={data.length === 0}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
} 