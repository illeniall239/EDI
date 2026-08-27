'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import WorkModeWorkspace from '@/components/WorkModeWorkspace';
import WorkbookOpener from '@/components/WorkbookOpener';
import ModelSetupDialog from '@/components/ModelSetupDialog';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
    uploadFile,
    saveWorkspaceData,
    loadWorkspaceData,
    initializeBackendWithData,
    resetState,
    fetchWorkspaceSummaries,
    renameWorkspace,
    deleteWorkspace,
    WorkspaceSummary
} from '@/utils/api';
import {
    getOrCreateWorkspaceId,
    createWorkspace,
    listWorkspaceIds,
    setActiveWorkspaceId,
    forgetWorkspaceId,
    hasTabChosenWorkspace
} from '@/utils/workspace';
import { downloadCSV } from '@/utils/exportSheet';
import { snapshotMatchesData } from '@/utils/sheetSnapshot';
import { Workspace } from '@/types';

/**
 * The whole app.
 *
 * There is no sign-in: opening the page resolves an anonymous workspace id
 * from localStorage (creating one on first visit) and drops you straight into
 * the sheet with the AI sidebar.
 *
 * You can keep several workbooks. Because nothing knows who you are, the list
 * of them lives in localStorage too and is sent to the backend to be
 * summarised -- see utils/workspace.ts for why it cannot be a plain query.
 */
