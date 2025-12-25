'use client';

import React, { useState } from 'react';
import SpreadsheetWrapper from '@/components/SpreadsheetWrapper';
import SpreadsheetNavbar from '@/components/SpreadsheetNavbar';
import SyntheticDatasetDialog, { SyntheticDatasetSpecs } from '@/components/SyntheticDatasetDialog';
import ColumnExtractionDialog from '@/components/ColumnExtractionDialog';
import { Workspace } from '@/types';
import { API_ENDPOINTS, API_BASE_URL } from '@/config';

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
  setShowSyntheticDatasetDialog: (show: boolean) => void;
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
  setShowSyntheticDatasetDialog,
  setShowColumnExtraction,
  currentFilename,
  initialSheets,
  onAdapterReady
}: WorkModeWorkspaceProps) {

  // Local state for dialogs
  const [showSyntheticDialog, setShowSyntheticDialog] = useState(false);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  void _onExtractColumns;

  // Sync with parent state
  React.useEffect(() => {
    // Listen for parent state changes via custom events or props
    // For now, dialogs are controlled by navbar which calls setShow... functions
  }, []);

  const handleShowFormulaAssistant = () => {
    console.log('📝 Formula Assistant clicked');
    // Dispatch event for UniversalSpreadsheet to handle
    window.dispatchEvent(new Event('openFormulaAssistant'));
  };

  // Handle synthetic dataset generation
  const handleSyntheticDatasetGeneration = async (specs: SyntheticDatasetSpecs) => {
    try {
      console.log('🧬 Generating synthetic dataset...', specs);
      
      const response = await fetch(API_ENDPOINTS.generateSyntheticDataset, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specs)
      });

      const result = await response.json();
      
      if (result.success && result.data) {
        console.log('✅ Dataset generated:', result.data.length, 'rows');
        
        // Update parent data
        onDataUpdate(result.data);
        
        // Dispatch dataUpdate event for spreadsheet components
        const dataUpdateEvent = new CustomEvent('dataUpdate', { 
          detail: { 
            data: result.data,
            filename: `${result.dataset_name}.csv` 
          } 
        });
        window.dispatchEvent(dataUpdateEvent);
        
        // Close dialog
        setShowSyntheticDialog(false);
        setShowSyntheticDatasetDialog(false);
      } else {
        throw new Error(result.message || 'Failed to generate dataset');
      }
    } catch (error) {
      console.error('❌ Error generating dataset:', error);
      throw error;
    }
  };

  // Handle column extraction
  const handleColumnExtraction = async (selectedColumns: string[], sheetName?: string) => {
    try {
      console.log('🔧 === EXTRACTING COLUMNS ===');
      console.log('📋 Selected columns:', selectedColumns);
      console.log('🏷️ Sheet name:', sheetName);

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
      console.log('✅ Extraction result:', result);

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

        console.log(`✅ Successfully dispatched addNewSheet event for: ${result.sheet_name}`);
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
        onGenerateDataset={() => {
          setShowSyntheticDialog(true);
          setShowSyntheticDatasetDialog(true);
        }}
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
        setShowSyntheticDatasetDialog={(show) => {
          setShowSyntheticDialog(show);
          setShowSyntheticDatasetDialog(show);
        }}
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
              <SpreadsheetWrapper
                data={data}
                onCommand={onSpreadsheetCommand}
                onDataUpdate={onDataUpdate}
                onFileUpload={onFileUploadFromSpreadsheet}
                onClearData={onClearData}
                isDataEmpty={data.length === 0}
                filename={currentFilename}
                isFromSavedWorkspace={true}
                mode="work"
                initialSheets={initialSheets}
                onAdapterReady={onAdapterReady}
              />
            )}
          </div>
        </div>
      </div>

      {/* Synthetic Dataset Dialog */}
      <SyntheticDatasetDialog
        isOpen={showSyntheticDialog}
        onClose={() => {
          setShowSyntheticDialog(false);
          setShowSyntheticDatasetDialog(false);
        }}
        onGenerate={handleSyntheticDatasetGeneration}
      />

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