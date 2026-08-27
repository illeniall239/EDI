'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import SpreadsheetNavbar from '@/components/SpreadsheetNavbar';
import { Workspace } from '@/types';

// Univer touches window on the way up, so it cannot be server-rendered.
const UniversalSpreadsheet = dynamic(() => import('@/components/UniversalSpreadsheet'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-lg text-foreground font-medium">Loading...</p>
      </div>
    </div>
  ),
});

interface WorkModeWorkspaceProps {
  workspace: Workspace;
  workspaces: Workspace[];
  data: any[];
  isCreatingSheet: boolean;
  onWorkspaceChange: (workspace: Workspace) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onShowAllWorkbooks: () => void;
  onClearData: () => void;
  onExportCSV: () => void;
  onSpreadsheetCommand: (command: string) => Promise<any>;
  onDataUpdate: (data: any[]) => void;
  onFileUploadFromSpreadsheet: (event: React.ChangeEvent<HTMLInputElement>) => void;
  currentFilename?: string;
  initialSheets?: any[];
  /** Passed straight through to the spreadsheet -- see sheetSnapshot.ts. */
  initialSnapshot?: unknown;
  onAdapterReady?: (adapter: any) => void;
}

export default function WorkModeWorkspace({
  workspace,
  workspaces,
  data,
  isCreatingSheet,
  onWorkspaceChange,
  onRenameWorkspace,
  onDeleteWorkspace,
  onCreateWorkspace,
  onShowAllWorkbooks,
  onClearData,
  onExportCSV,
  onSpreadsheetCommand,
  onDataUpdate,
  onFileUploadFromSpreadsheet,
  currentFilename,
  initialSheets,
  initialSnapshot,
  onAdapterReady
}: WorkModeWorkspaceProps) {

  // Local state for dialogs


  // Sync with parent state
  React.useEffect(() => {
    // Listen for parent state changes via custom events or props
    // For now, dialogs are controlled by navbar which calls setShow... functions
  }, []);

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* SpreadsheetNavbar */}
      <SpreadsheetNavbar
        currentWorkspace={workspace}
        workspaces={workspaces}
        onWorkspaceChange={onWorkspaceChange}
        onRenameWorkspace={onRenameWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        onCreateWorkspace={onCreateWorkspace}
        onShowAllWorkbooks={onShowAllWorkbooks}
        onClearData={onClearData}
        onExportCSV={onExportCSV}
        data={data}
      />

      {/* Main Content Area - add top padding for fixed navbar */}
      <div className="pt-12 h-screen">
        <div className="h-full flex flex-col">
          {/* Spreadsheet */}
          <div className="flex-1">
            {isCreatingSheet ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600">Processing your data...</p>
                  {/* Anything over the cap is refused before it gets here, so
                      the longest this spinner can honestly run is a full sheet:
                      measured at eight seconds for 100,000 rows. Saying so
                      keeps those eight seconds from reading as a hang. */}
                  {data.length > 50000 && (
                    <p className="mt-2 max-w-sm text-sm text-gray-500">
                      That is {data.length.toLocaleString()} rows, so the grid needs a few
                      seconds to draw them.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <UniversalSpreadsheet
                data={data}
                onCommand={onSpreadsheetCommand}
                onDataUpdate={onDataUpdate}
                onFileUpload={onFileUploadFromSpreadsheet}
                onClearData={onClearData}
                isDataEmpty={data.length === 0}
                filename={currentFilename}
                isFromSavedWorkspace={true}
                initialSheets={initialSheets}
                initialSnapshot={initialSnapshot}
                onAdapterReady={onAdapterReady}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}