export default function HomePage() {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [switching, setSwitching] = useState(false);
    const [showOpener, setShowOpener] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<unknown[]>([]);
    const [isCreatingSheet, setIsCreatingSheet] = useState(false);
    const [currentFilename, setCurrentFilename] = useState<string | undefined>();
    const [initialSheets, setInitialSheets] = useState<unknown[] | undefined>(undefined);
    // The Univer snapshot, when the stored one still describes these rows.
    // Everything the rows do not carry -- column widths, number formats, bold
    // headers, fills -- is in here and nowhere else.
    const [initialSnapshot, setInitialSnapshot] = useState<unknown>(undefined);
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

    /** Refresh the picker's list from the ids this browser remembers. */
    const refreshWorkspaces = useCallback(async () => {
        const ids = listWorkspaceIds();
        if (!ids.length) {
            setWorkspaces([]);
            return [] as WorkspaceSummary[];
        }

        const summaries = await fetchWorkspaceSummaries(ids);
        setWorkspaces(summaries);

        // Drop ids the store no longer recognises -- a workspace deleted from
        // another tab, or a store that was wiped. Only when something came
        // back, so a failed request does not erase the whole list.
        if (summaries.length) {
            const known = new Set(summaries.map((entry) => entry.id));
            for (const id of ids) {
                if (!known.has(id)) forgetWorkspaceId(id);
            }
        }
        return summaries;
    }, []);

    /**
     * Load a workspace into the sheet.
     *
     * Used both for the first render and for switching, so the two cannot
     * drift apart.
     */
    const openWorkspace = useCallback(async (id: string, name?: string) => {
        setWorkspaceId(id);
        setActiveWorkspaceId(id);

        const restored = await loadWorkspaceData(id);

        const resolved: Workspace = {
            id,
            name: name || 'My Sheet',
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

            setData(restored.data);
            setCurrentFilename(restored.filename);
            setInitialSheets(Array.isArray(restored.sheetState) ? restored.sheetState : undefined);

            // Only when it agrees with the rows it was stored beside. They
            // are written together and normally match; they come apart when
            // the data is replaced without the grid catching up, and
            // restoring a stale snapshot would show the previous file.
            const columns = Object.keys((restored.data[0] as object) || {}).length;
            setInitialSnapshot(
                snapshotMatchesData(restored.sheetState, restored.data.length, columns)
                    ? restored.sheetState
                    : undefined,
            );
        } else {
            // An empty workbook must not inherit the last one's rows.
            setData([]);
            setCurrentFilename(undefined);
            setInitialSheets(undefined);
            setInitialSnapshot(undefined);
            try {
                await resetState(id);
            } catch (err) {
                console.warn('Could not reset backend state:', err);
            }
        }
        // setCurrentWorkspace comes from context and is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Resolve the workspace, then restore whatever was in it -- unless there
    // is more than one to choose from and this tab has not chosen yet, in
    // which case ask.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const summaries = await refreshWorkspaces();
                if (cancelled) return;

                // Coming back to several workbooks: offer them rather than
                // guessing. A reload does not count as coming back -- the tab
                // has already chosen, and being thrown back to a picker every
                // refresh would be worse than guessing.
                if (summaries.length > 1 && !hasTabChosenWorkspace()) {
                    setShowOpener(true);
                    return;
                }

                const id = await getOrCreateWorkspaceId();
                if (cancelled) return;

                const name = summaries.find((entry) => entry.id === id)?.name;
                await openWorkspace(id, name);
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
    }, [openWorkspace, refreshWorkspaces]);

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

    /**
     * An edit made in the grid itself.
     *
     * This is the other half of the pair above. The sidebar announces its
     * changes through a window event and that path saves; the spreadsheet
     * announces its own through this prop, and this prop used to be
     * `setData` -- so anything done in the grid updated React state and was
     * never written anywhere. A formula applied to a column, a sort, an edited
     * cell: all of it survived until reload and no further.
     *
     * UniversalSpreadsheet already debounces and drops no-op saves, so by the
     * time this fires there is a real change worth a round trip.
     */
    const handleSheetEdit = useCallback((newData: unknown[]) => {
        setData(newData);
        void saveDataToWorkspace(newData, currentFilename);
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

    /** Open a workbook chosen from the opener. */
    const handleOpenFromOpener = async (id: string, name: string) => {
        setSwitching(true);
        try {
            await openWorkspace(id, name);
            await refreshWorkspaces();
            setShowOpener(false);
        } catch (err) {
            console.error('Could not open that workbook:', err);
            alert(err instanceof Error ? err.message : 'Could not open that workbook.');
        } finally {
            setSwitching(false);
        }
    };

    /** Back to the opener, from the workspace picker. */
    const handleShowOpener = async () => {
        await saveDataToWorkspace(data, currentFilename);
        await refreshWorkspaces();
        setShowOpener(true);
    };

    const handleCreateWorkspace = async () => {
        setSwitching(true);
        try {
            const name = `Workbook ${workspaces.length + 1}`;
            const id = await createWorkspace(name);
            // Pass the name on: without it openWorkspace falls back to its
            // "My Sheet" default and the navbar shows the wrong workbook.
            await openWorkspace(id, name);
            await refreshWorkspaces();
            setShowOpener(false);
        } catch (err) {
            console.error('Could not create a workbook:', err);
            alert(err instanceof Error ? err.message : 'Could not create a workbook.');
        } finally {
            setSwitching(false);
        }
    };

    const handleWorkspaceChange = async (next: Workspace) => {
        if (!next?.id || next.id === workspaceId) return;

        // Snapshot the sheet as it stands before leaving it; the autosave runs
        // on data changes, and switching is not one.
        await saveDataToWorkspace(data, currentFilename);

        setSwitching(true);
        try {
            await openWorkspace(next.id, next.name);
            await refreshWorkspaces();
        } catch (err) {
            console.error('Could not open that workbook:', err);
            alert(err instanceof Error ? err.message : 'Could not open that workbook.');
        } finally {
            setSwitching(false);
        }
    };

    const handleRenameWorkspace = async (id: string, name: string) => {
        try {
            await renameWorkspace(id, name);
            if (id === workspaceId) {
                setWorkspace((current) => (current ? { ...current, name } : current));
                setCurrentWorkspace({ ...(workspace as Workspace), name });
            }
            await refreshWorkspaces();
        } catch (err) {
            console.error('Could not rename that workbook:', err);
            alert(err instanceof Error ? err.message : 'Could not rename that workbook.');
        }
    };

    const handleDeleteWorkspace = async (id: string) => {
        setSwitching(true);
        try {
            await deleteWorkspace(id);
            forgetWorkspaceId(id);
            const remaining = await refreshWorkspaces();

            // Deleting the one you are looking at has to land you somewhere:
            // the next workbook, or a fresh one if that was the last.
            if (id === workspaceId) {
                const next = remaining.find((entry) => entry.id !== id);
                if (next) {
                    await openWorkspace(next.id, next.name);
                } else {
                    const fresh = await createWorkspace('My Sheet');
                    await openWorkspace(fresh, 'My Sheet');
                    await refreshWorkspaces();
                }
            }
        } catch (err) {
            console.error('Could not delete that workbook:', err);
            alert(err instanceof Error ? err.message : 'Could not delete that workbook.');
        } finally {
            setSwitching(false);
        }
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

    if (showOpener) {
        return (
            <WorkbookOpener
                workbooks={workspaces}
                onOpen={handleOpenFromOpener}
                onCreate={handleCreateWorkspace}
                // Nothing to go back to until a workbook is actually open.
                onDismiss={workspace ? () => setShowOpener(false) : undefined}
                busy={switching}
            />
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

    return (
        <>
            <WorkModeWorkspace
                /* Remounted on switch: the spreadsheet reads its starting
                   state once, so handing it a different workbook in place
                   would leave the previous one's grid on screen. */
                key={workspaceId ?? 'none'}
                workspace={workspace}
                workspaces={workspaces.map((entry) => ({
                    id: entry.id,
                    name: entry.name,
                    workspace_type: 'work'
                } as Workspace))}
                data={data}
                isCreatingSheet={isCreatingSheet || switching}
                onWorkspaceChange={handleWorkspaceChange}
                onRenameWorkspace={handleRenameWorkspace}
                onDeleteWorkspace={handleDeleteWorkspace}
                onCreateWorkspace={handleCreateWorkspace}
                onShowAllWorkbooks={handleShowOpener}
                onClearData={handleClearData}
                onExportCSV={() => downloadCSV(data as Record<string, unknown>[], currentFilename)}
                onSpreadsheetCommand={async (command: string) => ({
                    success: true,
                    message: `Processed command: "${command}"`
                })}
                onDataUpdate={handleSheetEdit}
                onFileUploadFromSpreadsheet={handleFileUploadFromSpreadsheet}
                currentFilename={currentFilename}
                initialSheets={initialSheets}
                initialSnapshot={initialSnapshot}
                onAdapterReady={handleAdapterReady}
            />

            {/* Renders nothing unless the backend says this install has no
                model chosen yet. Mounted here rather than in the chat sidebar
                so it covers the sheet too: with no model, nothing in either
                half of the app can answer anything. */}
            <ModelSetupDialog />
        </>
    );
}
