'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import WorkModeWorkspace from '@/components/WorkModeWorkspace';
import DataQualityReportModal from '@/components/DataQualityReportModal';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
    uploadFile,
    saveWorkspaceData,
    loadWorkspaceData,
    initializeBackendWithData,
    generateReport,
    downloadReport,
    checkReportStatus,
    resetState
} from '@/utils/api';
import { getOrCreateWorkspaceId } from '@/utils/workspace';
import { Workspace } from '@/types';
import { generateDataQualityReport as generateQualityReportData } from '@/utils/dataQualityUtils';
import { commandService } from '@/services/commandService';

/**
 * The whole app.
 *
 * There is no sign-in and no workspace picker: opening the page resolves an
 * anonymous workspace id from localStorage (creating one on first visit) and
 * drops you straight into the sheet with the AI sidebar.
 */
export default function HomePage() {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<unknown[]>([]);
    const [isCreatingSheet, setIsCreatingSheet] = useState(false);
    const [currentFilename, setCurrentFilename] = useState<string | undefined>();
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [initialSheets, setInitialSheets] = useState<unknown[] | undefined>(undefined);
    const [showDataQualityReport, setShowDataQualityReport] = useState(false);
    const [dataQualityReport, setDataQualityReport] = useState<unknown>(null);
    const { setCurrentWorkspace } = useWorkspace();

    // Univer adapter, used to snapshot the sheet exactly as the user left it.
    const univerAdapterRef = useRef<any>(null);

    const saveDataToWorkspace = useCallback(async (newData: unknown[], filename?: string) => {
        if (!workspaceId) return;

        let sheetState: unknown = undefined;
        try {
            if (univerAdapterRef.current?.getWorkbookSnapshot) {
                sheetState = await univerAdapterRef.current.getWorkbookSnapshot();
            }
        } catch (err) {
            // A snapshot failure should not cost the user their data; fall back
            // to saving the rows alone.
            console.warn('Could not capture sheet snapshot, saving data only:', err);
        }

        try {
            await saveWorkspaceData(workspaceId, newData, filename, sheetState);
        } catch (err) {
            console.error('Failed to save workspace:', err);
        }
    }, [workspaceId]);

    // Resolve the workspace, then restore whatever was in it.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const id = await getOrCreateWorkspaceId();
                if (cancelled) return;

                setWorkspaceId(id);

                const restored = await loadWorkspaceData(id);
                if (cancelled) return;

                const resolved: Workspace = {
                    id,
                    name: 'My Sheet',
                    workspace_type: 'work'
                } as Workspace;
                setWorkspace(resolved);
                setCurrentWorkspace(resolved);

                if (restored && restored.data.length > 0) {
                    // Push the rows back into the backend so a query works
                    // immediately, without waiting for another upload.
                    try {
                        await initializeBackendWithData(restored.data, restored.filename);
                    } catch (err) {
                        console.warn('Backend did not accept the restored data:', err);
                    }
                    if (cancelled) return;

                    setData(restored.data);
                    setCurrentFilename(restored.filename);
                    setInitialSheets(
                        Array.isArray(restored.sheetState) ? restored.sheetState : undefined
                    );
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Could not open your sheet.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // setCurrentWorkspace comes from context and is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Child components (the chat sidebar in particular) announce data changes
    // by dispatching a window event rather than calling back up the tree. The
    // listener is re-registered when the filename or workspace changes so it
    // never closes over a stale one.
    useEffect(() => {
        const handleDataUpdate = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail?.data) return;

            const newData = detail.data as unknown[];
            const newFilename = detail.filename || currentFilename;

            setData(newData);
            if (newFilename && newFilename !== currentFilename) {
                setCurrentFilename(newFilename);
            }
            void saveDataToWorkspace(newData, newFilename);
        };

        window.addEventListener('dataUpdate', handleDataUpdate);
        return () => window.removeEventListener('dataUpdate', handleDataUpdate);
    }, [saveDataToWorkspace, currentFilename]);

    const handleAdapterReady = (adapter: any) => {
        univerAdapterRef.current = adapter;
    };

    const ingestFile = async (file: File) => {
        if (!workspaceId) return;
        setIsCreatingSheet(true);
        try {
            const result = await uploadFile(file, workspaceId);
            if (result.data && result.data.length > 0) {
                setData(result.data);
                setCurrentFilename(file.name);
                await saveDataToWorkspace(result.data, file.name);
            } else {
                alert('Failed to process the uploaded file. Please try again.');
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert(err instanceof Error ? err.message : 'Failed to upload file.');
        } finally {
            setIsCreatingSheet(false);
        }
    };

    const handleFileUploadFromSpreadsheet = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await ingestFile(file);
        event.target.value = '';
    };

    const handleFileUploadFromNavbar = async (files: FileList) => {
        const file = files[0];
        if (file) await ingestFile(file);
    };

    const handleClearData = async () => {
        setData([]);
        setCurrentFilename(undefined);
        try {
            await resetState(workspaceId ?? undefined);
        } catch (err) {
            console.warn('Could not reset backend state:', err);
        }
        await saveDataToWorkspace([], undefined);
    };

    const handleGenerateQualityReport = async () => {
        if (!data || data.length === 0) {
            alert('No data available for quality analysis');
            return;
        }
        setIsGeneratingReport(true);
        try {
            const report = await generateQualityReportData(data, async (dataArray: unknown[][]) =>
                commandService.analyzeData(
                    'Generate a comprehensive data quality report with exact locations of all issues including duplicates, missing values, and data inconsistencies',
                    dataArray
                )
            );
            setDataQualityReport(report);
            setShowDataQualityReport(true);
        } catch (err) {
            console.error('Error generating quality report:', err);
            alert('Failed to generate the data quality report.');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleGenerateReport = async () => {
        if (!data || data.length === 0) {
            alert('Upload a dataset before generating a report.');
            return;
        }
        setIsGeneratingReport(true);
        try {
            const { report_id } = await generateReport();

            // The backend builds the PDF in the background, so poll until it
            // is either ready or has failed.
            let status = await checkReportStatus(report_id);
            for (let attempt = 0; attempt < 60 && status.status === 'generating'; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                status = await checkReportStatus(report_id);
            }

            if (status.status !== 'ready') {
                alert(status.error || 'Report generation timed out. Please try again.');
                return;
            }

            const blob = await downloadReport(report_id);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `report_${report_id}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error generating report:', err);
            alert(err instanceof Error ? err.message : 'Failed to generate report');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background text-white">
                <div className="flex justify-center items-center h-screen">
                    <div className="text-center text-white/80">
                        <div className="w-10 h-10 border-4 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <div className="text-sm">Opening your sheet...</div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !workspace) {
        return (
            <div className="min-h-screen bg-background">
                <div className="flex justify-center items-center h-screen px-6">
                    <div className="text-center max-w-md">
                        <h2 className="text-2xl font-bold text-white mb-3">Could not open your sheet</h2>
                        <p className="text-white/60 text-sm mb-6">
                            {error || 'The workspace could not be loaded.'}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const noop = () => {};

    return (
        <>
            <WorkModeWorkspace
                workspace={workspace}
                workspaces={[workspace]}
                data={data}
                isCreatingSheet={isCreatingSheet}
                isGeneratingReport={isGeneratingReport}
                onWorkspaceChange={noop}
                onRenameWorkspace={noop}
                onDeleteWorkspace={noop}
                onFileUpload={handleFileUploadFromNavbar}
                onGenerateQualityReport={handleGenerateQualityReport}
                onGenerateReport={handleGenerateReport}
                onExtractColumns={noop}
                onClearData={handleClearData}
                onSpreadsheetCommand={async (command: string) => ({
                    success: true,
                    message: `Processed command: "${command}"`
                })}
                onDataUpdate={setData}
                onFileUploadFromSpreadsheet={handleFileUploadFromSpreadsheet}
                setShowSyntheticDatasetDialog={noop}
                setShowColumnExtraction={noop}
                currentFilename={currentFilename}
                initialSheets={initialSheets}
                onAdapterReady={handleAdapterReady}
            />

            <DataQualityReportModal
                isOpen={showDataQualityReport}
                onClose={() => setShowDataQualityReport(false)}
                report={dataQualityReport}
                onRefresh={handleGenerateQualityReport}
            />
        </>
    );
}
