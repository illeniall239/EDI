'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import SpreadsheetNavbar from '@/components/SpreadsheetNavbar';
import ColumnExtractionDialog from '@/components/ColumnExtractionDialog';
import { Workspace } from '@/types';
import { API_BASE_URL } from '@/config';

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
  isGeneratingReport: boolean;
  onWorkspaceChange: (workspace: Workspace) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onFileUpload: (files: FileList) => void;
  onGenerateQualityReport: () => void;
  onGenerateReport: () => void;
  onExtractColumns: () => void;
  onClearData: () => void;
  onSpreadsheetCommand: (command: string) => Promise<any>;
  onDataUpdate: (data: any[]) => void;
  onFileUploadFromSpreadsheet: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setShowColumnExtraction: (show: boolean) => void;
  currentFilename?: string;
  initialSheets?: any[];
  onAdapterReady?: (adapter: any) => void;
}

export default function WorkModeWorkspace({
  workspace,
  workspaces,
  data,
  isCreatingSheet,
  isGeneratingReport,
  onWorkspaceChange,
  onRenameWorkspace,
  onDeleteWorkspace,
  onFileUpload,
  onGenerateQualityReport,
  onGenerateReport,
  onExtractColumns: _onExtractColumns,
  onClearData,
  onSpreadsheetCommand,
  onDataUpdate,
  onFileUploadFromSpreadsheet,
  setShowColumnExtraction,
  currentFilename,
  initialSheets,
  onAdapterReady
}: WorkModeWorkspaceProps) {

  // Local state for dialogs
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  void _onExtractColumns;

  // Sync with parent state
  React.useEffect(() => {
    // Listen for parent state changes via custom events or props
    // For now, dialogs are controlled by navbar which calls setShow... functions
  }, []);

  const handleShowFormulaAssistant = () => {
    // Dispatch event for UniversalSpreadsheet to handle
    window.dispatchEvent(new Event('openFormulaAssistant'));
  };

  // Handle column extraction
  const handleColumnExtraction = async (selectedColumns: string[], sheetName?: string) => {
    try {

      // Call backend API to extract columns (creates new sheet data)
      const response = await fetch(`${API_BASE_URL}/api/extract-columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_columns: selectedColumns,
          sheet_name: sheetName
        })
      });

      const result = await response.json();

      if (result.success && result.sheet_data) {
        // Dispatch event for UniversalSpreadsheet to add new sheet
        const addSheetEvent = new CustomEvent('addNewSheet', {
          detail: {
            sheetData: result.sheet_data,
            sheetName: result.sheet_name || sheetName || `Extracted_${selectedColumns.length}cols`,
            selectedColumns
          }
        });
        window.dispatchEvent(addSheetEvent);

      } else {
        throw new Error(result.error || 'Failed to extract columns');
      }

      // Close dialog
      setShowColumnDialog(false);
      setShowColumnExtraction(false);
    } catch (error) {
      console.error('❌ Error extracting columns:', error);
      alert(`Error extracting columns: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* SpreadsheetNavbar */}
      <SpreadsheetNavbar
        currentWorkspace={workspace}
        workspaces={workspaces}
        onWorkspaceChange={onWorkspaceChange}
        onRenameWorkspace={onRenameWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        onFileUpload={onFileUpload}
        onGenerateQualityReport={onGenerateQualityReport}
        onGenerateReport={onGenerateReport}
        onExtractColumns={() => {
          setShowColumnDialog(true);
          setShowColumnExtraction(true);
        }}
        onClearData={onClearData}
        data={data}
        isGeneratingReport={isGeneratingReport}
        onShowFormulaAssistant={handleShowFormulaAssistant}
        setShowColumnExtraction={(show) => {
          setShowColumnDialog(show);
          setShowColumnExtraction(show);
        }}
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
                onAdapterReady={onAdapterReady}
              />
            )}
          </div>
        </div>
      </div>

      {/* Column Extraction Dialog */}
      <ColumnExtractionDialog
        isOpen={showColumnDialog}
        onClose={() => {
          setShowColumnDialog(false);
          setShowColumnExtraction(false);
        }}
        onExtract={handleColumnExtraction}
      />
    </div>
  );
}