'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import WorkModeWorkspace from '@/components/WorkModeWorkspace';
import LearnModeWorkspace from '@/components/LearnModeWorkspace';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { uploadFile, saveWorkspaceData, loadWorkspaceData, initializeBackendWithData, generateReport, downloadReport, checkReportStatus } from '@/utils/api';
import { Workspace } from '@/types';
import { generateDataQualityReport as generateQualityReportData } from '@/utils/dataQualityUtils';
import { commandService } from '@/services/commandService';
import DataQualityReportModal from '@/components/DataQualityReportModal';

export default function WorkspacePage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params?.id as string;
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<unknown[]>([]);
    const [isCreatingSheet, setIsCreatingSheet] = useState(false);
    const [currentFilename, setCurrentFilename] = useState<string | undefined>();
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_showSyntheticDatasetDialog, _setShowSyntheticDatasetDialog] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_showColumnExtraction, _setShowColumnExtraction] = useState(false);
    const [initialSheets, setInitialSheets] = useState<unknown[] | undefined>(undefined);
    const { setCurrentWorkspace } = useWorkspace();

    // Store Univer adapter reference for state persistence
    const univerAdapterRef = useRef<any>(null);

    // Data quality report state
    const [showDataQualityReport, setShowDataQualityReport] = useState(false);
    const [dataQualityReport, setDataQualityReport] = useState<unknown>(null);

    useEffect(() => {
        if (workspaceId) {
            fetchWorkspace();
            fetchWorkspaces();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId]);

    // Listen for data updates from child components (like ChatInterface)
    useEffect(() => {
        const handleDataUpdate = async (event: CustomEvent) => {
            console.log('📊 WorkspacePage: Data update event received', event.detail);
            
            if (event.detail && event.detail.data) {
                const newData = event.detail.data;
                const newFilename = event.detail.filename || currentFilename;
                console.log('📊 Received updated data with', newData.length, 'rows');
                console.log('🔍 WORKSPACE PAGE DATA ANALYSIS:');
                console.log('  - Data length:', newData.length);
                console.log('  - First row:', newData[0]);
                console.log('  - First row keys:', newData[0] ? Object.keys(newData[0]) : 'No data');
                console.log('  - Filename:', newFilename);
                
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
                
                // Update state with new data and filename
                console.log('🔄 Setting new data to state...');
                console.log('🔍 BEFORE setState - current data length:', data.length);
                console.log('🔍 BEFORE setState - new data length:', newData.length);
                console.log('🔍 BEFORE setState - new data first row keys:', newData[0] ? Object.keys(newData[0]) : 'No data');
                setData(newData);
                if (newFilename && newFilename !== currentFilename) {
                    console.log('📄 Updating filename:', newFilename);
                    setCurrentFilename(newFilename);
                }
                console.log('✅ Data state updated');
                
                // Save updated data to workspace (background operation)
                console.log('💾 Starting workspace save in background...');
                saveDataToWorkspace(newData, newFilename)
                    .then(() => {
                        console.log('✅ Workspace save completed successfully');
                    })
                    .catch((error) => {
                        console.error('❌ Workspace save failed:', error);
                    });
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Callback to receive Univer adapter reference
    const handleAdapterReady = (adapter: any) => {
        console.log('📊 [WorkspacePage] Univer adapter ready for persistence');
        univerAdapterRef.current = adapter;
    };

    // Helper function to save data to workspace
    const saveDataToWorkspace = async (newData: unknown[], filename?: string) => {
        if (!workspaceId) return;

        try {
            // Capture full sheet snapshot for exact restore (for both Luckysheet and Univer)
            let sheetState: unknown = undefined;

            try {
                // Try Luckysheet first (for backward compatibility)
                if (typeof window !== 'undefined' && (window as any).luckysheet?.getAllSheets) {
                    const sheets = (window as any).luckysheet.getAllSheets();
                    if (Array.isArray(sheets) && sheets.length > 0) {
                        sheetState = sheets;
                        console.log('💾 [WorkspacePage] Captured Luckysheet sheet_state snapshot');
                    }
                }
                // Try Univer adapter if available
                else if (univerAdapterRef.current && typeof univerAdapterRef.current.getWorkbookSnapshot === 'function') {
                    console.log('💾 [WorkspacePage] Getting Univer workbook snapshot...');
                    sheetState = await univerAdapterRef.current.getWorkbookSnapshot();
                    if (sheetState) {
                        console.log('💾 [WorkspacePage] Captured Univer sheet_state snapshot');
                    }
                }
            } catch (error) {
                console.warn('⚠️ [WorkspacePage] Failed to capture sheet_state:', error);
                // Continue with data-only save if sheet state capture fails
            }

            await saveWorkspaceData(workspaceId, newData, filename, sheetState);
            console.log('💾 Data saved to workspace successfully');
        } catch (error) {
            console.error('❌ Failed to save data to workspace:', error);
            // Don't show error to user as this is auto-save
        }
    };

    const fetchWorkspaces = async () => {
        try {
            const { data: workspaceData, error } = await supabase
                .from('workspaces')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching workspaces:', error);
                return;
            }

            setWorkspaces(workspaceData || []);
        } catch (error) {
            console.error('Error fetching workspaces:', error);
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
                
                // Initialize backend with the restored data so all features work immediately
                console.log('🔄 Initializing backend with restored data...');
                try {
                    const initResult = await initializeBackendWithData(savedData.data, savedData.filename);
                    if (initResult.success) {
                        console.log('✅ Backend initialized successfully with restored data');
                    } else {
                        console.warn('⚠️ Backend initialization failed:', initResult.message);
                        // Continue loading even if backend init fails (CORS or endpoint issues)
                        console.log('📋 Continuing with local data only');
                    }
                } catch (error) {
                    console.error('❌ Error initializing backend with restored data:', error);
                    // Continue loading even if backend init fails (CORS or endpoint issues)
                    console.log('📋 Continuing with local data only (backend unavailable)');
                }

                setData(savedData.data);
                setCurrentFilename(savedData.filename);
                // Stash full sheet snapshot in state for SpreadsheetWrapper
                if (savedData.sheetState && Array.isArray(savedData.sheetState)) {
                    console.log('✅ Found sheet_state snapshot, passing to SpreadsheetWrapper for exact restore');
                    setInitialSheets(savedData.sheetState);
                } else {
                    console.log('⚠️ No sheet_state found, will rebuild from array data');
                    setInitialSheets(undefined);
                }
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

    const handleWorkspaceChange = (selectedWorkspace: Workspace) => {
        console.log('🔄 Workspace button clicked:', selectedWorkspace.name, selectedWorkspace.id);
        console.log('🔄 Current workspace before:', workspace?.id);
        
        setWorkspace(selectedWorkspace);
        setCurrentWorkspace(selectedWorkspace);
        
        // Navigate to the selected workspace
        console.log('🔄 Navigating to:', `/workspace/${selectedWorkspace.id}`);
        router.push(`/workspace/${selectedWorkspace.id}`);
    };


    const handleRenameWorkspace = async (id: string, name: string) => {
        try {
            const { error } = await supabase
                .from('workspaces')
                .update({ name })
                .eq('id', id);

            if (error) {
                console.error('Error renaming workspace:', error);
                return;
            }

            // Update local state
            setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
            if (workspace?.id === id) {
                setWorkspace(prev => prev ? { ...prev, name } : null);
            }
        } catch (error) {
            console.error('Error renaming workspace:', error);
        }
    };

    const handleDeleteWorkspace = async (id: string) => {
        try {
            const { error } = await supabase
                .from('workspaces')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting workspace:', error);
                return;
            }

            // Update local state
            setWorkspaces(prev => prev.filter(w => w.id !== id));
            
            // If we're deleting the current workspace, redirect to workspaces list
            if (workspace?.id === id) {
                router.push('/workspaces');
            }
        } catch (error) {
            console.error('Error deleting workspace:', error);
        }
    };

    const handleFileUploadFromNavbar = async (files: FileList) => {
        const file = files[0];
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
        }
    };

    const handleGenerateQualityReport = async () => {
        if (!data || data.length === 0) {
            alert('No data available for quality analysis');
            return;
        }

        setIsGeneratingReport(true);
        try {
            console.log('🔍 Generating data quality report...');

            // Generate the quality report using shared utilities
            const backendAnalysisFn = async (dataArray: unknown[][]) => {
                return await commandService.analyzeData(
                    'Generate a comprehensive data quality report with exact locations of all issues including duplicates, missing values, and data inconsistencies',
                    dataArray
                );
            };

            const report = await generateQualityReportData(data, backendAnalysisFn);

            setDataQualityReport(report);
            setShowDataQualityReport(true);

            console.log('✅ Data quality report generated successfully');
        } catch (error) {
            console.error('❌ Error generating quality report:', error);
            alert('Error generating data quality report. Please try again.');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleGenerateReport = async () => {
        if (data.length === 0) {
            alert('Please upload some data first before generating a report.');
            return;
        }

        setIsGeneratingReport(true);

        try {
            console.log('Generating PDF report...');
            
            // Start report generation
            const report = await generateReport({ format: 'pdf' });
            
            // Poll for completion
            const pollReportStatus = async (reportId: string, maxAttempts = 30, interval = 2000) => {
                let attempts = 0;
                while (attempts < maxAttempts) {
                    try {
                        const statusData = await checkReportStatus(reportId);
                        if (statusData.status === 'ready') {
                            return true;
                        } else if (statusData.status === 'error') {
                            alert(`Report generation failed: ${statusData.error || 'Unknown error'}`);
                            return false;
                        }
                    } catch {
                        // ignore, will retry
                    }
                    await new Promise((resolve) => setTimeout(resolve, interval));
                    attempts++;
                }
                return false;
            };

            const ready = await pollReportStatus(report.report_id);
            
            if (ready) {
                console.log('Report ready for download');
                
                // Automatically download the report
                try {
                    const reportBlob = await downloadReport(report.report_id);
                    const url = window.URL.createObjectURL(reportBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `report_${report.report_id}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                    console.log('Report downloaded successfully');
                    alert('Report generated and downloaded successfully!');
                } catch (downloadError) {
                    console.error('Failed to download report:', downloadError);
                    alert('Report generated but download failed. Please try again.');
                }
            } else {
                alert('Report generation timed out. Please try again.');
            }
        } catch (error) {
            console.error('Error generating report:', error);
            alert(error instanceof Error ? error.message : 'Failed to generate report');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleExtractColumns = () => {
        // TODO: Implement column extraction dialog
        console.log('Column extraction requested');
    };

    // Removed unused _handleShowFormulaAssistant function

    if (loading) {
        return (
            <div className="min-h-screen bg-background text-white">
                <div className="flex justify-center items-center h-screen">
                    <div className="text-center text-white/80">
                        <div className="w-10 h-10 border-4 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <div className="text-sm">
                            {workspace?.workspace_type === 'learn' ? 'Preparing your practice sheet...' : 'Loading workspace...'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!workspace) {
        return (
            <div className="min-h-screen bg-background">
                <div className="flex justify-center items-center h-screen">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white mb-4">Workspace not found</h2>
                        <button
                            onClick={() => router.push('/workspaces')}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg"
                        >
                            Back to Workspaces
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Route to different components based on workspace type
    if (workspace.workspace_type === 'learn') {
        return <LearnModeWorkspace workspace={workspace} />;
    }

    // Default to Work Mode
        return (
            <>
                <WorkModeWorkspace
                    workspace={workspace}
                    workspaces={workspaces}
                    data={data}
                    isCreatingSheet={isCreatingSheet}
                    isGeneratingReport={isGeneratingReport}
                    onWorkspaceChange={handleWorkspaceChange}
                    onRenameWorkspace={handleRenameWorkspace}
                    onDeleteWorkspace={handleDeleteWorkspace}
                    onFileUpload={handleFileUploadFromNavbar}
                    onGenerateQualityReport={handleGenerateQualityReport}
                    onGenerateReport={handleGenerateReport}
                    onExtractColumns={handleExtractColumns}
                    onClearData={handleClearData}
                    onSpreadsheetCommand={handleSpreadsheetCommand}
                    onDataUpdate={setData}
                    onFileUploadFromSpreadsheet={handleFileUpload}
                    setShowSyntheticDatasetDialog={_setShowSyntheticDatasetDialog}
                    setShowColumnExtraction={_setShowColumnExtraction}
                    currentFilename={currentFilename}
                    initialSheets={initialSheets}
                    onAdapterReady={handleAdapterReady}
                />

                {/* Data Quality Report Modal */}
                <DataQualityReportModal
                    isOpen={showDataQualityReport}
                    onClose={() => setShowDataQualityReport(false)}
                    report={dataQualityReport}
                    onRefresh={handleGenerateQualityReport}
                />
            </>
    );
} 