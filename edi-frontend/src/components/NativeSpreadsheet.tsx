'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import UserProfile from '@/components/UserProfile';
import { SpreadsheetCommandProcessor, SpreadsheetCommand } from '@/utils/spreadsheetCommandProcessor';
import { commandService, requiresBackendProcessing } from '@/services/commandService';
import { useRouter } from 'next/navigation';
import ReportGenerator from '@/components/ReportGenerator';
import { supabase } from '@/utils/supabase';
import FormulaErrorService, { FormulaError } from '@/services/formulaErrorService';
import { v4 as uuidv4 } from 'uuid';
import ColumnExtractionDialog from '@/components/ColumnExtractionDialog';
import { API_BASE_URL } from '@/config';

// Declare luckysheet global
declare global {
  interface Window {
    luckysheet: any;
  }

interface LuckysheetCellData {
  v: string | number | null;
  m?: string;
  ct?: { fa: string; t: string };
  f?: string;
  [key: string]: any;
}
}

interface NativeSpreadsheetProps {
  data?: Array<any>;
  onCommand?: (command: string) => Promise<any>;
  onDataUpdate?: (newData: Array<any>) => void;
  onFileUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearData?: () => void;
  isDataEmpty?: boolean;
}

// Add a new interface for data history tracking
interface DataHistoryEntry {
  data: any[];
  timestamp: number;
  operation: string;
}

// Add new interfaces
interface FormulaErrorDialogProps {
  error: FormulaError;
  onClose: () => void;
}

// Add FormulaErrorDialog component
const FormulaErrorDialog: React.FC<FormulaErrorDialogProps> = ({ error, onClose }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Calculate position based on the error cell
    const calculatePosition = () => {
      // Get the cell reference (e.g., "E2")
      const cellRef = error.cellReference;
      
      // Try to find the cell element in the DOM
      const cellElement = document.querySelector(`[data-cell="${cellRef}"]`) || 
                         document.querySelector(`[data-r="${parseInt(cellRef.slice(1)) - 1}"][data-c="${cellRef.charCodeAt(0) - 65}"]`);
      
      if (cellElement) {
        const rect = cellElement.getBoundingClientRect();
        const dialogWidth = 350;
        const dialogHeight = 200;
        
        // Position to the right of the cell, or left if not enough space
        let left = rect.right + 10;
        let top = rect.top;
        
        // Check if dialog would go off screen
        if (left + dialogWidth > window.innerWidth) {
          left = rect.left - dialogWidth - 10;
        }
        
        // Ensure dialog doesn't go off the top or bottom
        if (top + dialogHeight > window.innerHeight) {
          top = window.innerHeight - dialogHeight - 10;
        }
        if (top < 10) {
          top = 10;
        }
        
        setPosition({ top, left });
      } else {
        // Fallback to center if cell not found
        setPosition({ 
          top: window.innerHeight / 2 - 100, 
          left: window.innerWidth / 2 - 175 
        });
      }
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [error.cellReference]);

  const handleImplementFix = () => {
    // Extract suggested formula from solution text
    const solutionText = error.solution || '';
    
    // Look for formula patterns in the solution
    const formulaMatch = solutionText.match(/['"`]?=([^'"`\s]+)['"`]?/);
    let suggestedFormula = '';
    
    if (formulaMatch) {
      suggestedFormula = '=' + formulaMatch[1];
    } else {
      // Try to fix common issues
      const currentFormula = error.formula;
      if (currentFormula.includes('D$:D')) {
        suggestedFormula = currentFormula.replace('D$:D', 'D:D');
      } else if (currentFormula.includes('#NAME?')) {
        // For NAME errors, suggest checking function spelling
        suggestedFormula = currentFormula;
      }
    }

    if (suggestedFormula && window.luckysheet) {
      try {
        // Parse cell reference
        const cellRef = error.cellReference;
        const col = cellRef.charCodeAt(0) - 65; // A=0, B=1, etc.
        const row = parseInt(cellRef.slice(1)) - 1; // Convert to 0-based
        
        // Set the corrected formula
        window.luckysheet.setCellValue(row, col, suggestedFormula);
        
        // Show success message
        console.log(`Applied fix: ${suggestedFormula} to cell ${cellRef}`);
        
        // Close the dialog
        onClose();
      } catch (err) {
        console.error('Failed to apply fix:', err);
      }
    }
  };

  return (
    <div 
      className="fixed z-[2000] bg-white rounded-lg shadow-2xl border border-gray-200 max-w-sm"
      style={{ 
        top: `${position.top}px`, 
        left: `${position.left}px`,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* Arrow pointing to cell */}
      <div className="absolute -left-2 top-4 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-white"></div>
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Formula Error</h3>
            <p className="text-xs text-gray-500">Cell {error.cellReference}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 p-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-3">
          <div className="bg-red-50 p-2 rounded-md">
            <h4 className="text-xs font-medium text-red-800 mb-1">Problem</h4>
            <p className="text-xs text-red-700">{error.errorMessage}</p>
            <div className="mt-1 text-xs text-red-600">
              <code className="bg-red-100 px-1 rounded text-xs">{error.formula}</code>
            </div>
          </div>
          
          {error.solution && (
            <div className="bg-green-50 p-2 rounded-md">
              <h4 className="text-xs font-medium text-green-800 mb-1">Solution</h4>
              <p className="text-xs text-green-700">{error.solution}</p>
            </div>
          )}
          
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleImplementFix}
              className="flex-1 bg-blue-600 text-white text-xs py-2 px-3 rounded-md hover:bg-blue-700 transition-colors"
            >
              Apply Fix
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 text-xs py-2 px-3 rounded-md hover:bg-gray-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
        
        <div className="text-xs text-gray-400 mt-2 pt-2 border-t">
          {new Date(error.timestamp).toLocaleTimeString()}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default function NativeSpreadsheet({ data = [], onCommand, onDataUpdate, onFileUpload, onClearData, isDataEmpty }: NativeSpreadsheetProps) {
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [voiceCommand, setVoiceCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showCommandPanel, setShowCommandPanel] = useState(true);
  const [isLuckysheetReady, setIsLuckysheetReady] = useState(false);
  const [luckysheetInitialized, setLuckysheetInitialized] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [commandStats, setCommandStats] = useState<{
    lastCommand?: string;
    processingTime?: number;
    routingDecision?: 'local' | 'backend' | 'fallback';
    columnMapping?: any;
  }>({});
  const [showChatInterface, setShowChatInterface] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isTyping?: boolean;
    visualization?: { path: string };
  }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const { currentWorkspace, setCurrentWorkspace, workspaces, setWorkspaces } = useWorkspace();
  const router = useRouter();
  
  // Add state for data quality report
  const [showDataQualityReport, setShowDataQualityReport] = useState(false);
  const [dataQualityReport, setDataQualityReport] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [dataQualityReportHash, setDataQualityReportHash] = useState<string>('');
  const [lastReportTimestamp, setLastReportTimestamp] = useState<number>(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const initializationAttempted = useRef(false);
  
  // Add command processor
  const commandProcessorRef = useRef<SpreadsheetCommandProcessor | null>(null);
  // Add new states for custom data history
  const [historyState, setHistoryState] = useState({
    dataHistory: [] as DataHistoryEntry[],
    currentHistoryIndex: -1
  });
  const [lastOperation, setLastOperation] = useState<string | null>(null);

  // --- Formula Dialog State ---
  const [showFormulaDialog, setShowFormulaDialog] = useState(false);
  const [formulaInput, setFormulaInput] = useState('');
  const [formulaDialogPos, setFormulaDialogPos] = useState<{top: number, left: number} | null>(null);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [generatedFormula, setGeneratedFormula] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [formulaCell, setFormulaCell] = useState<{row: number, col: number} | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Add at the top of the component, after useState declarations
  const [sheets, setSheets] = useState<any[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // Add state for draggable chat modal position
  const [chatModalPos, setChatModalPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const chatModalRef = useRef<HTMLDivElement>(null);

  // Add state for draggable formula modal position
  const [isDraggingFormula, setIsDraggingFormula] = useState(false);
  const [formulaDragOffset, setFormulaDragOffset] = useState<{x: number, y: number}>({x: 0, y: 0});
  const formulaModalRef = useRef<HTMLDivElement>(null);

  // Helper: Get all columns from data
  const allColumns = data && data.length > 0 ? Object.keys(data[0]) : [];
  // Helper: Map column index to letter (A, B, ...)
  const columnLetter = (index: number) => String.fromCharCode(65 + index);

  // Convert Luckysheet data back to array format
  const convertLuckysheetToArrayData = (sheetData: any[][]): any[] => {
    if (!sheetData || sheetData.length === 0) return [];
    
    try {
      // Find the first non-empty row to get headers
      let headerRow: any[] | null = null;
      let headerRowIndex = 0;
      
      for (let i = 0; i < Math.min(sheetData.length, 10); i++) {
        if (sheetData[i] && sheetData[i].some(cell => cell !== null && cell !== undefined && cell !== '')) {
          headerRow = sheetData[i];
          headerRowIndex = i;
          break;
        }
      }
      
      if (!headerRow) return [];
      
      // Find the last column with actual header data (stop at first empty header)
      let lastValidColumn = -1;
      for (let i = 0; i < headerRow.length; i++) {
        const cell = headerRow[i];
        const value = cell && typeof cell === 'object' && cell.v !== undefined ? cell.v : cell;
        
        if (value && value !== '' && value !== null && value !== undefined) {
          // Only include headers that don't match auto-generated pattern
          if (!String(value).match(/^Column \d+$/)) {
            lastValidColumn = i;
          }
        } else {
          // Stop at first empty header
          break;
        }
      }
      
      if (lastValidColumn === -1) return [];
      
      // Extract only valid headers (up to lastValidColumn + 1)
      const headers: string[] = [];
      for (let i = 0; i <= lastValidColumn; i++) {
        const cell = headerRow[i];
        let value = cell && typeof cell === 'object' && cell.v !== undefined ? cell.v : cell;
        
        // Skip auto-generated column names
        if (value && !String(value).match(/^Column \d+$/)) {
          headers.push(String(value));
        } else if (value) {
          // If we encounter an auto-generated name, stop here
          break;
        }
      }
      
      if (headers.length === 0) return [];
      
      console.log('🔍 Extracted headers:', headers, 'from column range 0-' + lastValidColumn);
      
      // Convert data rows (only use the valid column range)
      const dataRows: any[] = [];
      for (let i = headerRowIndex + 1; i < sheetData.length; i++) {
        if (!sheetData[i]) continue;
        
        const rowData: any = {};
        let hasData = false;
        
        // Use original column order if available, otherwise use extracted headers
        const columnOrder = originalColumnOrder.length > 0 ? originalColumnOrder : headers;
        
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          const cell = sheetData[i][j];
          let value = '';
          
          if (cell && typeof cell === 'object' && cell.v !== undefined) {
            value = cell.v;
          } else if (cell !== null && cell !== undefined) {
            value = cell;
          }
          
          rowData[header] = value;
          if (value !== '' && value !== null && value !== undefined) {
            hasData = true;
          }
        }
        
        if (hasData) {
          // Reorder the row data according to original column order
          if (originalColumnOrder.length > 0) {
            const orderedRowData: any = {};
            originalColumnOrder.forEach(col => {
              if (rowData.hasOwnProperty(col)) {
                orderedRowData[col] = rowData[col];
              }
            });
            dataRows.push(orderedRowData);
          } else {
            dataRows.push(rowData);
          }
        }
      }
      
      console.log('🔄 Converted', dataRows.length, 'rows with', headers.length, 'columns');
      return dataRows;
    } catch (error) {
      console.error('Error converting Luckysheet data to array format:', error);
      return [];
    }
  };

  // Import saveWorkspaceData function
  const { saveWorkspaceData } = require('@/utils/api');
  
  // Manual save function
  const saveCurrentState = useCallback(async (operation: string = 'Manual Save') => {
    if (!window.luckysheet || !luckysheetInitialized) {
      console.log('Luckysheet not ready for saving');
      return false;
    }
    
    if (!currentWorkspace?.id) {
      console.log('No workspace ID available');
      return false;
    }
    
    try {
      const currentSheetData = window.luckysheet.getSheetData();
      if (!currentSheetData || currentSheetData.length === 0) {
        console.log('No data to save');
        return false;
      }
      
      const convertedData = convertLuckysheetToArrayData(currentSheetData);
      const dataString = JSON.stringify(convertedData);
      
      // Only save if data has actually changed
      if (dataString === lastSavedDataRef.current) {
        console.log('No changes to save');
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
      }
      
      console.log('💾 Saving workspace data...', {
        operation,
        rows: convertedData.length,
        workspaceId: currentWorkspace.id
      });
      
      setSaveStatus('saving');
      
      // Ensure data uses original column order before saving
      const orderedData = convertedData.map(row => {
        if (originalColumnOrder.length > 0) {
          const orderedRow: any = {};
          originalColumnOrder.forEach(col => {
            if (row.hasOwnProperty(col)) {
              orderedRow[col] = row[col];
            }
          });
          return orderedRow;
        }
        return row;
      });
      
      // Save directly to workspace without triggering component refresh
      await saveWorkspaceData(currentWorkspace.id, orderedData);
      
      lastSavedDataRef.current = dataString;
      setSaveStatus('saved');
      setLastSaveTime(new Date());
      setHasUnsavedChanges(false);
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('❌ Save failed:', error);
      setSaveStatus('error');
      
      // Reset status after 4 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 4000);
      
      return false;
    }
  }, [luckysheetInitialized, currentWorkspace?.id, convertLuckysheetToArrayData]);

  // Function to track changes without auto-saving
  const trackDataChange = useCallback((operation: string = 'Change') => {
    console.log('📝 Data change detected:', operation);
    setHasUnsavedChanges(true);
  }, []);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  
  // Excel-style navigation state

  const [currentError, setCurrentError] = useState<FormulaError | null>(null);
  const errorService = FormulaErrorService.getInstance();

  // Add initialization check flag
  const [isSheetFullyLoaded, setIsSheetFullyLoaded] = useState(false);

  // Add state for error history panel
  const [showErrorHistory, setShowErrorHistory] = useState(false);
  const [errorHistory, setErrorHistory] = useState<FormulaError[]>([]);
  
  // Add state for column extraction dialog
  const [showColumnExtraction, setShowColumnExtraction] = useState(false);

  // Manual save functionality
  const lastSavedDataRef = useRef<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Track original column order to preserve it throughout operations
  const [originalColumnOrder, setOriginalColumnOrder] = useState<string[]>([]);

  // Load error history when component mounts
  useEffect(() => {
    const loadErrorHistory = () => {
      const history = errorService.getErrorHistory();
      setErrorHistory(history);
    };
    
    loadErrorHistory();
    
    // Update history when new errors are added
    const interval = setInterval(loadErrorHistory, 1000);
    return () => clearInterval(interval);
  }, []);

  // Formula Error History Panel Component
  const FormulaErrorHistoryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const handleApplyHistoryFix = (error: FormulaError) => {
      // Same logic as handleImplementFix but for history items
      const solutionText = error.solution || '';
      const formulaMatch = solutionText.match(/['"`]?=([^'"`\s]+)['"`]?/);
      let suggestedFormula = '';
      
      if (formulaMatch) {
        suggestedFormula = '=' + formulaMatch[1];
      } else {
        const currentFormula = error.formula;
        if (currentFormula.includes('D$:D')) {
          suggestedFormula = currentFormula.replace('D$:D', 'D:D');
        }
      }

      if (suggestedFormula && window.luckysheet) {
        try {
          const cellRef = error.cellReference;
          const col = cellRef.charCodeAt(0) - 65;
          const row = parseInt(cellRef.slice(1)) - 1;
          
          window.luckysheet.setCellValue(row, col, suggestedFormula);
          console.log(`Applied fix from history: ${suggestedFormula} to cell ${cellRef}`);
          
          // Mark as resolved
          errorService.markErrorAsResolved(error.id);
          setErrorHistory(errorService.getErrorHistory());
        } catch (err) {
          console.error('Failed to apply fix from history:', err);
        }
      }
    };

    const handleClearHistory = () => {
      errorService.clearErrorHistory();
      setErrorHistory([]);
    };

    return (
      <div className="fixed top-4 right-4 w-96 max-h-[80vh] bg-white rounded-lg shadow-2xl border border-gray-200 z-[2000] overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Formula Error History</h3>
            <div className="flex gap-2">
              {errorHistory.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 p-1"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
          {errorHistory.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No formula errors yet</p>
              <p className="text-xs text-gray-400 mt-1">Errors will appear here when they occur</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {errorHistory.map((error, index) => (
                <div key={error.id} className={`p-4 ${error.resolved ? 'bg-green-50' : 'bg-white'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        error.resolved 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {error.resolved ? '✓ Resolved' : '⚠ Error'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">Cell {error.cellReference}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(error.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="bg-red-50 p-2 rounded">
                      <p className="text-xs font-medium text-red-800">Problem:</p>
                      <p className="text-xs text-red-700 mt-1">{error.errorMessage}</p>
                      <code className="text-xs bg-red-100 px-1 rounded mt-1 inline-block">{error.formula}</code>
                    </div>
                    
                    {error.solution && (
                      <div className="bg-green-50 p-2 rounded">
                        <p className="text-xs font-medium text-green-800">Solution:</p>
                        <p className="text-xs text-green-700 mt-1">{error.solution}</p>
                      </div>
                    )}
                    
                    {!error.resolved && (
                      <button
                        onClick={() => handleApplyHistoryFix(error)}
                        className="w-full bg-blue-600 text-white text-xs py-2 px-3 rounded hover:bg-blue-700 transition-colors"
                      >
                        Apply Fix to {error.cellReference}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Track processed errors to prevent duplicates
  const [processedErrors, setProcessedErrors] = useState<Set<string>>(new Set());

  // Simple handleFormulaError function with deduplication
  const handleFormulaError = useCallback(async (cellInfo: any) => {
    if (!isSheetFullyLoaded) return;

    console.log('🚨 handleFormulaError called with:', cellInfo);

    // Extract cell information
    const row = cellInfo.r ?? cellInfo.row;
    const col = cellInfo.c ?? cellInfo.col;
    const value = cellInfo.v ?? cellInfo.value;
    let formula = cellInfo.f ?? cellInfo.formula ?? '';
    
    console.log('📋 Extracted cell info:', { row, col, value, formula });
    
    // Additional validation
    if (!value || typeof value !== 'string' || !value.startsWith('#')) return;
    
    const errorMatch = value.match(/#([A-Z]+)[\?!]/);
    if (!errorMatch) return;
    
    const errorType = errorMatch[1];
    const cellRef = `${String.fromCharCode(65 + col)}${row + 1}`;
    
    console.log('🔍 Error details:', { errorType, cellRef, value });

    // If formula is empty or contains error result, try to get actual formula from Luckysheet
    console.log('🔍 Formula retrieval debug:', {
      originalFormula: formula,
      cellValue: value,
      cellRef,
      needsRetrieval: !formula || formula.startsWith('#') || formula === value
    });
    
    if (!formula || formula.startsWith('#') || formula === value) {
      try {
        // Try multiple methods to get the formula
        const methods = [
          () => window.luckysheet.getCellValue(row, col, 'f'),
          () => window.luckysheet.getSheetData()[row][col]?.f,
          () => window.luckysheet.getSheetData()[row]?.[col]?.f,
          () => {
            const cellData = window.luckysheet.getSheetData()?.[row]?.[col];
            return cellData?.f || cellData?.formula;
          }
        ];
        
        let actualFormula = null;
        for (let i = 0; i < methods.length; i++) {
          try {
            const result = methods[i]();
            console.log(`🔧 Method ${i + 1} result:`, result);
            if (result && !result.startsWith('#') && result !== value) {
              actualFormula = result;
              console.log(`✅ Found formula using method ${i + 1}:`, actualFormula);
              break;
            }
          } catch (methodErr) {
            console.log(`❌ Method ${i + 1} failed:`, methodErr);
          }
        }
        
        if (actualFormula) {
          formula = actualFormula;
          console.log('✅ Retrieved actual formula from Luckysheet:', actualFormula);
        } else {
          console.warn('⚠️ Could not retrieve actual formula from any method');
        }
      } catch (err) {
        console.log('❌ Could not retrieve formula from Luckysheet:', err);
      }
    } else {
      console.log('✅ Using original formula:', formula);
    }

    // Clean up the formula by removing any internal Luckysheet function prefixes
    const cleanFormula = formula.replace(/luckysheet_function\.|\.f/g, '');
    let displayFormula = cleanFormula.startsWith('=') ? cleanFormula : `=${cleanFormula}`;
    
    // Final validation - if we still don't have a valid formula, create a placeholder
    if (!formula || formula.startsWith('#') || displayFormula === '=' || displayFormula === `=#${errorType}?`) {
      displayFormula = `=UNKNOWN_FORMULA_${cellRef}()`;
      console.warn('Could not determine original formula for error analysis, using placeholder');
    }
    
    // Create unique error identifier
    const errorId = `${cellRef}-${displayFormula}-${errorType}`;
    
    // Check if we already processed this exact error
    if (processedErrors.has(errorId)) {
      console.log('Skipping already processed error:', errorId);
      return;
    }
    
    console.log('Processing new formula error:', {
      errorType,
      cellRef,
      originalFormula: formula,
      cleanFormula: displayFormula,
      errorId
    });
    
    // Mark as processed
    setProcessedErrors(prev => new Set(prev).add(errorId));
    
    try {
      const error = await errorService.analyzeError(cellRef, displayFormula, errorType);
      if (error) {
        console.log('Error analysis result:', error);
        setCurrentError(error);
        // Refresh error history
        setErrorHistory(errorService.getErrorHistory());
      }
    } catch (err) {
      console.error('Failed to analyze formula error:', err);
      // Create a basic error object for syntax errors
      const syntaxError: FormulaError = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        cellReference: cellRef,
        formula: displayFormula,
        errorType: errorType,
        errorMessage: 'Invalid formula syntax',
        solution: 'Please check the formula syntax. Make sure all cell references and function names are correct.'
      };
      setCurrentError(syntaxError);
      // Refresh error history
      setErrorHistory(errorService.getErrorHistory());
    }
  }, [isSheetFullyLoaded, processedErrors]);

  // Add formula syntax validation
  const validateFormulaSyntax = (formula: string): boolean => {
    // Basic formula validation
    if (!formula) return false;
    
    // Check for basic syntax errors
    const hasValidParentheses = (str: string) => {
      let count = 0;
      for (let char of str) {
        if (char === '(') count++;
        if (char === ')') count--;
        if (count < 0) return false;
      }
      return count === 0;
    };

    // Remove any Luckysheet internal function prefixes
    const cleanFormula = formula.replace(/luckysheet_function\.|\.f/g, '');
    
    // Basic syntax checks
    const isValid = 
      cleanFormula.startsWith('=') &&
      hasValidParentheses(cleanFormula) &&
      !cleanFormula.includes('..') && // No double dots in ranges
      !cleanFormula.match(/[^A-Za-z0-9\s\(\)\+\-\*\/\:\$\,\.]/) // No invalid characters
    ;

    return isValid;
  };

  // Update initialization effect
  useEffect(() => {
    if (!luckysheetInitialized || !window.luckysheet) return;

    // Wait for sheet to be fully loaded
    const checkSheetLoaded = () => {
      const currentSheet = window.luckysheet.getSheetData();
      if (currentSheet) {
        setIsSheetFullyLoaded(true);
      }
    };

    // Check after a short delay to ensure sheet is loaded
    setTimeout(checkSheetLoaded, 1000);
  }, [luckysheetInitialized]);

  // Modified error detection system
  useEffect(() => {
    if (!luckysheetInitialized || !window.luckysheet || !isSheetFullyLoaded) return;

    const checkForErrors = () => {
      const currentSheet = window.luckysheet.getSheetData();
      if (!currentSheet) return;

      currentSheet.forEach((row: any, r: number) => {
        if (!row) return;
        row.forEach((cell: any, c: number) => {
          if (!cell || !cell.v) return;
          
          // Check for formula errors
          if (
            typeof cell.v === 'string' && 
            cell.v.startsWith('#') &&
            cell.f // Must have a formula
          ) {
            console.log('Found formula error:', { r, c, cell });
            handleFormulaError({
              r,
              c,
              v: cell.v,
              f: cell.f
            });
          }
        });
      });
    };

    // Hook into formula calculation
    const originalFormulaCalc = window.luckysheet.calculateFormula;
    window.luckysheet.calculateFormula = function(formula: string, r: number, c: number, ...args: any[]) {
      try {
        const result = originalFormulaCalc.call(window.luckysheet, formula, r, c, ...args);
        
        // Check for errors in the result
        if (typeof result === 'string' && result.startsWith('#')) {
          handleFormulaError({
            r,
            c,
            v: result,
            f: formula
          });
        }
        return result;
      } catch (err) {
        console.error('Formula calculation error:', err);
        // Handle syntax errors
        handleFormulaError({
          r,
          c,
          v: '#NAME?',
          f: formula
        });
        return '#NAME?';
      }
    };

    return () => {
      if (window.luckysheet) {
        window.luckysheet.calculateFormula = originalFormulaCalc;
      }
    };
  }, [luckysheetInitialized, isSheetFullyLoaded, handleFormulaError]);

  // Add to cellUpdateHandler
  const cellUpdateHandler = useCallback((r: number, c: number, v: any) => {
    console.log('Cell Update:', { row: r, col: c, value: v });
    
    // Check for formula errors
    if (v && typeof v === 'string' && v.startsWith('#')) {
      // Get the actual formula from Luckysheet instead of using the error value
      try {
        const actualFormula = window.luckysheet.getCellValue(r, c, 'f');
        console.log('Cell error detected:', { r, c, value: v, actualFormula });
        
        if (actualFormula) {
          handleFormulaError({
            r,
            c,
            v: v,
            f: actualFormula
          });
        }
      } catch (err) {
        console.log('Could not get actual formula for error cell:', err);
      }
    }
  }, [handleFormulaError]);

  // Helper function to detect actual data range for columns
  const getDataRangeInfo = () => {
    if (!data || data.length === 0) return null;
    
    const headers = Object.keys(data[0]);
    const dataStartRow = 2; // Row 2 (after header in row 1)
    
    // For each column, find the last row that actually contains data
    const columnRanges = headers.map((header, idx) => {
      const columnLetter = String.fromCharCode(65 + idx);
      
      // Find the last row with actual data in this column
      let lastDataRow = dataStartRow - 1; // Start before data begins
      for (let i = 0; i < data.length; i++) {
        const cellValue = data[i][header];
        // Check if cell has meaningful data (not null, undefined, empty string, or just whitespace)
        if (cellValue !== null && 
            cellValue !== undefined && 
            cellValue !== '' && 
            (typeof cellValue !== 'string' || cellValue.trim() !== '')) {
          lastDataRow = i + dataStartRow; // +2 because: i is 0-based, +1 for 1-based row numbers, +1 for header
        }
      }
      
      // If no data found, still provide a minimal range
      const dataEndRow = Math.max(lastDataRow, dataStartRow);
      const hasData = lastDataRow >= dataStartRow;
      
      return {
        name: header,
        letter: columnLetter,
        range: hasData ? `${columnLetter}${dataStartRow}:${columnLetter}${dataEndRow}` : `${columnLetter}${dataStartRow}`,
        startRow: dataStartRow,
        endRow: dataEndRow,
        hasData,
        dataCount: hasData ? (dataEndRow - dataStartRow + 1) : 0
      };
    });
    
    const totalDataRows = data.length;
    const maxDataEndRow = Math.max(...columnRanges.map(col => col.endRow));
    
    return {
      totalDataRows,
      dataStartRow,
      dataEndRow: maxDataEndRow,
      columnRanges,
      summary: `Data spans from row ${dataStartRow} to row ${maxDataEndRow} (${totalDataRows} total rows, excluding header). Each column may have different data endpoints.`
    };
  };

  // --- Formula Generation Handler ---
  const generateFormula = async (input: string, row: number, col: number, columns: string[]) => {
    setFormulaLoading(true);
    setFormulaError(null);
    try {
      let formula = '';
      let usedProcessor = false;
      
      // Get data range information
      const dataRangeInfo = getDataRangeInfo();
      
      // Map selected columns to 'name (Letter)' format with range information
      const columnsWithLetters = columns.map(col => {
        const idx = allColumns.indexOf(col);
        if (idx !== -1 && dataRangeInfo) {
          const rangeInfo = dataRangeInfo.columnRanges[idx];
          return `${col} (${rangeInfo.letter}, data range: ${rangeInfo.range})`;
        }
        return idx !== -1 ? `${col} (${columnLetter(idx)})` : col;
      });
      
      let prompt = input;
      if (columnsWithLetters.length > 0) {
        prompt += ` (columns: ${columnsWithLetters.join(', ')})`;
      }
      
      // Add data range context to the prompt
      if (dataRangeInfo) {
        console.log('📊 Detected data ranges:', dataRangeInfo);
        
        // Create a detailed column mapping
        const columnDetails = dataRangeInfo.columnRanges
          .filter(col => col.hasData)
          .map(col => `${col.name} (${col.letter}): ${col.range} [${col.dataCount} data rows]`)
          .join('\n  - ');
        
        prompt += `\n\nIMPORTANT DATA CONTEXT:\n- ${dataRangeInfo.summary}\n- Column data ranges:\n  - ${columnDetails}\n- ALWAYS use specific ranges (e.g., ${dataRangeInfo.columnRanges[0]?.range}) instead of entire columns (e.g., ${dataRangeInfo.columnRanges[0]?.letter}:${dataRangeInfo.columnRanges[0]?.letter})\n- Header is in row 1, actual data starts from row ${dataRangeInfo.dataStartRow}\n- Do not include the header row in calculations`;
      }
      
      // Enhanced data sample analysis for text extraction formulas
      const isTextExtractionRequest = /extract|first.*word|split|left|right|middle|substring|part.*of/i.test(input);
      if (isTextExtractionRequest && data && data.length > 0) {
        console.log('🔍 Detected text extraction request, analyzing data structure...');
        
        // Get sample data from the specified columns or current cell column
        let sampleData: string[] = [];
        
        if (columns.length > 0) {
          // Use selected columns
          columns.forEach(colName => {
            const values = data.slice(0, 5).map(row => row[colName]).filter(val => val && typeof val === 'string');
            sampleData.push(...values);
          });
        } else {
          // Use current cell's column
          const currentColumnName = allColumns[col];
          if (currentColumnName) {
            sampleData = data.slice(0, 5).map(row => row[currentColumnName]).filter(val => val && typeof val === 'string');
          }
        }
        
        // Analyze delimiters in the sample data
        const commonDelimiters = [' ', ':', ',', ';', '|', '-', '_', '/', '\\', '.'];
        const delimiterCounts: {[key: string]: number} = {};
        
        sampleData.forEach(sample => {
          commonDelimiters.forEach(delimiter => {
            if (sample.includes(delimiter)) {
              delimiterCounts[delimiter] = (delimiterCounts[delimiter] || 0) + 1;
            }
          });
        });
        
        // Find the most common delimiter
        let mostCommonDelimiter = ' '; // default
        let maxCount = 0;
        Object.entries(delimiterCounts).forEach(([delimiter, count]) => {
          if (count > maxCount) {
            maxCount = count;
            mostCommonDelimiter = delimiter;
          }
        });
        
        console.log('📋 Data analysis:', {
          sampleData: sampleData.slice(0, 3),
          delimiterCounts,
          mostCommonDelimiter
        });
        
        // Add data structure information to the prompt
        if (sampleData.length > 0) {
          prompt += `\n\nDATA STRUCTURE ANALYSIS:\n- Sample data: ${sampleData.slice(0, 3).join(', ')}\n- Most common delimiter detected: "${mostCommonDelimiter}"\n- Use this delimiter in your formula: FIND("${mostCommonDelimiter}",cell_ref)\n- If extracting first word, use: =IFERROR(LEFT(cell_ref,FIND("${mostCommonDelimiter}",cell_ref)-1),cell_ref)`;
        }
      }
      
      if (commandProcessorRef.current) {
        const cmd = await commandProcessorRef.current.processLLMCommand(prompt);
        if (cmd && cmd.params && cmd.params.formula) {
          formula = cmd.params.formula;
          usedProcessor = true;
        }
      }
      if (!usedProcessor) {
        const fullPrompt = `Write a spreadsheet formula for: ${prompt} (for cell ${String.fromCharCode(65+col)}${row+1})`;
        console.log('🧠 Sending enhanced prompt to LLM:', fullPrompt);
        
        const response = await commandService.processSpreadsheetCommand(fullPrompt);
        if (!response) throw new Error('No response from backend.');
        if (response.message) {
          const match = response.message.match(/=.+/);
          if (match) formula = match[0];
          else formula = response.message;
        }
      }
      if (formula) {
        setGeneratedFormula(formula.startsWith('=') ? formula : '=' + formula);
      } else {
        throw new Error('No formula returned from backend.');
      }
    } catch (err: any) {
      let msg = 'Failed to generate formula.';
      if (err && err.message) msg = err.message;
      else if (typeof err === 'string') msg = err;
      else if (err && err.response && err.response.data && err.response.data.detail) msg = err.response.data.detail;
      setFormulaError(msg);
      setGeneratedFormula(null);
    } finally {
      setFormulaLoading(false);
    }
  };

  // --- Formula Dialog Submit Handler (Step 1: Generate) ---
  const handleFormulaSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!formulaInput.trim() && selectedColumns.length === 0) || formulaLoading) return;
    if (!formulaCell) return;
    setGeneratedFormula(null);
    await generateFormula(formulaInput, formulaCell.row, formulaCell.col, selectedColumns);
  };

  // --- Accept Handler (Step 2: Insert) ---
  const handleFormulaAccept = () => {
    if (!generatedFormula || !formulaCell) return;
    const { row, col } = formulaCell;
    if (
      window.luckysheet &&
      typeof window.luckysheet.setCellValue === 'function'
    ) {
      window.luckysheet.setCellValue(row, col, generatedFormula);
    }
    setShowFormulaDialog(false);
    setGeneratedFormula(null);
    setFormulaInput('');
    setFormulaError(null);
    setSelectedColumns([]);
  };

  // --- Regenerate Handler ---
  const handleFormulaRegenerate = async () => {
    if ((!formulaInput.trim() && selectedColumns.length === 0) || !formulaCell) return;
    await generateFormula(formulaInput, formulaCell.row, formulaCell.col, selectedColumns);
  };

  // --- Cancel Handler ---
  const handleFormulaCancel = () => {
    setShowFormulaDialog(false);
    setGeneratedFormula(null);
    setFormulaInput('');
    setFormulaError(null);
    setSelectedColumns([]);
  };

  // Load Luckysheet scripts
  useEffect(() => {
    let mounted = true;

    const loadLuckysheet = async () => {
      try {
        // Check if already loaded
        if (window.luckysheet) {
          if (mounted) setIsLuckysheetReady(true);
          return;
        }

        console.log('Loading Luckysheet...');
        
        // Load CSS files
        const cssFiles = [
          'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/css/pluginsCss.css',
          'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/plugins.css',
          'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/css/luckysheet.css',
          'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/assets/iconfont/iconfont.css'
        ];

        for (const href of cssFiles) {
          if (!document.querySelector(`link[href="${href}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
          }
        }

        // Load JS files
        const jsFiles = [
          'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/js/plugin.js',
          'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/luckysheet.umd.js'
        ];

        for (const src of jsFiles) {
          if (!document.querySelector(`script[src="${src}"]`)) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = src;
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
        }

        // Wait for Luckysheet to be available
        let attempts = 0;
        while (!window.luckysheet && attempts < 50 && mounted) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (window.luckysheet && mounted) {
          setIsLuckysheetReady(true);
          console.log('Luckysheet loaded successfully');
        } else if (mounted) {
          throw new Error('Luckysheet failed to load after 5 seconds');
        }
      } catch (error) {
        if (mounted) {
        console.error('Error loading Luckysheet:', error);
        setLoadingError(`Failed to load Luckysheet: ${error}`);
        }
      }
    };

    loadLuckysheet();

    return () => {
      mounted = false;
    };
  }, []);

  // Initialize chat with welcome message
  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([{
        id: 'welcome',
        type: 'assistant',
        content: '👋 Hi! I\'m your data analysis assistant. I can help you:\n\n• Analyze trends and patterns\n• Create visualizations\n• Answer questions about your data\n• Provide statistical insights\n• Generate reports\n\nWhat would you like to explore?',
        timestamp: new Date()
      }]);
    }
  }, []);

  // Handle chat message submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🎯 === CHAT SUBMISSION STARTED ===');
    console.log('📝 Form submitted, checking conditions...');
    
    if (!chatInput.trim() || isChatProcessing) {
      console.log('⚠️ Submission blocked:', { 
        inputEmpty: !chatInput.trim(), 
        isProcessing: isChatProcessing 
      });
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      type: 'user' as const,
      content: chatInput.trim(),
      timestamp: new Date()
    };

    console.log('👤 User message created:', userMessage);
    console.log('📊 Current data state:', { 
      hasData: data && data.length > 0, 
      dataLength: data?.length || 0,
      firstRowKeys: data?.[0] ? Object.keys(data[0]) : []
    });

    // Add user message
    setChatMessages(prev => [...prev, userMessage]);
    console.log('✅ User message added to chat');
    
    const inputCommand = chatInput.trim();
    setChatInput('');
    console.log('🧹 Input field cleared');
    
    setIsChatProcessing(true);
    console.log('⏳ Processing state set to true');

    // Check if this looks like a simple command that can be handled locally
    const isSimpleCommand = /^(autofit|undo|redo|format|bold|italic|underline|remove duplicates?|deduplicate|sort|filter)$/i.test(inputCommand) ||
                           /^(autofit columns?|autofit rows?|fit columns?|fit rows?)$/i.test(inputCommand) ||
                           /^(autofit|fit)\s+(columns?|rows?|all)$/i.test(inputCommand) ||
                           /autofit/i.test(inputCommand) && inputCommand.length < 20;

    if (isSimpleCommand) {
      console.log('🔧 === PROCESSING AS SIMPLE COMMAND ===');
      try {
        // Process through voice command handler (which handles local commands)
        await handleVoiceCommand(inputCommand);
        
        // Add success message to chat
        const commandMessage = {
          id: `command-${Date.now()}`,
          type: 'assistant' as const,
          content: `✅ Command "${inputCommand}" executed successfully.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, commandMessage]);
        setIsChatProcessing(false);
        return;
      } catch (error) {
        console.log('⚠️ Simple command failed, falling back to AI analysis');
        // Continue to AI analysis if command fails
      }
    }

    // Add typing indicator for AI analysis
    const typingId = `typing-${Date.now()}`;
    setChatMessages(prev => [...prev, {
      id: typingId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true
    }]);
    console.log('💭 Typing indicator added with ID:', typingId);

    try {
      console.log('🚀 === BACKEND COMMUNICATION STARTED ===');
      console.log('🌐 Target endpoint:', 'http://localhost:8000/api/query');
      console.log('📤 Preparing request for:', inputCommand);
      
      // Send to backend for analysis using the updated commandService
      let response;
      if (data && data.length > 0) {
        console.log('📊 === DATA CONTEXT AVAILABLE ===');
        const headers = Object.keys(data[0]);
        console.log('🏷️ Data headers:', headers);
        console.log('📈 Data dimensions:', `${data.length} rows x ${headers.length} columns`);
        
        const dataRows = data.map(row => headers.map(header => row[header]));
        console.log('🔄 Data converted to rows format');
        console.log('📋 Sample data (first 3 rows):', dataRows.slice(0, 3));
        
        console.log('📡 Calling commandService.analyzeData...');
        response = await commandService.analyzeData(inputCommand, dataRows);
        console.log('✅ analyzeData completed');
      } else {
        console.log('⚠️ === NO DATA CONTEXT ===');
        console.log('📡 Calling commandService.processComplexCommand without data...');
        response = await commandService.processComplexCommand({
          command: inputCommand,
          context: { sheetInfo: { message: 'No data currently loaded' } }
        });
        console.log('✅ processComplexCommand completed');
      }

      console.log('🎉 === BACKEND RESPONSE RECEIVED ===');
      console.log('📦 Full response object:', response);
      console.log('💬 Response message:', response.message);
      console.log('🎨 Visualization data:', response.visualization);
      console.log('🔄 Data updated:', response.data_updated);
      console.log('⏱️ Execution time:', response.executionTime, 'ms');

      // Check if data was updated and refresh if needed
      if (response.data_updated && response.updated_data && onDataUpdate) {
        console.log('🔄 === DATA UPDATE DETECTED ===');
        console.log('📊 Updated data:', response.updated_data);
        console.log('📈 New dimensions:', `${response.updated_data.rows} rows x ${response.updated_data.columns.length} columns`);
        console.log('🏷️ New columns:', response.updated_data.columns);
        console.log('📋 Sample updated data (first 3 rows):', response.updated_data.data.slice(0, 3));
        
        // Update the data in the parent component
        onDataUpdate(response.updated_data.data);
        console.log('✅ Data update callback called');
        
        // Refresh Luckysheet with the new data using the full reset approach
        console.log('🔄 Refreshing Luckysheet with complete reset approach...');
        refreshLuckysheetData(response.updated_data.data);
      }

      // Remove typing indicator
      console.log('🧹 Removing typing indicator:', typingId);
      setChatMessages(prev => prev.filter(msg => msg.id !== typingId));

      // Create assistant response with visualization support
      let assistantContent = response.message || 'I apologize, but I couldn\'t process your request at the moment.';
      console.log('📝 Base assistant content:', assistantContent);
      
      // If there's a visualization, add it to the message
      if (response.visualization) {
        console.log('🎨 === VISUALIZATION DETECTED ===');
        console.log('🖼️ Visualization type:', response.visualization.type);
        console.log('📁 Visualization path:', response.visualization.path);
        assistantContent += `\n\n📊 **Visualization Created**\n[View Visualization](${response.visualization.path})`;
        console.log('✅ Visualization info added to message');
      } else {
        console.log('ℹ️ No visualization in response');
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        type: 'assistant' as const,
        content: assistantContent,
        timestamp: new Date(),
        visualization: response.visualization
      };

      console.log('🤖 Assistant message created:', assistantMessage);
      setChatMessages(prev => [...prev, assistantMessage]);
      console.log('✅ Assistant message added to chat');

    } catch (error) {
      console.log('❌ === ERROR OCCURRED ===');
      console.error('💥 Error details:', error);
      console.error('🔍 Error type:', typeof error);
      console.error('📋 Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('🗂️ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Remove typing indicator
      console.log('🧹 Removing typing indicator due to error:', typingId);
      setChatMessages(prev => prev.filter(msg => msg.id !== typingId));
      
      // Add error message with more details
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorContent = `❌ Sorry, I encountered an error processing your request: ${errorMessage}\n\nPlease make sure the backend server is running on http://localhost:8000`;
      
      console.log('📝 Error message content:', errorContent);
      setChatMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'assistant',
        content: errorContent,
        timestamp: new Date()
      }]);
      console.log('✅ Error message added to chat');
    } finally {
      console.log('🏁 === CHAT SUBMISSION CLEANUP ===');
      setIsChatProcessing(false);
      console.log('✅ Processing state set to false');
      console.log('🎯 === CHAT SUBMISSION COMPLETED ===');
    }
  };

  // Clear chat history
  const clearChatHistory = () => {
    setChatMessages([{
      id: 'welcome-new',
      type: 'assistant',
      content: '👋 Chat cleared! How can I help you analyze your data?',
      timestamp: new Date()
    }]);
  };

  // Generate a hash of the current data for caching
  const generateDataHash = (data: any[]): string => {
    if (!data || data.length === 0) return '';
    
    // Create a simple hash based on data structure and content
    const dataString = JSON.stringify({
      length: data.length,
      columns: Object.keys(data[0]),
      firstRow: data[0],
      lastRow: data[data.length - 1],
      checksum: data.slice(0, 5).map(row => JSON.stringify(row)).join('|')
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  };

  // Generate detailed data quality report with caching
  const generateDataQualityReport = async (forceRegenerate: boolean = false) => {
    if (!data || data.length === 0) {
      alert('No data available for quality analysis');
      return;
    }

    // Generate hash of current data
    const currentDataHash = generateDataHash(data);
    
    // Check if we already have a report for this exact data and it's recent (within 5 minutes)
    const now = Date.now();
    const isRecentReport = (now - lastReportTimestamp) < 5 * 60 * 1000; // 5 minutes
    const isSameData = currentDataHash === dataQualityReportHash;
    
    if (!forceRegenerate && dataQualityReport && isSameData && isRecentReport) {
      console.log('📋 Using cached data quality report (data unchanged)');
      setShowDataQualityReport(true);
      return;
    }

    setIsGeneratingReport(true);
    try {
      console.log('🔍 Generating detailed data quality report...');
      
      // Analyze the data on the frontend first for immediate insights
      const headers = Object.keys(data[0]);
      const totalRows = data.length;
      
      // Check for duplicates with exact row locations
      const duplicateInfo = findDuplicateRows();
      
      // Check for missing values with exact cell locations
      const missingValuesInfo = findMissingValues();
      
      // Check for data type inconsistencies
      const dataTypeIssues = findDataTypeIssues();
      
      // Send to backend for comprehensive analysis
      const response = await commandService.analyzeData(
        'Generate a comprehensive data quality report with exact locations of all issues including duplicates, missing values, and data inconsistencies',
        data.map(row => headers.map(header => row[header]))
      );
      
      const qualityReport = {
        summary: {
          totalRows,
          totalColumns: headers.length,
          dataTypes: getDataTypesSummary(),
          overallQuality: calculateOverallQuality()
        },
        duplicates: duplicateInfo,
        missingValues: missingValuesInfo,
        dataTypeIssues,
        backendAnalysis: response?.message || 'Backend analysis not available',
        generatedAt: new Date().toISOString(),
        dataHash: currentDataHash
      };
      
      setDataQualityReport(qualityReport);
      setDataQualityReportHash(currentDataHash);
      setLastReportTimestamp(now);
      setShowDataQualityReport(true);
      
      console.log('✅ Data quality report generated and cached:', qualityReport);
    } catch (error) {
      console.error('❌ Error generating data quality report:', error);
      alert('Error generating data quality report. Please try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Helper function to find duplicate rows with exact locations
  const findDuplicateRows = () => {
    const rowMap = new Map();
    const duplicates: any[] = [];
    
    data.forEach((row, index) => {
      const rowString = JSON.stringify(row);
      if (rowMap.has(rowString)) {
        const originalIndex = rowMap.get(rowString);
        duplicates.push({
          originalRow: originalIndex + 2, // +2 because Excel starts at 1 and includes header
          duplicateRow: index + 2,
          data: row
        });
      } else {
        rowMap.set(rowString, index);
      }
    });
    
    return {
      count: duplicates.length,
      locations: duplicates,
      summary: duplicates.length > 0 
        ? `Found ${duplicates.length} duplicate rows at: ${duplicates.map(d => `Row ${d.duplicateRow}`).join(', ')}`
        : 'No duplicate rows found'
    };
  };

  // Helper function to find missing values with exact cell locations
  const findMissingValues = () => {
    const headers = Object.keys(data[0]);
    const missingCells: any[] = [];
    const columnSummary: any = {};
    
    headers.forEach(header => {
      columnSummary[header] = { count: 0, cells: [] };
    });
    
    data.forEach((row, rowIndex) => {
      headers.forEach((header, colIndex) => {
        const value = row[header];
        if (value === null || value === undefined || value === '' || 
            (typeof value === 'string' && value.trim() === '')) {
          const cellLocation = `${String.fromCharCode(65 + colIndex)}${rowIndex + 2}`;
          missingCells.push({
            row: rowIndex + 2,
            column: header,
            cell: cellLocation
          });
          columnSummary[header].count++;
          columnSummary[header].cells.push(cellLocation);
        }
      });
    });
    
    return {
      totalMissing: missingCells.length,
      byColumn: columnSummary,
      allLocations: missingCells,
      summary: missingCells.length > 0 
        ? `Found ${missingCells.length} missing values across ${Object.keys(columnSummary).filter(col => columnSummary[col].count > 0).length} columns`
        : 'No missing values found'
    };
  };

  // Helper function to find data type issues
  const findDataTypeIssues = () => {
    const headers = Object.keys(data[0]);
    const issues: any[] = [];
    
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
      const types = new Set(values.map(val => typeof val));
      
      if (types.size > 1) {
        const mixedTypes: any[] = [];
        data.forEach((row, index) => {
          const value = row[header];
          if (value !== null && value !== undefined && value !== '') {
            mixedTypes.push({
              row: index + 2,
              value,
              type: typeof value
            });
          }
        });
        
        issues.push({
          column: header,
          issue: 'Mixed data types',
          types: Array.from(types),
          examples: mixedTypes.slice(0, 5) // Show first 5 examples
        });
      }
    });
    
    return issues;
  };

  // Helper function to get data types summary
  const getDataTypesSummary = () => {
    const headers = Object.keys(data[0]);
    const summary: any = {};
    
    headers.forEach(header => {
      const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
      const types = values.map(val => typeof val);
      const typeCounts = types.reduce((acc: any, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      
      summary[header] = {
        dominantType: Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b),
        typeCounts
      };
    });
    
    return summary;
  };

  // Helper function to calculate overall quality score
  const calculateOverallQuality = () => {
    const totalRows = data.length;
    const totalColumns = Object.keys(data[0]).length;
    const totalCells = totalRows * totalColumns;
    
    // Get issues
    const duplicateRows = findDuplicateRows().count;
    const missingCells = findMissingValues().totalMissing;
    const typeIssues = findDataTypeIssues().length;
    
    // Calculate deductions based on severity and impact
    let qualityScore = 100;
    
    // Duplicate rows penalty (more severe - affects entire rows)
    if (duplicateRows > 0) {
      const duplicateRowPercentage = (duplicateRows / totalRows) * 100;
      const duplicatePenalty = Math.min(40, duplicateRowPercentage * 2); // Cap at 40 points
      qualityScore -= duplicatePenalty;
      console.log(`🔍 Duplicate penalty: ${duplicatePenalty.toFixed(1)} points (${duplicateRows} rows = ${duplicateRowPercentage.toFixed(1)}%)`);
    }
    
    // Missing values penalty (moderate severity)
    if (missingCells > 0) {
      const missingCellPercentage = (missingCells / totalCells) * 100;
      const missingPenalty = Math.min(30, missingCellPercentage * 10 + 5); // Base 5 points + scaled penalty, cap at 30
      qualityScore -= missingPenalty;
      console.log(`⚠️ Missing values penalty: ${missingPenalty.toFixed(1)} points (${missingCells} cells = ${missingCellPercentage.toFixed(2)}%)`);
    }
    
    // Data type inconsistency penalty (high severity - affects data integrity)
    if (typeIssues > 0) {
      const typeInconsistencyPercentage = (typeIssues / totalColumns) * 100;
      const typePenalty = Math.min(25, typeIssues * 5); // 5 points per inconsistent column, cap at 25
      qualityScore -= typePenalty;
      console.log(`🔧 Type inconsistency penalty: ${typePenalty.toFixed(1)} points (${typeIssues} columns = ${typeInconsistencyPercentage.toFixed(1)}%)`);
    }
    
    // Ensure score doesn't go below 0
    qualityScore = Math.max(0, qualityScore);
    
    console.log(`📊 Final quality score: ${qualityScore.toFixed(1)}%`);
    
    return {
      score: Math.round(qualityScore),
      grade: qualityScore >= 90 ? 'Excellent' : 
             qualityScore >= 75 ? 'Good' : 
             qualityScore >= 60 ? 'Fair' : 'Poor',
      breakdown: {
        duplicatesImpact: duplicateRows > 0 ? Math.min(40, (duplicateRows / totalRows) * 100 * 2) : 0,
        missingValuesImpact: missingCells > 0 ? Math.min(30, (missingCells / totalCells) * 100 * 10 + 5) : 0,
        typeIssuesImpact: typeIssues > 0 ? Math.min(25, typeIssues * 5) : 0
      }
    };
  };

  // Function to prepare Luckysheet data
  const prepareLuckysheetData = (dataArray: any[], selectedColumns?: string[]) => {
      const sheetData: any = {
            name: "Sheet1",
            color: "",
            index: 0,
            status: 1,
            order: 0,
            hide: 0,
            row: 50,
            column: 26,
            celldata: []
      };

    if (dataArray && dataArray.length > 0) {
      // Use selected columns if provided, otherwise get all columns
      const headers = selectedColumns || getOriginalColumnOrder(dataArray);
      console.log('📋 prepareLuckysheetData using column order:', headers);
      const celldata: any[] = [];

      // Add headers - only for selected columns
      headers.forEach((header, colIndex) => {
        celldata.push({
          r: 0,
          c: colIndex,
          v: {
            v: header,
            ct: { fa: "General", t: "g" },
            m: header,
            bg: "#f0f0f0",
            bl: 1
          }
        });
      });

      // Add data rows - only for selected columns
      dataArray.forEach((row, rowIndex) => {
        headers.forEach((header, colIndex) => {
          const value = row[header];
          // Handle NaN values by converting them to null
          const processedValue = value === null || (typeof value === 'number' && isNaN(value)) ? null : value;
          if (processedValue !== undefined && processedValue !== null) {
            celldata.push({
              r: rowIndex + 1,
              c: colIndex,
              v: {
                v: processedValue,
                ct: { fa: "General", t: "g" },
                m: String(processedValue)
              }
            });
          }
        });
      });

      sheetData.celldata = celldata;
      sheetData.row = Math.max(50, dataArray.length + 10);
      sheetData.column = Math.max(26, headers.length + 5);
    }

    return sheetData;
  };

  // Unified pushToDataHistory: only push if new state is different from last
  const pushToDataHistory = useCallback((newData: any[], operation = 'Data Update') => {
    console.log('[HISTORY] Before push - currentIndex:', historyState.currentHistoryIndex, 'length:', historyState.dataHistory.length);
    
    setHistoryState(prev => {
      // Get the current entry to compare
      const currentEntry = prev.dataHistory[prev.currentHistoryIndex];
      
      // If the new state is the same as current, don't push
      if (currentEntry && JSON.stringify(currentEntry.data) === JSON.stringify(newData)) {
        console.log('[HISTORY] Skipping duplicate state');
        return prev;
      }

      // Create new entry
      const newEntry = {
        data: JSON.parse(JSON.stringify(newData)),
        timestamp: Date.now(),
        operation
      };

      // If we're not at the end of history, truncate it
      const newHistory = prev.dataHistory.slice(0, prev.currentHistoryIndex + 1);
      newHistory.push(newEntry);

      const newIndex = newHistory.length - 1;
      console.log('[HISTORY] After push - newIndex:', newIndex, 'newLength:', newHistory.length);

      return {
        dataHistory: newHistory,
        currentHistoryIndex: newIndex
      };
    });

    // Update undo/redo state based on new history state
    setCanUndo(true);
    setCanRedo(false); // Reset redo state when new history is pushed
    setLastOperation(operation);
  }, [historyState]);

  // Modify the existing refreshLuckysheetData function to push to history
  const refreshLuckysheetData = (newData: any[], operation: string = 'Data Update') => {
    if (!window.luckysheet || !luckysheetInitialized) {
      console.log('Luckysheet not ready for refresh');
      return;
    }

    try {
      console.log(`🔄 Refreshing Luckysheet with operation: ${operation}`);
      
      // Clear cached data quality report when data changes
      setDataQualityReport(null);
      setDataQualityReportHash('');
      setLastReportTimestamp(0);
      console.log('🗑️ Cleared cached data quality report due to data change');
      
      // Push the new data to history before refreshing
      pushToDataHistory(newData, operation);
      
      // Use the non-history version to actually refresh the UI
      refreshLuckysheetDataWithoutHistory(newData);
      
      // Log the current history state
      console.log(`📚 History state after refresh: index=${historyState.currentHistoryIndex + 1}, total=${historyState.dataHistory.length + 1}`);
      
    } catch (error) {
      console.error('❌ Error in refreshLuckysheetData:', error);
    }
  };

  // Set original column order when data is first loaded
  useEffect(() => {
    if (data && data.length > 0 && originalColumnOrder.length === 0) {
      const columnOrder = Object.keys(data[0]);
      setOriginalColumnOrder(columnOrder);
      console.log('📋 Set original column order:', columnOrder);
    }
  }, [data, originalColumnOrder]);

  // Watch for data changes from props and initialize history if needed
  useEffect(() => {
    if (data && data.length > 0 && historyState.dataHistory.length === 0) {
      setHistoryState({
        dataHistory: [
          {
            data: JSON.parse(JSON.stringify(data)),
            timestamp: Date.now(),
            operation: 'Initial Data'
          }
        ],
        currentHistoryIndex: 0
      });
    }
  }, []); // Only run on mount
  
  // Add a function to refresh Luckysheet without affecting history
  const refreshLuckysheetDataWithoutHistory = (newData: any[]) => {
    if (!window.luckysheet || !luckysheetInitialized) {
      console.log('Luckysheet not ready for refresh');
      return;
    }

    try {
      console.log('🔄 Refreshing Luckysheet data without affecting history...');
      
      if (!containerRef.current) {
        console.warn('Container reference not available');
        return;
      }
      
      // Step 1: Destroy current instance
      try {
        window.luckysheet.destroy();
      } catch (e) {
        console.warn('⚠️ Error destroying old instance:', e);
      }
      
      // Step 2: Clear container
      containerRef.current.innerHTML = '';
      
      // Step 3: Force re-initialization
      initializationAttempted.current = false;
      
      // Step 4: Create new container ID
      const containerId = `luckysheet-${Date.now()}`;
      containerRef.current.id = containerId;
      
      // Step 5: Prepare data for Luckysheet
      const sheetData = prepareLuckysheetData(newData);
      
      // Step 6: Create new instance
      window.luckysheet.create({
        container: containerId,
        title: currentWorkspace?.name || 'EDI Spreadsheet',
        lang: 'en',
        data: [sheetData],
        showtoolbar: true,
        showinfobar: true,
        showsheetbar: true,
        showstatisticBar: true,
        enableAddRow: true,
        enableAddCol: true,
        allowEdit: true,
        allowCopy: true,
        allowPaste: true,
        hook: {
          workbookCreateAfter: function() {
            console.log('✅ Luckysheet refresh completed without affecting history');
            setLuckysheetInitialized(true);
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error refreshing Luckysheet:', error);
    }
  };

  // Modify the undoDataOperation to properly track indices
  const undoDataOperation = useCallback(() => {
    console.log('[UNDO] Starting undo operation...');
    console.log('[UNDO] Current state:', { 
      currentIndex: historyState.currentHistoryIndex,
      historyLength: historyState.dataHistory.length,
      canUndo: historyState.currentHistoryIndex > 0
    });

    if (historyState.currentHistoryIndex <= 0) {
      console.log('[UNDO] No previous state available');
      return false;
    }

    const newIndex = historyState.currentHistoryIndex - 1;
    const prevEntry = historyState.dataHistory[newIndex];

    if (!prevEntry) {
      console.log('[UNDO] No entry found at index:', newIndex);
      return false;
    }

    console.log('[UNDO] Applying state at index:', newIndex);

    // Update the data first
    if (onDataUpdate) onDataUpdate(prevEntry.data);
    if (window.luckysheet && luckysheetInitialized) {
      refreshLuckysheetDataWithoutHistory(prevEntry.data);
    }

    // Update history state
    setHistoryState(prev => ({
      ...prev,
      currentHistoryIndex: newIndex
    }));

    // Update undo/redo availability
    setCanUndo(newIndex > 0);
    setCanRedo(true);
    setLastOperation(`Undo: ${prevEntry.operation}`);

    console.log('[UNDO] Operation complete. New state:', {
      newIndex,
      canUndo: newIndex > 0,
      canRedo: true
    });

    return true;
  }, [historyState, onDataUpdate, luckysheetInitialized, refreshLuckysheetDataWithoutHistory]);

  // Modify the redoDataOperation to properly track indices
  const redoDataOperation = useCallback(() => {
    console.log('[REDO] Starting redo operation...');
    console.log('[REDO] Current state:', {
      currentIndex: historyState.currentHistoryIndex,
      historyLength: historyState.dataHistory.length,
      canRedo: historyState.currentHistoryIndex < historyState.dataHistory.length - 1
    });

    if (historyState.currentHistoryIndex >= historyState.dataHistory.length - 1) {
      console.log('[REDO] No next state available');
      return false;
    }

    const newIndex = historyState.currentHistoryIndex + 1;
    const nextEntry = historyState.dataHistory[newIndex];

    if (!nextEntry) {
      console.log('[REDO] No entry found at index:', newIndex);
      return false;
    }

    console.log('[REDO] Applying state at index:', newIndex);

    // Update the data first
    if (onDataUpdate) onDataUpdate(nextEntry.data);
    if (window.luckysheet && luckysheetInitialized) {
      refreshLuckysheetDataWithoutHistory(nextEntry.data);
    }

    // Update history state
    setHistoryState(prev => ({
      ...prev,
      currentHistoryIndex: newIndex
    }));

    // Update undo/redo availability
    setCanUndo(true);
    setCanRedo(newIndex < historyState.dataHistory.length - 1);
    setLastOperation(`Redo: ${nextEntry.operation}`);

    console.log('[REDO] Operation complete. New state:', {
      newIndex,
      canUndo: true,
      canRedo: newIndex < historyState.dataHistory.length - 1
    });

    return true;
  }, [historyState, onDataUpdate, luckysheetInitialized, refreshLuckysheetDataWithoutHistory]);

  // Modify the keyboard event handler to use ONLY custom undo/redo for global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!luckysheetInitialized) return;
      // Ctrl+Z for Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const customUndone = undoDataOperation();
        if (customUndone) {
          setCommandResult('✅ Undo successful');
        } else {
          setCommandResult('❌ Nothing to undo');
        }
        setTimeout(() => setCommandResult(null), 2000);
      }
      // Ctrl+Shift+Z for Redo
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        const customRedone = redoDataOperation();
        if (customRedone) {
          setCommandResult('✅ Redo successful');
        } else {
          setCommandResult('❌ Nothing to redo');
        }
        setTimeout(() => setCommandResult(null), 2000);
      }

      // Handle formula shortcut
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        setShowFormulaDialog(true);
        setFormulaInput(''); // Clear any previous formula input
        return;
      }

      // Handle filter shortcut (Ctrl+Shift+L)
      if (e.key === 'L' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (!window.luckysheet) {
          console.warn('Luckysheet not available');
          return;
        }

        try {
          // Get all sheets and find the active one
          const allSheets = window.luckysheet.getLuckysheetfile();
          const activeSheet = allSheets.find((s: any) => s.status === 1);

          if (!activeSheet) {
            console.warn('Could not find active sheet');
            return;
          }

          if (isFilterActive) {
            console.log('Filter is active, removing it...');
            window.luckysheet.setRangeFilter('close');
            setIsFilterActive(false);
            console.log('Filter removed successfully');
          } else {
            console.log('No active filter, applying new filter...');
            const sheet = window.luckysheet.getSheetData();
            if (!sheet || sheet.length === 0) {
              console.warn('No data in the current sheet');
              return;
            }
            const range = `A1:${String.fromCharCode(65 + sheet[0].length - 1)}${sheet.length}`;
            window.luckysheet.setRangeFilter('open', { range });
            setIsFilterActive(true);
            console.log('Filter applied successfully');
          }
        } catch (error) {
          console.error('Error toggling filter:', error);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [luckysheetInitialized, undoDataOperation, redoDataOperation, isFilterActive]);

  // Initialize command processor when data changes
  useEffect(() => {
    console.log('🔄 NativeSpreadsheet: Data changed, initializing command processor');
    console.log('📊 Raw data:', data);
    console.log('📊 Data length:', data?.length);
    console.log('📊 First row:', data?.[0]);
    
    if (data && data.length > 0) {
      const headers = Object.keys(data[0]);
      console.log('🏷️ Extracted headers:', headers);
      
      const dataRows = data.map(row => headers.map(header => row[header]));
      console.log('📋 Converted data rows (first 3):', dataRows.slice(0, 3));
      
      commandProcessorRef.current = new SpreadsheetCommandProcessor(dataRows, headers);
      
      console.log('✅ Command processor initialized with columns:', 
        commandProcessorRef.current.getColumnMapping());
    } else {
      console.log('⚠️ No data available for command processor initialization');
      commandProcessorRef.current = null;
    }
  }, [data]);

  // Voice recognition setup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceCommand(transcript);
        setIsListening(false);
        handleVoiceCommand(transcript);
      };
      
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };
      
      setRecognition(recognitionInstance);
    }
  }, []);

  // Initialize Luckysheet
  useEffect(() => {
    if (!isLuckysheetReady || luckysheetInitialized || !containerRef.current || initializationAttempted.current) {
      return;
    }

    console.log('Initializing Luckysheet...');
    initializationAttempted.current = true;
    
    try {
      // Create unique container ID to avoid conflicts
      const containerId = `luckysheet-${Date.now()}`;
      containerRef.current.id = containerId;

      // Prepare data for Luckysheet
      const sheetData = prepareLuckysheetData(data);

      const options = {
        container: containerId,
        title: currentWorkspace?.name || 'EDI Spreadsheet',
        lang: 'en',
        data: sheets.length > 0 ? sheets : [prepareLuckysheetData(data)],
        showtoolbar: true,
        showinfobar: true,
        showsheetbar: true,
        showstatisticBar: true,
        enableAddRow: true,
        enableAddCol: true,
        userInfo: false,
        myFolderUrl: '',
        devicePixelRatio: window.devicePixelRatio || 1,
        functionButton: '',
        showConfigWindowResize: true,
        hook: {
          workbookCreateAfter: function() {
            console.log('✅ Luckysheet initialized successfully');
            setLuckysheetInitialized(true);
            // Hook into Luckysheet's undo/redo events
            if (window.luckysheet) {
              // Override Luckysheet's undo/redo functions
              const originalUndo = window.luckysheet.undo;
              const originalRedo = window.luckysheet.redo;
              window.luckysheet.undo = function() {
                const currentData = window.luckysheet.getSheetData();
                originalUndo.call(window.luckysheet);
                const newData = window.luckysheet.getSheetData();
                if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
                  pushToDataHistory(newData, 'Luckysheet Operation');
                }
              };
              window.luckysheet.redo = function() {
                const currentData = window.luckysheet.getSheetData();
                originalRedo.call(window.luckysheet);
                const newData = window.luckysheet.getSheetData();
                if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
                  pushToDataHistory(newData, 'Luckysheet Operation');
                }
              };
            }
          },
          sheetSwitch: function(sheetIndex: number) {
            setActiveSheetIndex(sheetIndex);
          },
          // Enhanced cell editing hooks for manual formula entry
          cellEditBefore: function(range: any) {
            console.log('Cell edit started:', range);
          },
          onCellEdit: function(r: number, c: number, value: any) {
            console.log('Cell being edited:', { r, c, value });
            const currentData = window.luckysheet.getSheetData();
            pushToDataHistory(currentData, 'Cell Edit');
          },
          // This hook fires when cell editing is completed (manual entry)
          cellEditEnd: function(r: number, c: number, oldValue: any, newValue: any) {
            console.log('Cell edit completed:', { r, c, oldValue, newValue });
            
            // Track the changes
            setTimeout(() => {
              trackDataChange('Cell Edit');
              
              const cellData = window.luckysheet.getCellValue(r, c);
              const formula = window.luckysheet.getCellValue(r, c, 'f');
              
              console.log('Checking cell after edit:', { cellData, formula });
              
              // Check for formula errors after manual entry
              if (cellData && typeof cellData === 'string' && cellData.startsWith('#') && formula) {
                console.log('Formula error detected after manual entry');
                handleFormulaError({
                  r,
                  c,
                  v: cellData,
                  f: formula
                });
              }
            }, 100); // Small delay to ensure cell update is complete
          },
          cellUpdated: (r: number, c: number, oldValue: any, newValue: any, isRefresh: boolean) => {
            console.log('Cell Updated:', { r, c, oldValue, newValue, isRefresh });
            
            // Track changes (but not during refresh operations)
            if (!isRefresh) {
              setTimeout(() => {
                trackDataChange('Cell Update');
              }, 50);
            }
            
            // Enhanced error detection for manual input
            setTimeout(() => {
              const cellData = window.luckysheet.getCellValue(r, c);
              const formula = window.luckysheet.getCellValue(r, c, 'f');
              
              if (typeof cellData === 'string' && cellData.startsWith('#') && formula) {
                console.log('Detected Error via cellUpdated:', { cellData, formula });
                handleFormulaError({
                  r,
                  c,
                  v: cellData,
                  f: formula
                });
              }
            }, 50);
          },
          formulaCalculate: (cell: any, r: number, c: number, formula: string) => {
            console.log('Formula Calculate:', { cell, r, c, formula });
            if (cell && typeof cell === 'string' && cell.startsWith('#')) {
              handleFormulaError({
                r,
                c,
                v: cell,
                f: formula
              });
            }
          },
          // Add range change hook to catch formula errors
          rangeSelect: function(range: any) {
            // When user selects a different cell, check the previous cell for errors
            setTimeout(() => {
              const currentSheet = window.luckysheet.getSheetData();
              if (currentSheet && range && range.length > 0) {
                const { row_focus: r, column_focus: c } = range[0];
                if (typeof r === 'number' && typeof c === 'number') {
                  const cellData = currentSheet[r] && currentSheet[r][c];
                  if (cellData && cellData.v && typeof cellData.v === 'string' && cellData.v.startsWith('#') && cellData.f) {
                    handleFormulaError({
                      r,
                      c,
                      v: cellData.v,
                      f: cellData.f
                    });
                  }
                }
              }
            }, 100);
          },
          onRangeSort: function() {
            const currentData = window.luckysheet.getSheetData();
            pushToDataHistory(currentData, 'Range Sort');
            trackDataChange('Range Sort');
          },
          onRangeFilter: function() {
            const currentData = window.luckysheet.getSheetData();
            pushToDataHistory(currentData, 'Range Filter');
            trackDataChange('Range Filter');
          }
        }
      };

      window.luckysheet.create(options);
      
      // Set initialized after a short delay to ensure Luckysheet is fully rendered
      setTimeout(() => {
        setLuckysheetInitialized(true);
        console.log('Luckysheet initialized successfully');
      }, 500);
      
    } catch (error) {
      console.error('Error initializing Luckysheet:', error);
      setLoadingError(`Failed to initialize: ${error}`);
      initializationAttempted.current = false; // Reset on error
    }
  }, [isLuckysheetReady, currentWorkspace, sheets, handleFormulaError]);

  // Watch for data changes and refresh Luckysheet
  useEffect(() => {
    if (luckysheetInitialized && data !== null) {
      if (data.length > 0) {
      console.log('🔄 Data changed, refreshing Luckysheet...', {
        dataLength: data.length,
        firstRow: data[0] ? Object.keys(data[0]) : 'no data',
        luckysheetInitialized
      });
      refreshLuckysheetData(data, 'Data Update from Props');
        
        // Update saved data reference when data loads
        lastSavedDataRef.current = JSON.stringify(data);
      } else {
        console.log('🧹 Data cleared, clearing Luckysheet...', {
          dataLength: data.length,
          luckysheetInitialized
        });
        // Clear Luckysheet when data is empty
        if (window.luckysheet && containerRef.current) {
          try {
            window.luckysheet.destroy();
            containerRef.current.innerHTML = '';
            
            // Reinitialize with empty data
            const containerId = `luckysheet-${Date.now()}`;
            containerRef.current.id = containerId;
            
            const emptySheetData = {
              name: 'Sheet1',
              index: 0,
              status: 1,
              order: 0,
              celldata: [],
              config: {},
              scrollLeft: 0,
              scrollTop: 0,
              luckysheet_select_save: [],
              calcChain: [],
              isPivotTable: false,
              pivotTable: {},
              filter_select: {},
              filter: null,
              luckysheet_alternateformat_save: [],
              luckysheet_alternateformat_save_modelCustom: [],
              luckysheet_conditionformat_save: {},
              frozen: {},
              chart: [],
              zoomRatio: 1,
              image: [],
              showGridLines: 1,
              dataVerification: {},
            };
            
            window.luckysheet.create({
              container: containerId,
              title: currentWorkspace?.name || 'EDI Spreadsheet',
              lang: 'en',
              data: [emptySheetData],
              showtoolbar: true,
              showinfobar: true,
              showsheetbar: true,
              showstatisticBar: true,
              enableAddRow: true,
              enableAddCol: true,
              allowEdit: true,
              allowCopy: true,
              allowPaste: true,
              hook: {
                workbookCreateAfter: function() {
                  console.log('✅ Luckysheet cleared and reinitialized with empty data');
                  setLuckysheetInitialized(true);
                }
              }
            });
          } catch (error) {
            console.error('❌ Error clearing Luckysheet:', error);
          }
        }
      }
    }
  }, [data, luckysheetInitialized]);

  // Listen for data update events from other components (like ChatInterface)
  useEffect(() => {
    const handleDataUpdate = (event: CustomEvent) => {
      console.log('📊 NativeSpreadsheet: Data update event received', event.detail);
      if (event.detail && event.detail.data && onDataUpdate) {
        const newData = event.detail.data;
        console.log('📊 NativeSpreadsheet: Updating parent data and forcing Luckysheet refresh', {
          newDataLength: newData.length,
          currentDataLength: data.length,
          luckysheetInitialized
        });
        
        // Call the onDataUpdate callback with the new data
        onDataUpdate(newData);
        
        // Also force immediate refresh if Luckysheet is ready
        if (luckysheetInitialized && newData.length > 0) {
          console.log('🔄 NativeSpreadsheet: Force refreshing Luckysheet with updated data');
          setTimeout(() => {
            refreshLuckysheetData(newData, 'Data Update from Event');
          }, 100); // Small delay to ensure state update propagates
        }
      }
    };
    
    // Add event listener with type assertion for CustomEvent
    window.addEventListener('dataUpdate', handleDataUpdate as EventListener);
    
    return () => {
      // Clean up event listener
      window.removeEventListener('dataUpdate', handleDataUpdate as EventListener);
    };
  }, [onDataUpdate, data.length, luckysheetInitialized]);

  const handleVoiceCommand = async (command: string) => {
    if (!command.trim()) return;
    
    setIsProcessingCommand(true);
    setCommandResult(null);
    
    const startTime = Date.now();
    let routingDecision: 'local' | 'backend' | 'fallback' = 'fallback';
    
    try {
      console.log(`🎯 Processing command: "${command}"`);
      
      // Check for undo/redo commands first
      const lowerCommand = command.toLowerCase();
      
      if (lowerCommand === 'undo' || lowerCommand === 'undo last action' || lowerCommand === 'ctrl z') {
        console.log(`🔙 Voice undo command detected, current history index: ${historyState.currentHistoryIndex}`);
        
        if (undoDataOperation()) {
          setCommandResult('✅ Undo successful');
        } else {
          setCommandResult('❌ Nothing to undo');
        }
        
        setTimeout(() => setCommandResult(null), 3000);
        setIsProcessingCommand(false);
        return;
      }
      
      if (lowerCommand === 'redo' || lowerCommand === 'redo last action' || lowerCommand === 'ctrl shift z') {
        console.log(`🔜 Voice redo command detected, current history index: ${historyState.currentHistoryIndex}`);
        
        if (redoDataOperation()) {
          setCommandResult('✅ Redo successful');
        } else {
          setCommandResult('❌ Nothing to redo');
        }
        
        setTimeout(() => setCommandResult(null), 3000);
        setIsProcessingCommand(false);
        return;
      }
      
      // Special handling for data-changing operations like duplicate removal
      const duplicateRemovalPatterns = [
        'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
        'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
        'unique rows', 'remove duplicates', 'drop duplicates',
        'delete the duplicates', 'remove the duplicates', 'delete duplicates', 'remove duplicates'
      ];
      if (duplicateRemovalPatterns.some(pattern => lowerCommand.includes(pattern))) {
        await handleDuplicateRemoval(command);
        return;
      }
      
      // Step 1: Try local command processing first (fast path - ~10ms)
      if (commandProcessorRef.current) {
        const localCommand = await commandProcessorRef.current.processCommand(command);
        
        if (localCommand) {
          console.log('⚡ Processing locally:', localCommand);
          routingDecision = 'local';
          
          // Execute the command on Luckysheet
          const success = commandProcessorRef.current.executeCommand(localCommand);
          
          if (success) {
            const executionTime = Date.now() - startTime;
            console.log(`✅ Local execution completed in ${executionTime}ms`);
            
            // Update stats
            setCommandStats({
              lastCommand: command,
              processingTime: executionTime,
              routingDecision: 'local'
            });
            
            setCommandResult(localCommand.success_message || '✅ Command executed');
            setTimeout(() => setCommandResult(null), 3000);
            return;
          } else {
            console.warn('⚠️ Local command execution failed, falling back to backend');
          }
        }
      }

      // Step 2: Check if command requires backend processing
      const needsBackend = requiresBackendProcessing(command);
      console.log(`🤔 Needs backend processing: ${needsBackend}`);

      // Step 2.5: Try LLM-based spreadsheet command processing for formatting commands
      if (/\b(format|bold|italic|underline|strikethrough|color|highlight|cell|make|set)\b/i.test(command)) {
        console.log('🧠 Using LLM for spreadsheet command processing...');
        routingDecision = 'backend';
        
        const response = await commandService.processSpreadsheetCommand(command);
        const totalTime = Date.now() - startTime;
        
        // Update stats
        setCommandStats({
          lastCommand: command,
          processingTime: totalTime,
          routingDecision: 'backend'
        });
        
        if (response.success && response.action?.type === 'luckysheet_api') {
          // Execute Luckysheet API commands returned from LLM
          if (window.luckysheet && response.action.payload) {
            try {
              // Execute the API command
              const { method, params } = response.action.payload;
              if (window.luckysheet[method]) {
                window.luckysheet[method](...params);
                setCommandResult(`✅ ${response.message}`);
                setTimeout(() => setCommandResult(null), 3000);
                return;
              }
            } catch (apiError) {
              console.error('Error executing Luckysheet API:', apiError);
            }
          }
        }
        
        // If we got a response but no action, still show the message
        if (response.success) {
          setCommandResult(response.message);
          setTimeout(() => setCommandResult(null), 3000);
          return;
        }
      }

      if (needsBackend && data && data.length > 0) {
        console.log('🌐 Sending to backend for complex processing...');
        routingDecision = 'backend';
        
        // Convert data to format expected by backend
        const headers = Object.keys(data[0]);
        const dataRows = data.map(row => headers.map(header => row[header]));
        
        // Determine the type of backend processing needed
        let response;
        if (/\b(chart|graph|plot|visualiz)\b/i.test(command)) {
          response = await commandService.createVisualization(command, dataRows);
        } else if (/\b(analyze|analysis|insights?|trends?)\b/i.test(command)) {
          response = await commandService.analyzeData(command, dataRows);
        } else if (/\b(filter|search|find|transform)\b/i.test(command)) {
          response = await commandService.transformData(command, dataRows);
        } else {
          response = await commandService.processComplexCommand({
            command,
            context: {
              currentData: dataRows,
              sheetInfo: {
                rows: dataRows.length,
                columns: headers.length,
                headers
              }
            }
          });
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`🌐 Backend processing completed in ${totalTime}ms`);
        
        // Update stats
        setCommandStats({
          lastCommand: command,
          processingTime: totalTime,
          routingDecision: 'backend'
        });
        
        if (response.success) {
          // Handle different types of backend responses
          if (response.action) {
            switch (response.action.type) {
              case 'luckysheet_api':
                // Execute Luckysheet API commands returned from backend
                if (window.luckysheet && response.action.payload) {
                  try {
                    // Execute the API command
                    const { method, params } = response.action.payload;
                    if (window.luckysheet[method]) {
                      window.luckysheet[method](...params);
                    }
                  } catch (apiError) {
                    console.error('Error executing Luckysheet API:', apiError);
                  }
                }
                break;
                
              case 'visualization':
                // Handle visualization results (charts, graphs)
                setCommandResult(`📊 ${response.message}`);
                break;
                
              case 'analysis':
                // Handle analysis results
                setCommandResult(`📈 ${response.message}`);
                break;
                
              case 'data_update':
                // Handle data transformation results
                if (response.action.payload && response.action.payload.newData) {
                  // Update the spreadsheet with new data
                  // This would require updating the parent component's data
                  console.log('Data update received:', response.action.payload.newData);
                }
                setCommandResult(`🔄 ${response.message}`);
                break;
                
              default:
                setCommandResult(response.message);
            }
          } else {
            setCommandResult(response.message);
          }
        } else {
          setCommandResult(`❌ ${response.message}`);
        }
        
        setTimeout(() => setCommandResult(null), 5000); // Longer timeout for complex operations
        return;
      }

      // Step 3: Fall back to existing hardcoded commands for compatibility
      routingDecision = 'fallback';
      
      if (lowerCommand.includes('save') && window.luckysheet) {
        const sheetData = window.luckysheet.getAllSheets();
        console.log('Spreadsheet data:', sheetData);
        setCommandResult('✅ Data saved to console');
        setTimeout(() => setCommandResult(null), 3000);
        return;
      }
      
      if (lowerCommand.includes('export') && window.luckysheet) {
        setCommandResult('✅ Export functionality available');
        setTimeout(() => setCommandResult(null), 3000);
        return;
      }

      // Step 4: Enhanced EDI-specific commands with better pattern matching
      if ((lowerCommand.includes('auto fit') || lowerCommand.includes('autofit')) && window.luckysheet) {
        console.log('📏 Executing auto-fit command directly');
        setCommandResult('🔄 Auto-fitting columns...');
        
        const autoFitCommand: SpreadsheetCommand = {
          action: 'autoFitColumns',
          params: {},
          success_message: '✅ Columns auto-fitted'
        };
        
        if (commandProcessorRef.current?.executeCommand(autoFitCommand)) {
          // Use utility to track operation
          applyAndTrackOperation('Auto Fit Columns', () => {}); // No-op, already executed
          setCommandResult(autoFitCommand.success_message!);
          setTimeout(() => setCommandResult(null), 3000);
          return;
        } else {
          setCommandResult('❌ Failed to auto-fit columns');
          setTimeout(() => setCommandResult(null), 3000);
          return;
        }
      }
      
      // Handle column width adjustment commands directly
      const columnWidthMatch = /(?:make|set|adjust)\s+column\s+([A-Za-z])\s+(wider|narrower|wide|narrow)/i.exec(lowerCommand);
      if (columnWidthMatch && window.luckysheet) {
        const columnLetter = columnWidthMatch[1].toUpperCase();
        const widthAction = columnWidthMatch[2].toLowerCase();
        
        // Convert column letter to index (0-based)
        const columnIndex = columnLetter.charCodeAt(0) - 65;  // A=0, B=1, etc.
        
        // Determine width based on action
        const width = widthAction.includes('wide') ? 200 : 100;
        
        console.log(`📏 Adjusting column ${columnLetter} (index ${columnIndex}) to width ${width}px`);
        setCommandResult(`🔄 Adjusting column ${columnLetter}...`);
        
        try {
          applyAndTrackOperation(`Set Column ${columnLetter} Width`, () => {
            window.luckysheet.setColumnWidth({ [columnIndex]: width });
          });
          setCommandResult(`✅ Column ${columnLetter} adjusted successfully`);
          setTimeout(() => setCommandResult(null), 3000);
          return;
        } catch (error) {
          console.error('Error setting column width:', error);
          setCommandResult(`❌ Failed to adjust column ${columnLetter}`);
          setTimeout(() => setCommandResult(null), 3000);
          return;
        }
      }

      // Step 5: Final fallback - use original onCommand prop if available
      if (onCommand) {
        console.log('📤 Using original onCommand prop for:', command);
        const result = await onCommand(command);
        setCommandResult(result.message || 'Command executed successfully');
        setTimeout(() => setCommandResult(null), 3000);
      } else {
        // No processing method available
        setCommandResult(`❓ Command not recognized: "${command}"`);
        setTimeout(() => setCommandResult(null), 3000);
      }
      
    } catch (error) {
      console.error('Error processing command:', error);
      setCommandResult('❌ Error processing command');
      setTimeout(() => setCommandResult(null), 3000);
    } finally {
      setIsProcessingCommand(false);
    }
  };
  
  // Helper function to get original column order
  const getOriginalColumnOrder = useCallback((dataArray: any[]): string[] => {
    // Use tracked column order if available
    if (originalColumnOrder.length > 0) {
      return originalColumnOrder;
    }
    
    // Fallback to Object.keys if no tracked order exists
    if (dataArray && dataArray.length > 0) {
      return Object.keys(dataArray[0]);
    }
    
    return [];
  }, [originalColumnOrder]);
  
  // Extract duplicate removal logic to a separate function
  const handleDuplicateRemoval = async (command: string) => {
    console.log('🧹 Detected duplicate removal command, sending directly to backend');
    
    // Show processing message
    setCommandResult('🔄 Processing duplicate removal...');
    
    if (data && data.length > 0) {
      console.log('📊 Data available for duplicate removal');
      
      // Preserve original column order
      const originalHeaders = getOriginalColumnOrder(data);
      console.log('📋 Original column order:', originalHeaders);
      
      const dataRows = data.map(row => originalHeaders.map(header => row[header]));
      
      try {
        // Capture the pre-operation state immediately
        const preOpData = JSON.parse(JSON.stringify(data));
        
        // Save current data state for comparison
        const originalData = JSON.parse(JSON.stringify(data));
        const originalRowCount = originalData.length;
        console.log(`📊 Original data has ${originalRowCount} rows`);
        
        // Send directly to backend for processing
        const response = await commandService.processComplexCommand({
          command,
          context: {
            currentData: dataRows,
            sheetInfo: {
              rows: dataRows.length,
              columns: originalHeaders.length,
              headers: originalHeaders
            }
          }
        });
        
        console.log('🧹 Duplicate removal response:', response);
        
        // Check if data was updated
        if (response.data_updated && response.updated_data && onDataUpdate) {
          let newData = response.updated_data.data;
          
          // Ensure column order is preserved
          if (newData && newData.length > 0) {
            newData = newData.map((row: any) => {
              const orderedRow: any = {};
              originalHeaders.forEach(header => {
                orderedRow[header] = row[header];
              });
              return orderedRow;
            });
          }
          
          const newRowCount = newData.length;
          
          console.log(`📊 New data has ${newRowCount} rows`);
          
          // Only update if data actually changed
          if (originalRowCount !== newRowCount) {
            console.log(`📊 Data rows changed: ${originalRowCount} -> ${newRowCount}`);
            
            // Push the pre-operation state to history
            pushToDataHistory(preOpData, 'Before Remove Duplicates');
            
            // Update the data in the parent component
            onDataUpdate(newData);
            
            // Show success message
            const rowsRemoved = originalRowCount - newRowCount;
            setCommandResult(`✅ Successfully removed ${rowsRemoved} duplicate rows. The dataset now contains ${newRowCount} rows.`);
            
            // Refresh Luckysheet with the new data WITHOUT creating a new history entry
            refreshLuckysheetDataWithoutHistory(newData);
            
            // Update the saved data reference to prevent duplicate saves
            lastSavedDataRef.current = JSON.stringify(newData);
            
            // Ensure undo is available
            console.log(`📚 History state after duplicate removal: index=${historyState.currentHistoryIndex}, entries=${historyState.dataHistory.length}`);
          } else {
            console.log('📊 No data rows were changed');
            setCommandResult('✅ No duplicate rows found to remove');
          }
        } else {
          setCommandResult(response.message || '✅ Processed duplicate removal command');
        }
      } catch (error) {
        console.error('Error during duplicate removal:', error);
        setCommandResult('❌ Error removing duplicates');
      }
      
      setTimeout(() => setCommandResult(null), 5000);
    } else {
      setCommandResult('❌ No data available for duplicate removal');
      setTimeout(() => setCommandResult(null), 3000);
    }
    
    setIsProcessingCommand(false);
  };

  const startVoiceRecognition = () => {
    if (recognition && !isListening) {
      setIsListening(true);
      recognition.start();
    }
  };

  const stopVoiceRecognition = () => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const handleTextCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceCommand.trim()) return;
    setIsProcessingCommand(true);
    setCommandResult('🔄 Processing command...');
    try {
      await handleVoiceCommand(voiceCommand);
    } catch (err) {
      setCommandResult('❌ Error processing command');
      setTimeout(() => setCommandResult(null), 3000);
    } finally {
      setIsProcessingCommand(false);
      setVoiceCommand('');
      // If no result was set (i.e., command not recognized), show a message
      setTimeout(() => {
        if (!commandResult) {
          setCommandResult(`❓ Command not recognized: "${voiceCommand}"`);
          setTimeout(() => setCommandResult(null), 3000);
        }
      }, 100);
    }
  };

  // Handle column extraction
  const handleColumnExtraction = async (selectedColumns: string[], sheetName?: string) => {
    try {
      console.log('🔧 === EXTRACTING COLUMNS ===');
      console.log('📋 Selected columns:', selectedColumns);
      console.log('🏷️ Sheet name:', sheetName);
      
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
      
      if (result.success) {
        // Convert sheet data to regular array format and use existing data flow
        if (result.sheet_data && result.sheet_data.celldata) {
          try {
            console.log('📊 Converting extracted data to array format');
            
            const sheetName = result.sheet_name || `Extracted_${selectedColumns.length}cols`;
            const celldata = result.sheet_data.celldata;
            
            // Convert Luckysheet celldata format to 2D array first
            const tempArray: any[][] = [];
            const maxRow = Math.max(...celldata.map((cell: any) => cell.r)) + 1;
            const maxCol = Math.max(...celldata.map((cell: any) => cell.c)) + 1;
            
            // Initialize 2D array with empty values
            for (let r = 0; r < maxRow; r++) {
              tempArray[r] = new Array(maxCol).fill('');
            }
            
            // Fill in the data from celldata
            celldata.forEach((cell: any) => {
              if (cell.v && cell.v.v !== undefined) {
                tempArray[cell.r][cell.c] = cell.v.v;
              }
            });
            
            // Convert to object array format that prepareLuckysheetData expects
            const headers = tempArray[0]; // First row contains headers
            const dataRows = tempArray.slice(1); // Rest are data rows
            
            const extractedArray = dataRows.map(row => {
              const rowObject: any = {};
              headers.forEach((header, colIndex) => {
                if (header) { // Only include non-empty headers
                  rowObject[header] = row[colIndex] || '';
                }
              });
              return rowObject;
            });
            
            console.log('📋 Converted to object array format:', {
              headers: headers,
              rows: extractedArray.length,
              columns: headers.length,
              sampleData: extractedArray.slice(0, 3)
            });
            
            // Create new sheet data using the proper format and pass selected columns
            const newSheetData = prepareLuckysheetData(extractedArray, selectedColumns);
            newSheetData.name = sheetName;
            newSheetData.index = Date.now().toString(); // Unique index
            
            console.log('📋 Creating new sheet with data:', {
              name: sheetName,
              rows: extractedArray.length,
              columns: headers.length,
              celldata_length: newSheetData.celldata?.length || 0
            });
            
            // Use Luckysheet's proper setSheetAdd API
            if (window.luckysheet && typeof window.luckysheet.setSheetAdd === 'function') {
              console.log('🔧 Using setSheetAdd API to create new sheet');
              
              try {
                // Add the new sheet using Luckysheet's API
                const addedSheet = window.luckysheet.setSheetAdd({
                  sheetObject: newSheetData,
                  order: sheets.length, // Add at the end
                  success: () => {
                    console.log('✅ Sheet added successfully via setSheetAdd');
                    
                    // Update our internal sheets state
                    setSheets(prev => [...prev, newSheetData]);
                    
                    // Switch to the new sheet
                    const newSheetIndex = sheets.length;
                    setActiveSheetIndex(newSheetIndex);
                    
                    // Activate the new sheet
                    setTimeout(() => {
                      if (typeof window.luckysheet.setSheetActive === 'function') {
                        window.luckysheet.setSheetActive(newSheetIndex);
                      }
                    }, 100);
                  }
                });
                
                console.log('📋 setSheetAdd returned:', addedSheet);
                
              } catch (err) {
                console.error('❌ Error using setSheetAdd:', err);
                
                // Fallback: update our state only
                setSheets(prev => [...prev, newSheetData]);
                const newSheetIndex = sheets.length;
                setActiveSheetIndex(newSheetIndex);
              }
              
            } else {
              console.warn('⚠️ setSheetAdd not available, updating state only');
              
              // Fallback: just update our internal state
              setSheets(prev => [...prev, newSheetData]);
              const newSheetIndex = sheets.length;
              setActiveSheetIndex(newSheetIndex);
            }
            
            console.log(`✅ Successfully created new sheet: ${sheetName}`);
            
            // Show success message via chat
            const successMessage = {
              id: uuidv4(),
              type: 'assistant' as const,
              content: `✅ Successfully extracted ${selectedColumns.length} columns into new sheet "${sheetName}". Check the new sheet tab!`,
              timestamp: new Date()
            };
            setChatMessages(prev => [...prev, successMessage]);
            
            // Show additional info
            const infoMessage = {
              id: uuidv4(),
              type: 'assistant' as const,
              content: `📊 Extracted data contains ${extractedArray.length} rows and ${headers.length} columns.`,
              timestamp: new Date()
            };
            setChatMessages(prev => [...prev, infoMessage]);
            
          } catch (err) {
            console.error('❌ Failed to convert extracted data:', err);
            
            // Fallback: show success message without sheet creation
            const successMessage = {
              id: uuidv4(),
              type: 'assistant' as const,
              content: `✅ Successfully extracted ${selectedColumns.length} columns. ${result.message}`,
              timestamp: new Date()
            };
            setChatMessages(prev => [...prev, successMessage]);
            
            const errorMessage = {
              id: uuidv4(),
              type: 'assistant' as const,
              content: `⚠️ Data extracted successfully but failed to create new sheet. Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              timestamp: new Date()
            };
            setChatMessages(prev => [...prev, errorMessage]);
          }
        } else {
          // Show success message even if sheet data is not available
          const successMessage = {
            id: uuidv4(),
            type: 'assistant' as const,
            content: `✅ Successfully extracted ${selectedColumns.length} columns. ${result.message}`,
            timestamp: new Date()
          };
          setChatMessages(prev => [...prev, successMessage]);
        }
      } else {
        console.error('❌ Extraction failed:', result.error);
        
        // Show error message via chat
        const errorMessage = {
          id: uuidv4(),
          type: 'assistant' as const,
          content: `❌ Column extraction failed: ${result.error}`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('❌ Column extraction error:', error);
      
      // Show error message via chat
      const errorMessage = {
        id: uuidv4(),
        type: 'assistant' as const,
        content: `❌ Column extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  // Debug button to restore the first entry in history (pre-duplicate state)
  const restoreFirstHistoryEntry = () => {
    if (historyState.dataHistory.length > 0) {
      const firstEntry = historyState.dataHistory[0];
      console.log('[DEBUG] Manually restoring first history entry:', firstEntry);
      if (onDataUpdate) onDataUpdate(firstEntry.data);
      if (window.luckysheet && luckysheetInitialized) {
        refreshLuckysheetDataWithoutHistory(firstEntry.data);
      }
      setHistoryState({
        ...historyState,
        currentHistoryIndex: 0
      });
      setCanUndo(false);
      setCanRedo(historyState.dataHistory.length > 1);
      setLastOperation(`Manual Restore: ${firstEntry.operation}`);
    }
  };

  // Utility: Apply a Luckysheet operation and track it in history
  const applyAndTrackOperation = (operationName: string, operationFn: () => void) => {
    if (!window.luckysheet) return;
    // Get data before
    const beforeData = window.luckysheet.getSheetData();
    operationFn();
    // Get data after
    const afterData = window.luckysheet.getSheetData();
    if (JSON.stringify(beforeData) !== JSON.stringify(afterData)) {
      pushToDataHistory(afterData, operationName);
      // Track the changes
      trackDataChange(operationName);
    } else {
      console.log(`[HISTORY] No change detected for operation: ${operationName}`);
    }
  };

  // --- Keyboard Shortcut Handler ---
  useEffect(() => {
    const handleFormulaShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        let row = 0, col = 0;
        if (window.luckysheet && typeof window.luckysheet.getRange === 'function') {
          const range = window.luckysheet.getRange();
          if (range && range.length > 0) {
            row = Array.isArray(range[0].row) ? range[0].row[0] : range[0].row;
            col = Array.isArray(range[0].column) ? range[0].column[0] : range[0].column;
            let pos = null;
            try {
              const cellDom = document.querySelector(
                `.luckysheet-cell-row-${row} .luckysheet-cell-column-${col}`
              ) as HTMLElement;
              if (cellDom) {
                const rect = cellDom.getBoundingClientRect();
                pos = { top: rect.bottom + window.scrollY, left: rect.left + window.scrollX };
              }
            } catch {}
            setFormulaDialogPos(pos);
          } else {
            setFormulaDialogPos(null);
          }
        } else {
          setFormulaDialogPos(null);
        }
        setShowFormulaDialog(true);
        setFormulaInput('');
        setGeneratedFormula(null);
        setFormulaError(null);
        setFormulaCell({ row, col });
        setSelectedColumns([]);
      }
    };
    window.addEventListener('keydown', handleFormulaShortcut);
    return () => window.removeEventListener('keydown', handleFormulaShortcut);
  }, []);

  // Update sheets state when data prop changes (for backward compatibility)
  useEffect(() => {
    if (data && data.length > 0) {
      setSheets([prepareLuckysheetData(data)]);
      setActiveSheetIndex(0);
    }
  }, [data]);

  // Add a function to add a new sheet
  const handleAddSheet = () => {
    const newSheet = prepareLuckysheetData([]);
    newSheet.name = `Sheet${sheets.length + 1}`;
    setSheets(prev => [...prev, newSheet]);
    setActiveSheetIndex(sheets.length); // new sheet becomes active
    setTimeout(() => {
      if (window.luckysheet && typeof window.luckysheet.setSheetActive === 'function') {
        window.luckysheet.setSheetActive(sheets.length);
      }
    }, 300);
  };

  // Scroll to Top and Bottom handlers
  const handleScrollToTop = () => {
    if (window.luckysheet && typeof window.luckysheet.scroll === 'function') {
      window.luckysheet.scroll({ targetRow: 0 });
    }
  };

  const handleScrollToBottom = () => {
    if (window.luckysheet && typeof window.luckysheet.scroll === 'function' && data && data.length > 0) {
      window.luckysheet.scroll({ targetRow: data.length });
    }
  };

  // Center chat modal on first open
  useEffect(() => {
    if (showChatInterface && chatModalRef.current && !chatModalPos) {
      const modal = chatModalRef.current;
      const width = modal.offsetWidth;
      const height = modal.offsetHeight;
      setChatModalPos({
        x: window.innerWidth / 2 - width / 2,
        y: window.innerHeight / 2 - height / 2,
      });
    }
  }, [showChatInterface, chatModalPos]);

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    setDragging(true);
    const modal = chatModalRef.current;
    if (modal && chatModalPos) {
      const rect = modal.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };
  const handleDrag = (e: MouseEvent) => {
    if (dragging) {
      setChatModalPos((pos) =>
        pos
          ? {
              x: e.clientX - dragOffset.current.x,
              y: e.clientY - dragOffset.current.y,
            }
          : pos
      );
    }
  };
  const handleDragEnd = () => setDragging(false);

  // Formula modal drag handlers
  const handleFormulaDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!formulaModalRef.current) {
      console.log('formulaModalRef not available');
      return;
    }
    
    console.log('Starting drag...');
    const rect = formulaModalRef.current.getBoundingClientRect();
    const offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setFormulaDragOffset(offset);
    setIsDraggingFormula(true);
    
    // Ensure we have a valid position to start with
    if (!formulaDialogPos) {
      setFormulaDialogPos({
        left: rect.left,
        top: rect.top
      });
    }
    
    console.log('Drag started with offset:', offset);
  };

  const handleFormulaDrag = (e: MouseEvent) => {
    if (!isDraggingFormula) return;
    
    e.preventDefault();
    
    const newLeft = e.clientX - formulaDragOffset.x;
    const newTop = e.clientY - formulaDragOffset.y;
    
    // Keep modal within viewport bounds
    const maxLeft = window.innerWidth - 400; // assuming modal min width
    const maxTop = window.innerHeight - 300; // assuming modal height
    
    const boundedPos = {
      left: Math.max(0, Math.min(newLeft, maxLeft)),
      top: Math.max(0, Math.min(newTop, maxTop))
    };
    
    console.log('Dragging to:', boundedPos);
    setFormulaDialogPos(boundedPos);
  };

  const handleFormulaDragEnd = () => {
    console.log('Drag ended');
    setIsDraggingFormula(false);
  };
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
    } else {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [dragging]);

  // Fetch workspaces if not loaded
  useEffect(() => {
    async function fetchWorkspaces() {
      if (workspaces.length === 0) {
        const { data, error } = await supabase
          .from('workspaces')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          setWorkspaces(data);
          // Optionally set the first workspace as current if none selected
          if (!currentWorkspace && data.length > 0) {
            setCurrentWorkspace(data[0]);
          }
        }
      }
    }
    fetchWorkspaces();
  }, []);

  // Ctrl+S save functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.log('Ctrl+S pressed - saving workspace...');
        saveCurrentState('Manual Save (Ctrl+S)');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentState]);

  // Removed all custom cell styling

  // Handle Luckysheet resize when sidebar collapses/expands
  useEffect(() => {
    if (window.luckysheet && luckysheetInitialized) {
      // Small delay to ensure the transition completes
      const timer = setTimeout(() => {
        try {
          // Force Luckysheet to recalculate dimensions
          window.luckysheet.resize();
        } catch (error) {
          console.log('Luckysheet resize not available or failed:', error);
        }
      }, 350); // Slightly longer than the 300ms transition

      return () => clearTimeout(timer);
    }
  }, [sidebarCollapsed, luckysheetInitialized]);

  // Removed additional CSS styling and mutation observer

  // Download functions
  const downloadAsCSV = () => {
    try {
      if (!window.luckysheet || !data.length) return;
      
      // Get current sheet data
      const sheetData = window.luckysheet.getSheetData() as LuckysheetCellData[][];
      if (!sheetData || !sheetData.length) return;
      
      // Convert to CSV
      const csvContent = sheetData
        .map((row: LuckysheetCellData[]) => 
          row.map((cell: LuckysheetCellData) => {
            const value = cell?.v ?? '';
            // Escape quotes and wrap in quotes if contains comma or quotes
            return value.toString().includes(',') || value.toString().includes('"') || value.toString().includes('\n')
              ? `"${value.toString().replace(/"/g, '""')}"` 
              : value;
          }).join(',')
        )
        .join('\n');
      
      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const workspaceName = currentWorkspace?.name?.replace(/[^a-zA-Z0-9-_]/g, '_') || 'spreadsheet';
      const uniqueId = uuidv4().slice(0, 8);
      link.download = `${workspaceName}_${new Date().toISOString().split('T')[0]}_${uniqueId}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error downloading CSV:', error);
      alert('Failed to export data as CSV. Please try again.');
    }
  };

  const downloadAsExcel = () => {
    try {
      if (!window.luckysheet || !data.length) return;
      
      // Get current sheet data
      const sheetData = window.luckysheet.getSheetData() as LuckysheetCellData[][];
      if (!sheetData || !sheetData.length) return;

      // Get sheet configuration
      const config = window.luckysheet.getConfig();
      const sheetName = config.title || 'Sheet1';
      
      // Convert Luckysheet data to XLSX format
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(
        sheetData.map(row => 
          row.map(cell => {
            if (!cell) return null;
            
            // Handle different cell types
            if (typeof cell === 'object') {
              // If cell has a formula
              if (cell.f) {
                return { f: cell.f, t: 'n', v: cell.v };
              }
              
              // If cell has specific formatting
              if (cell.ct?.t === 'd') {
                return { t: 'd', v: cell.v, z: cell.ct.fa || 'yyyy-mm-dd' };
              }
              
              if (cell.ct?.t === 'n') {
                return { t: 'n', v: cell.v, z: cell.ct.fa || '#,##0.00' };
              }
              
              // Default to the cell value
              return cell.v;
            }
            
            return cell;
          })
        )
      );
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { 
        bookType: 'xlsx', 
        type: 'array',
        cellStyles: true
      });
      
      // Create and trigger download
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const workspaceName = currentWorkspace?.name?.replace(/[^a-zA-Z0-9-_]/g, '_') || 'spreadsheet';
      const uniqueId = uuidv4().slice(0, 8);
      link.download = `${workspaceName}_${new Date().toISOString().split('T')[0]}_${uniqueId}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error downloading Excel:', error);
      alert('Failed to export data as Excel. Please try again or use CSV export instead.');
    }
  };

  // Handle formula drag event listeners
  useEffect(() => {
    if (isDraggingFormula) {
      console.log('Adding drag listeners');
      document.addEventListener('mousemove', handleFormulaDrag);
      document.addEventListener('mouseup', handleFormulaDragEnd);
    } else {
      console.log('Removing drag listeners');
      document.removeEventListener('mousemove', handleFormulaDrag);
      document.removeEventListener('mouseup', handleFormulaDragEnd);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleFormulaDrag);
      document.removeEventListener('mouseup', handleFormulaDragEnd);
    };
  }, [isDraggingFormula]);

  // Error detection with deduplication - periodic + Enter key
  useEffect(() => {
    if (!luckysheetInitialized || !window.luckysheet) return;

    // Check for formula errors in current cell only
    const checkCurrentCellForErrors = () => {
      try {
        const range = window.luckysheet.getRange();
        if (!range || range.length === 0) return;

        const r = range[0].row[0];
        const c = range[0].column[0];
        
        const cellData = window.luckysheet.getCellValue(r, c);
        const formula = window.luckysheet.getCellValue(r, c, 'f');
        
        console.log('Checking current cell for errors:', { r, c, cellData, formula });
        
        if (cellData && typeof cellData === 'string' && cellData.startsWith('#') && formula) {
          console.log('🚨 Manual error detected in current cell!');
          handleFormulaError({
            r,
            c,
            v: cellData,
            f: formula
          });
        } else {
          // If current cell has no error, clean up any processed errors for this cell
          const cellRef = `${String.fromCharCode(65 + c)}${r + 1}`;
          setProcessedErrors(prev => {
            const newSet = new Set(prev);
            prev.forEach(errorId => {
              if (errorId.startsWith(cellRef + '-')) {
                newSet.delete(errorId);
              }
            });
            return newSet;
          });
        }
      } catch (error) {
        console.log('Error checking current cell:', error);
      }
    };

    // Check on Enter key press for immediate detection
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        console.log('Enter key pressed, checking for errors...');
        setTimeout(checkCurrentCellForErrors, 200);
      }
    };

    // Also check every 3 seconds but only current cell (with deduplication this won't spam API)
    const interval = setInterval(checkCurrentCellForErrors, 3000);

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [luckysheetInitialized, handleFormulaError]);

  if (loadingError) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Error</h3>
          <p className="text-gray-600 mb-4">{loadingError}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!isLuckysheetReady) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading EDI Spreadsheet...</h3>
          <p className="text-gray-600">Initializing your workspace</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen text-white relative overflow-hidden flex">
      {/* Background gradients matching landing page */}
      <div className="absolute inset-0 bg-black">
        {/* Subtle blue gradient from top left */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700/20 via-transparent to-transparent"></div>
        
        {/* Subtle blue gradient from bottom right */}
        <div className="absolute inset-0 bg-gradient-to-tl from-blue-900/25 via-blue-900/5 to-transparent"></div>
        
        {/* Subtle radial glow in center */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,0.2),transparent_70%)]"></div>
      </div>

      {/* Sidebar Navigation */}
      <div className={`relative z-10 ${sidebarCollapsed ? 'w-16' : 'w-80'} bg-black/80 backdrop-blur-sm border-r border-blue-900/40 shadow-lg flex flex-col transition-all duration-300`}>
        {/* Header */}
        <div className={`${sidebarCollapsed ? 'p-3' : 'p-6'} border-b border-blue-900/30 transition-all duration-300`}>
          {!sidebarCollapsed && (
            <div className="flex justify-between items-center mb-6">
              {/* User Profile Section */}
              <UserProfile variant="dark" />
              
              {/* Collapse Toggle Button */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="flex items-center justify-center p-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group"
                title="Collapse Sidebar"
              >
                <svg 
                  className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-transform duration-200" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}
          
          {sidebarCollapsed && (
            <div className="flex justify-center mb-4">
              {/* Collapse Toggle Button for collapsed state */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="w-full flex items-center justify-center p-2 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group"
                title="Expand Sidebar"
              >
                <svg 
                  className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-transform duration-200 rotate-180" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}
          
          {/* Workspace Selector */}
          {!sidebarCollapsed && (
            <div className="relative select-none" tabIndex={0} onBlur={() => setDropdownOpen(false)}>
              <button
                className={`w-full flex items-center justify-between text-sm font-medium text-white truncate cursor-pointer bg-blue-900/20 border border-blue-700/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150 ${dropdownOpen ? 'ring-2 ring-blue-400' : ''}`}
                onClick={() => setDropdownOpen((open) => !open)}
                type="button"
              >
                <span className="truncate text-left flex-1">
                  {currentWorkspace?.name || 'Select workspace'}
                </span>
                <svg className={`w-4 h-4 ml-2 transition-transform duration-200 text-blue-400 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-black/95 border border-blue-900/50 rounded-md shadow-xl z-50 py-1">
                  {workspaces.length === 0 ? (
                    <div className="px-3 py-2 text-blue-200 text-sm">No workspaces found</div>
                  ) : (
                    workspaces.map(ws => (
                      <button
                        key={ws.id}
                        className={`w-full text-left px-3 py-2 text-sm transition-all duration-100 ${
                          currentWorkspace?.id === ws.id
                            ? 'bg-blue-900/40 text-blue-200 font-medium'
                            : 'text-blue-100 hover:bg-blue-900/20'
                        }`}
                        onClick={() => {
                          setCurrentWorkspace(ws);
                          setDropdownOpen(false);
                        }}
                      >
                        {ws.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Manual Save Button */}
          {!sidebarCollapsed && (
            <div className="mt-3">
              <button
                onClick={() => saveCurrentState('Manual Save')}
                disabled={saveStatus === 'saving'}
                className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  saveStatus === 'saving' 
                    ? 'bg-blue-800 text-white cursor-not-allowed'
                    : saveStatus === 'saved'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : hasUnsavedChanges
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {saveStatus === 'saving' ? (
                  <>
                    <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved {lastSaveTime && new Date().getTime() - lastSaveTime.getTime() < 60000 
                      ? 'just now' 
                      : lastSaveTime?.toLocaleTimeString()
                    }
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Save Changes (Ctrl+S)
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Save Workspace
                  </>
                )}
              </button>
            </div>
          )}

                      {/* Download Button */}
            {!sidebarCollapsed && (
              <div className="mt-3">
                <div className="relative group">
                  <button
                    onClick={() => {
                      const dropdown = document.getElementById('download-options');
                      if (dropdown) {
                        dropdown.classList.toggle('hidden');
                        // Add click outside handler
                        const handleClickOutside = (e: MouseEvent) => {
                          if (!dropdown.contains(e.target as Node)) {
                            dropdown.classList.add('hidden');
                            document.removeEventListener('mousedown', handleClickOutside);
                          }
                        };
                        if (!dropdown.classList.contains('hidden')) {
                          setTimeout(() => {
                            document.addEventListener('mousedown', handleClickOutside);
                          }, 0);
                        }
                      }
                    }}
                    className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-colors flex items-center justify-center gap-2 text-blue-200 group-hover:text-blue-100"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Spreadsheet
                  </button>
                  <div
                    id="download-options"
                    className="hidden absolute z-50 w-full mt-2 bg-gray-900 border border-blue-900/30 rounded-lg shadow-lg overflow-hidden"
                  >
                    <button
                      onClick={downloadAsCSV}
                      className="w-full px-4 py-2 text-left text-sm text-blue-200 hover:bg-blue-600/20 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download as CSV
                    </button>
                    <button
                      onClick={downloadAsExcel}
                      className="w-full px-4 py-2 text-left text-sm text-blue-200 hover:bg-blue-600/20 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download as Excel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Save Status Indicator removed as it's now integrated into the save button */}
          </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto">
          {/* Data Operations */}
          <div className={`${sidebarCollapsed ? 'p-3' : 'p-6'} border-b border-blue-900/20`}>
            {!sidebarCollapsed && <h3 className="text-sm font-medium text-blue-300 mb-4 uppercase tracking-wider">Data Operations</h3>}
            <div className={`${sidebarCollapsed ? 'flex flex-col items-center space-y-3' : 'space-y-3'}`}>
              {onFileUpload && (
                <label className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group cursor-pointer`} title={sidebarCollapsed ? 'Upload Data' : ''}>
                  <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {!sidebarCollapsed && <span className="text-blue-200 group-hover:text-blue-100">Upload Data</span>}
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={onFileUpload}
                    className="hidden"
                  />
                </label>
              )}
              
              {/* Data Quality Report Button */}
              {data.length > 0 && (
                <button
                  onClick={() => generateDataQualityReport(false)}
                  disabled={isGeneratingReport}
                  className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={sidebarCollapsed ? 'Data Quality Report' : ''}
                >
                  {isGeneratingReport ? (
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  {!sidebarCollapsed && (
                    <span className="text-blue-200 group-hover:text-blue-100">
                      {isGeneratingReport ? 'Analyzing...' : 'Data Quality Report'}
                    </span>
                  )}
                </button>
              )}
              
              {/* Extract Columns Button */}
              {data.length > 0 && (
                <button
                  onClick={() => setShowColumnExtraction(true)}
                  className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group`}
                  title={sidebarCollapsed ? 'Extract Columns' : ''}
                >
                  <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {!sidebarCollapsed && <span className="text-blue-200 group-hover:text-blue-100">Extract Columns</span>}
                </button>
              )}

              {onClearData && data.length > 0 && (
                <button
                  onClick={onClearData}
                  className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group`}
                  title={sidebarCollapsed ? 'Clear Data' : ''}
                >
                  <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {!sidebarCollapsed && <span className="text-blue-200 group-hover:text-blue-100">Clear Data</span>}
                </button>
              )}
            </div>
          </div>

          {/* AI Commands */}
          <div className={`${sidebarCollapsed ? 'p-3' : 'p-6'} border-b border-blue-900/20`}>
            {!sidebarCollapsed && <h3 className="text-sm font-medium text-blue-300 mb-4 uppercase tracking-wider">AI Commands</h3>}
            <div className={`${sidebarCollapsed ? 'flex flex-col items-center space-y-3' : 'space-y-3'}`}>
              <button
                onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
                disabled={isProcessingCommand}
                className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg border transition-all duration-200 group ${
                  isListening 
                    ? 'bg-red-600/20 border-red-600/40 text-red-300' 
                    : 'bg-blue-600/10 hover:bg-blue-600/20 border-blue-600/30'
                }`}
                title={sidebarCollapsed ? (isListening ? 'Stop Voice Command' : 'Voice Command') : ''}
              >
                <svg className={`w-5 h-5 ${isListening ? 'text-red-400 group-hover:text-red-300' : 'text-blue-400 group-hover:text-blue-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {!sidebarCollapsed && (
                  <span className={isListening ? 'text-red-200' : 'text-blue-200 group-hover:text-blue-100'}>
                    {isListening ? 'Stop Voice Command' : 'Voice Command'}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowChatInterface(true)}
                className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group`}
                title={sidebarCollapsed ? 'AI Commands & Chat' : ''}
              >
                <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {!sidebarCollapsed && <span className="text-blue-200 group-hover:text-blue-100">AI Commands & Chat</span>}
              </button>
              <button
                onClick={() => {
                  // Initialize dialog state similar to keyboard shortcut
                  let row = 0, col = 0;
                  if (window.luckysheet && typeof window.luckysheet.getRange === 'function') {
                    const range = window.luckysheet.getRange();
                    if (range && range.length > 0) {
                      row = Array.isArray(range[0].row) ? range[0].row[0] : range[0].row;
                      col = Array.isArray(range[0].column) ? range[0].column[0] : range[0].column;
                      let pos = null;
                      try {
                        const cellDom = document.querySelector(
                          `.luckysheet-cell-row-${row} .luckysheet-cell-column-${col}`
                        ) as HTMLElement;
                        if (cellDom) {
                          const rect = cellDom.getBoundingClientRect();
                          pos = { top: rect.bottom + window.scrollY, left: rect.left + window.scrollX };
                        }
                      } catch {}
                      setFormulaDialogPos(pos);
                    } else {
                      setFormulaDialogPos(null);
                    }
                  } else {
                    setFormulaDialogPos(null);
                  }
                  setShowFormulaDialog(true);
                  setFormulaInput('');
                  setGeneratedFormula(null);
                  setFormulaError(null);
                  setFormulaCell({ row, col });
                  setSelectedColumns([]);
                }}
                className={`${sidebarCollapsed ? 'w-10 h-10 flex items-center justify-center' : 'w-full flex items-center space-x-3 px-4 py-3'} rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 transition-all duration-200 group`}
                title={sidebarCollapsed ? 'AI Formula Generation' : ''}
              >
                <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {!sidebarCollapsed && <span className="text-blue-200 group-hover:text-blue-100">AI Formula Generation</span>}
              </button>
            </div>
          </div>

          {/* Reports */}
          <div className={`${sidebarCollapsed ? 'p-3' : 'p-6'} border-b border-blue-900/20`}>
            {!sidebarCollapsed && <h3 className="text-sm font-medium text-blue-300 mb-4 uppercase tracking-wider">Reports</h3>}
            <div className={`${sidebarCollapsed ? 'flex flex-col items-center' : 'flex items-center'}`}>
              <ReportGenerator isDataLoaded={data.length > 0} workspaceId={currentWorkspace?.id ?? null} collapsed={sidebarCollapsed} />
            </div>
          </div>

        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Main Spreadsheet Area */}
        <div className="flex-1 w-full h-full min-h-[500px] flex flex-col">
          {/* Luckysheet container - do not render any React children inside */}
          <div className="flex-1 w-full h-full bg-white" ref={containerRef} style={{ position: 'relative', margin: 0, padding: 0, minHeight: '500px' }}>
            {!luckysheetInitialized && isLuckysheetReady && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600">Initializing spreadsheet...</p>
                </div>
              </div>
            )}
          </div>
          {/* Scroll to Top/Bottom Arrows - positioned unobtrusively */}
          {data && data.length > 0 && (
            <div style={{
                  position: 'fixed',
              bottom: 27,
              right: 20,
                  zIndex: 1001,
              display: 'flex',
              gap: '3px',
              background: 'rgba(0, 0, 0, 0.1)',
              borderRadius: '12px',
              padding: '4px',
              backdropFilter: 'blur(4px)',
            }}>
              <button
                style={{
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  background: '#3b82f6',
                  boxShadow: '0 1px 3px rgba(59,130,246,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title="Scroll to Top"
                onClick={handleScrollToTop}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.background = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.background = '#3b82f6';
                }}
              >
                ↑
              </button>
              <button
                style={{
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  background: '#3b82f6',
                  boxShadow: '0 1px 3px rgba(59,130,246,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                title="Scroll to Bottom"
                onClick={handleScrollToBottom}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.background = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.background = '#3b82f6';
                }}
              >
                ↓
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat Modal Overlay */}
      <AnimatePresence>
        {showChatInterface && (
          <motion.div
            style={{
              position: 'fixed',
              zIndex: 9999,
              left: chatModalPos?.x ?? '50%',
              top: chatModalPos?.y ?? '50%',
              width: '100%',
              maxWidth: '48rem',
              height: '80vh',
              pointerEvents: 'auto',
              transform: chatModalPos ? 'none' : 'translate(-50%, -50%)',
              background: 'rgba(0, 0, 0, 0.95)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '1.5rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 40px rgba(59, 130, 246, 0.2)',
              overflow: 'hidden',
              backdropFilter: 'blur(20px)',
            }}
            ref={chatModalRef}
          >
            {/* Modal Content */}
            <motion.div
              className="relative bg-black/90 backdrop-blur-md rounded-2xl w-full h-full flex flex-col overflow-hidden border border-blue-900/20"
            >
              {/* Modal Header */}
              <div
                className="flex items-center justify-between p-6 border-b border-blue-900/30 bg-black/80 backdrop-blur-md cursor-move select-none"
                onMouseDown={handleDragStart}
                style={{ userSelect: 'none' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">AI Commands & Chat</h2>
                    <p className="text-blue-300/80 text-sm">Execute commands instantly or get AI-powered data analysis</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearChatHistory}
                    className="text-blue-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-blue-600/20 border border-transparent hover:border-blue-500/30 transition-all duration-200 text-sm font-medium"
                  >
                    Clear Chat
                  </button>
                  <button
                    onClick={() => setShowChatInterface(false)}
                    className="text-blue-300 hover:text-white p-2 rounded-lg hover:bg-blue-600/20 border border-transparent hover:border-blue-500/30 transition-all duration-200"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black/30">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`flex gap-3 max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                          message.type === 'user' 
                            ? 'bg-blue-600 text-white border-blue-500/30' 
                            : 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                        }`}>
                          {message.type === 'user' ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          )}
                        </div>

                        {/* Message Content */}
                        <div
                          className={`rounded-2xl px-4 py-3 backdrop-blur-sm border ${
                            message.type === 'user'
                              ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-500/30 shadow-lg'
                              : 'bg-black/60 text-blue-100 border-blue-900/40 shadow-lg'
                          }`}
                          style={{
                            fontSize: '14px',
                            lineHeight: '1.6'
                          }}
                        >
                          {message.isTyping ? (
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                              </div>
                              <span className="text-blue-300 text-sm">Analyzing your data...</span>
                            </div>
                          ) : (
                            <>
                              <div 
                                className={`whitespace-pre-wrap text-sm leading-relaxed ${
                                  message.type === 'user' ? 'text-white' : 'text-blue-100'
                                }`}
                                style={{
                                  fontSize: '14px',
                                  lineHeight: '1.6',
                                  fontWeight: '400'
                                }}
                              >
                                {message.content}
                              </div>
                              {/* Display visualization if present */}
                              {message.visualization && (
                                <div className="mt-3 p-3 bg-black/40 rounded-lg border border-blue-500/30 backdrop-blur-sm">
                                  <div className="text-xs font-medium text-blue-300 mb-2">📊 Generated Visualization</div>
                                  {message.visualization.path.endsWith('.html') ? (
                                    <div className="space-y-2">
                                      <a 
                                        href={`http://localhost:8000${message.visualization.path}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                      >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Open Interactive Chart
                                      </a>
                                      <div className="text-xs text-gray-600">Click to view the interactive visualization in a new tab</div>
                                    </div>
                                  ) : (
                                    <img 
                                      src={`http://localhost:8000${message.visualization.path}`}
                                      alt="Generated visualization"
                                      className="max-w-full h-auto rounded border"
                                      onError={(e) => {
                                        const target = e.currentTarget as HTMLImageElement;
                                        const errorDiv = target.nextElementSibling as HTMLDivElement;
                                        target.style.display = 'none';
                                        if (errorDiv) errorDiv.style.display = 'block';
                                      }}
                                    />
                                  )}
                                  <div className="text-xs text-red-600 mt-2" style={{ display: 'none' }}>
                                    Failed to load visualization. <a href={`http://localhost:8000${message.visualization.path}`} target="_blank" rel="noopener noreferrer" className="underline text-red-700">View directly</a>
                                  </div>
                                </div>
                              )}
                              <div className={`text-xs mt-2 ${
                                message.type === 'user' ? 'text-blue-200' : 'text-blue-300/70'
                              }`}>
                                {message.timestamp.toLocaleTimeString()}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Questions */}
                <div className="px-6 py-3 border-t border-blue-900/30 bg-black/40">
                  <div className="text-xs font-medium text-blue-300 mb-2">💡 Quick Questions:</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "What trends do you see in this data?",
                      "Create a chart from this data",
                      "Show me statistical insights",
                      "What are the key patterns?",
                      "Generate a data summary",
                      "Create a visualization"
                    ].map((question, index) => (
                      <button
                        key={index}
                        onClick={() => setChatInput(question)}
                        className="text-xs px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 hover:text-white rounded-full border border-blue-500/30 hover:border-blue-400/50 transition-all duration-200 font-medium backdrop-blur-sm"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input */}
                <div className="p-6 border-t border-blue-900/30 bg-black/60 backdrop-blur-sm">
                  <form onSubmit={handleChatSubmit} className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <textarea
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Ask me anything about your data... (e.g., 'What are the key trends?', 'Show me statistical insights', 'Create a summary report')"
                          className="w-full px-4 py-3 border border-blue-500/30 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 text-blue-100 placeholder-blue-300/60 bg-black/40 backdrop-blur-sm"
                          rows={3}
                          disabled={isChatProcessing}
                          style={{
                            fontSize: '14px',
                            lineHeight: '1.5'
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleChatSubmit(e);
                            }
                          }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!chatInput.trim() || isChatProcessing}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm self-end flex items-center gap-2 shadow-lg border border-blue-500/30"
                      >
                        {isChatProcessing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            Send
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-blue-300/70 flex items-center gap-4 font-medium">
                      <span>💡 Press Enter to send, Shift+Enter for new line</span>
                      <span>🔒 Your data stays secure and private</span>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

            {/* --- Data Quality Report Modal --- */}
      {showDataQualityReport && dataQualityReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-black/95 border border-blue-900/50 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900/80 to-blue-800/80 border-b border-blue-700/50 text-white p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-blue-100">📊 Data Quality Report</h2>
                <p className="text-blue-200/80 mt-1">Comprehensive analysis of your data quality</p>
                {dataQualityReport.generatedAt && (
                  <div className="text-xs text-blue-300/70 mt-1">
                    <span>Generated: {new Date(dataQualityReport.generatedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-100">{dataQualityReport.summary.overallQuality.score}%</div>
                  <div className="text-sm text-blue-200">{dataQualityReport.summary.overallQuality.grade}</div>
                </div>
                <button
                  onClick={() => setShowDataQualityReport(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-blue-200 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

                        {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-300">{dataQualityReport.summary.totalRows}</div>
                  <div className="text-sm text-blue-200/70">Total Rows</div>
                </div>
                <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-300">{dataQualityReport.summary.totalColumns}</div>
                  <div className="text-sm text-green-200/70">Total Columns</div>
                </div>
                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-300">{dataQualityReport.duplicates.count}</div>
                  <div className="text-sm text-red-200/70">Duplicate Rows</div>
                </div>
                <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-300">{dataQualityReport.missingValues.totalMissing}</div>
                  <div className="text-sm text-orange-200/70">Missing Values</div>
                </div>
              </div>

               {/* Quality Score Breakdown */}
               {dataQualityReport.summary.overallQuality.breakdown && (
                 <div className="bg-blue-900/10 border border-blue-700/30 rounded-lg p-6">
                   <h3 className="text-lg font-bold text-blue-200 mb-4">🎯 Quality Score Breakdown</h3>
                   <div className="space-y-3">
                     <div className="flex items-center justify-between bg-black/40 border border-blue-800/30 rounded p-3">
                       <span className="text-blue-200">Base Score</span>
                       <span className="font-bold text-green-400">100%</span>
                     </div>
                     {dataQualityReport.summary.overallQuality.breakdown.duplicatesImpact > 0 && (
                       <div className="flex items-center justify-between bg-black/40 border border-red-800/30 rounded p-3">
                         <span className="text-blue-200">Duplicate Rows Penalty</span>
                         <span className="font-bold text-red-400">-{dataQualityReport.summary.overallQuality.breakdown.duplicatesImpact.toFixed(1)}%</span>
                       </div>
                     )}
                     {dataQualityReport.summary.overallQuality.breakdown.missingValuesImpact > 0 && (
                       <div className="flex items-center justify-between bg-black/40 border border-orange-800/30 rounded p-3">
                         <span className="text-blue-200">Missing Values Penalty</span>
                         <span className="font-bold text-orange-400">-{dataQualityReport.summary.overallQuality.breakdown.missingValuesImpact.toFixed(1)}%</span>
                       </div>
                     )}
                     {dataQualityReport.summary.overallQuality.breakdown.typeIssuesImpact > 0 && (
                       <div className="flex items-center justify-between bg-black/40 border border-purple-800/30 rounded p-3">
                         <span className="text-blue-200">Data Type Issues Penalty</span>
                         <span className="font-bold text-purple-400">-{dataQualityReport.summary.overallQuality.breakdown.typeIssuesImpact.toFixed(1)}%</span>
                       </div>
                     )}
                     <div className="border-t border-blue-700/30 pt-3">
                       <div className="flex items-center justify-between bg-gradient-to-r from-blue-800/40 to-blue-700/40 border border-blue-600/50 rounded p-3">
                         <span className="text-blue-100 font-bold">Final Quality Score</span>
                         <span className="font-bold text-2xl text-blue-300">{dataQualityReport.summary.overallQuality.score}%</span>
                       </div>
                     </div>
                   </div>
                 </div>
               )}

                             {/* Duplicate Rows Section */}
               {dataQualityReport.duplicates.count > 0 && (
                 <div className="bg-red-900/10 border border-red-700/30 rounded-lg p-6">
                   <h3 className="text-lg font-bold text-red-300 mb-4 flex items-center">
                     🔍 Duplicate Rows Found
                   </h3>
                   <p className="text-red-200/80 mb-4">{dataQualityReport.duplicates.summary}</p>
                   <div className="space-y-3 max-h-60 overflow-y-auto">
                     {dataQualityReport.duplicates.locations.map((dup: any, index: number) => (
                       <div key={index} className="bg-black/40 border border-red-700/30 rounded p-3 border-l-4 border-red-500">
                         <div className="font-medium text-red-300">
                           Row {dup.duplicateRow} duplicates Row {dup.originalRow}
                         </div>
                         <div className="text-sm text-blue-200/60 mt-1">
                           Data: {JSON.stringify(dup.data).slice(0, 100)}...
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

                             {/* Missing Values Section */}
               {dataQualityReport.missingValues.totalMissing > 0 && (
                 <div className="bg-orange-900/10 border border-orange-700/30 rounded-lg p-6">
                   <h3 className="text-lg font-bold text-orange-300 mb-4 flex items-center">
                     ⚠️ Missing Values Found
                   </h3>
                   <p className="text-orange-200/80 mb-4">{dataQualityReport.missingValues.summary}</p>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {Object.entries(dataQualityReport.missingValues.byColumn).map(([column, info]: [string, any]) => (
                       info.count > 0 && (
                         <div key={column} className="bg-black/40 border border-orange-700/30 rounded p-4 border-l-4 border-orange-500">
                           <div className="font-medium text-orange-300 mb-2">
                             {column} ({info.count} missing)
                           </div>
                           <div className="text-sm text-blue-200/60">
                             Cells: {info.cells.slice(0, 10).join(', ')}
                             {info.cells.length > 10 && ` (+${info.cells.length - 10} more)`}
                           </div>
                         </div>
                       )
                     ))}
                   </div>
                 </div>
               )}

                             {/* Data Type Issues */}
               {dataQualityReport.dataTypeIssues.length > 0 && (
                 <div className="bg-purple-900/10 border border-purple-700/30 rounded-lg p-6">
                   <h3 className="text-lg font-bold text-purple-300 mb-4 flex items-center">
                     🔧 Data Type Inconsistencies
                   </h3>
                   <div className="space-y-4">
                     {dataQualityReport.dataTypeIssues.map((issue: any, index: number) => (
                       <div key={index} className="bg-black/40 border border-purple-700/30 rounded p-4 border-l-4 border-purple-500">
                         <div className="font-medium text-purple-300 mb-2">
                           Column: {issue.column}
                         </div>
                         <div className="text-sm text-blue-200/80 mb-2">
                           Mixed types: {issue.types.join(', ')}
                         </div>
                         <div className="text-xs text-blue-200/60">
                           Examples: {issue.examples.map((ex: any) => `Row ${ex.row}: ${ex.value} (${ex.type})`).join(', ')}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

                             {/* No Issues Found */}
               {dataQualityReport.duplicates.count === 0 && 
                dataQualityReport.missingValues.totalMissing === 0 && 
                dataQualityReport.dataTypeIssues.length === 0 && (
                 <div className="bg-green-900/10 border border-green-700/30 rounded-lg p-6 text-center">
                   <div className="text-6xl mb-4">✅</div>
                   <h3 className="text-xl font-bold text-green-300 mb-2">Excellent Data Quality!</h3>
                   <p className="text-green-200/80">No major data quality issues were found in your dataset.</p>
                 </div>
               )}

                             {/* Data Types Summary */}
               <div className="bg-blue-900/10 border border-blue-700/30 rounded-lg p-6">
                 <h3 className="text-lg font-bold text-blue-200 mb-4">📋 Data Types Summary</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {Object.entries(dataQualityReport.summary.dataTypes).map(([column, info]: [string, any]) => (
                     <div key={column} className="bg-black/40 border border-blue-800/30 rounded p-3">
                       <div className="font-medium text-blue-200">{column}</div>
                       <div className="text-sm text-blue-300/80">Type: {info.dominantType}</div>
                       <div className="text-xs text-blue-200/60">
                         {Object.entries(info.typeCounts).map(([type, count]: [string, any]) => 
                           `${type}: ${count}`
                         ).join(', ')}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>

                             {/* Actions */}
               <div className="bg-blue-900/10 border border-blue-700/30 rounded-lg p-6">
                 <h3 className="text-lg font-bold text-blue-200 mb-4">🛠️ Recommended Actions</h3>
                 <div className="space-y-2">
                   {dataQualityReport.duplicates.count > 0 && (
                     <div className="flex items-center justify-between bg-black/40 border border-blue-800/30 rounded p-3">
                       <span className="text-blue-200">Remove {dataQualityReport.duplicates.count} duplicate rows</span>
                       <button 
                         onClick={() => {
                           setShowDataQualityReport(false);
                           setShowChatInterface(true);
                           setChatInput('Remove duplicates from this data');
                         }}
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm"
                       >
                         Fix Now
                       </button>
                     </div>
                   )}
                   {dataQualityReport.missingValues.totalMissing > 0 && (
                     <div className="flex items-center justify-between bg-black/40 border border-blue-800/30 rounded p-3">
                       <span className="text-blue-200">Handle {dataQualityReport.missingValues.totalMissing} missing values</span>
                       <button 
                         onClick={() => {
                           setShowDataQualityReport(false);
                           setShowChatInterface(true);
                           setChatInput('Show me how to handle missing values in this data');
                         }}
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm"
                       >
                         Get Help
                       </button>
                     </div>
                   )}
                 </div>
               </div>
            </div>

            {/* Footer */}
            <div className="border-t border-blue-700/30 p-4 bg-black/40 flex justify-end gap-3">
              <button
                onClick={() => setShowDataQualityReport(false)}
                className="px-6 py-2 border border-blue-700/30 text-blue-200 rounded-lg hover:bg-blue-900/20 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  // Generate a new report (force regenerate)
                  generateDataQualityReport(true);
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Refresh Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Formula Dialog UI --- */}
      {showFormulaDialog && (
        <div
          ref={formulaModalRef}
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: formulaDialogPos?.top && formulaDialogPos.top < window.innerHeight - 500 ? formulaDialogPos.top : '50%',
            left: formulaDialogPos?.left && formulaDialogPos.left < window.innerWidth - 500 ? formulaDialogPos.left : '50%',
            transform: formulaDialogPos ? 'none' : 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(30,41,59,0.95) 100%)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(59,130,246,0.1)',
            padding: 32,
            minWidth: 380,
            maxWidth: '95vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            fontFamily: 'Inter, sans-serif',
            color: '#e0e6f0',
            display: 'flex',
            flexDirection: 'column',
            cursor: isDraggingFormula ? 'grabbing' : 'default',
          }}
        >
          {/* Close Button */}
          <button
            onClick={handleFormulaCancel}
            style={{
              position: 'absolute',
              top: 18,
              right: 24,
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              fontSize: 18,
              color: '#94a3b8',
              cursor: 'pointer',
              fontWeight: 700,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(59,130,246,0.2)';
              e.currentTarget.style.color = '#e0e6f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(59,130,246,0.1)';
              e.currentTarget.style.color = '#94a3b8';
            }}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
          <div
            style={{ marginBottom: 24, userSelect: 'none' }}
          >
            <div 
              style={{ 
                fontSize: 22, 
                fontWeight: 700, 
                color: '#e0e6f0', 
                marginBottom: 8, 
                letterSpacing: 0.2,
                cursor: isDraggingFormula ? 'grabbing' : 'grab',
                padding: '8px 0'
              }}
              onMouseDown={handleFormulaDragStart}
            >
              Natural Language Formula
            </div>
            <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 18 }}>Describe your calculation or select columns to generate a spreadsheet formula.</div>
            
            {/* Data Context Info */}
            {data && data.length > 0 && (() => {
              const dataRangeInfo = getDataRangeInfo();
              return dataRangeInfo ? (
                <div style={{
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 18,
                  fontSize: 12,
                  lineHeight: 1.4
                }}>
                  <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: 4 }}>📊 Data Context</div>
                  <div style={{ color: '#94a3b8' }}>
                    {dataRangeInfo.summary}<br/>
                    Formulas will use precise ranges instead of entire columns for better performance.
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Column selection with checkboxes */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, marginBottom: 6, display: 'block', color: '#e0e6f0', fontSize: 15 }}>Select column(s):</label>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 6,
                maxHeight: 180,
                overflowY: 'auto',
                background: 'rgba(30,41,59,0.5)',
                borderRadius: 6,
                border: '1px solid rgba(59,130,246,0.3)',
                padding: '10px 8px',
              }}>
                {allColumns.map((col, idx) => {
                  const checked = selectedColumns.includes(col);
                  const dataRangeInfo = getDataRangeInfo();
                  const columnRange = dataRangeInfo?.columnRanges[idx];
                  const rangeText = columnRange?.hasData 
                    ? `${columnRange.range} [${columnRange.dataCount} rows]`
                    : `${columnLetter(idx)}${dataRangeInfo?.dataStartRow || 2} [no data]`;
                  
                  return (
                    <label key={col} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      fontWeight: checked ? 700 : 500,
                      color: checked ? '#60a5fa' : '#94a3b8',
                      background: checked ? 'rgba(59,130,246,0.1)' : 'transparent',
                      borderRadius: 4,
                      padding: '6px 8px',
                      cursor: 'pointer',
                      transition: 'background 0.2s, color 0.2s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedColumns([...selectedColumns, col]);
                              if (selectedColumns.length === 0 && !formulaInput && columnRange?.hasData) {
                                setFormulaInput(`sum all values in ${col} (${columnRange.range})`);
                            }
                          } else {
                            setSelectedColumns(selectedColumns.filter(c => c !== col));
                          }
                        }}
                        style={{ accentColor: '#3b82f6', width: 16, height: 16 }}
                        aria-label={`Select column ${col}`}
                      />
                        <span style={{ fontSize: '14px' }}>{`${col} (${columnLetter(idx)})`}</span>
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: checked ? 'rgba(96,165,250,0.7)' : 'rgba(148,163,184,0.7)',
                        marginLeft: '24px',
                        fontFamily: 'monospace'
                      }}>
                        {rangeText}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <input
              type="text"
              value={formulaInput}
              onChange={e => { setFormulaInput(e.target.value); setGeneratedFormula(null); setFormulaError(null); }}
              placeholder="e.g. sum all values above"
              style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', color: '#e0e6f0', background: 'rgba(30,41,59,0.5)', marginBottom: 12, marginTop: 2 }}
              autoFocus
              disabled={formulaLoading || !!generatedFormula}
            />
            {formulaError && <div style={{ color: '#f87171', marginBottom: 10, fontWeight: 500 }}>{formulaError}</div>}
            {formulaLoading && <div style={{ marginBottom: 10, color: '#94a3b8' }}>Generating formula...</div>}
                          {generatedFormula && !formulaLoading && (
                <>
                  <div style={{ marginBottom: 8, fontWeight: 600, color: '#e0e6f0' }}>Generated Formula:</div>
                  <input
                    type="text"
                    value={generatedFormula}
                    onChange={e => setGeneratedFormula(e.target.value)}
                    style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', color: '#e0e6f0', background: 'rgba(30,41,59,0.5)', marginBottom: 10 }}
                  />
                </>
              )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={handleFormulaCancel} disabled={formulaLoading} style={{ padding: '10px 22px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(30,41,59,0.5)', color: '#94a3b8', fontWeight: 600, fontSize: 15, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', transition: 'all 0.2s', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; e.currentTarget.style.color = '#e0e6f0'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(30,41,59,0.5)'; e.currentTarget.style.color = '#94a3b8'; }}>Cancel</button>
            {!generatedFormula && (
              <button type="button" onClick={handleFormulaSubmit} disabled={formulaLoading || (!formulaInput.trim() && selectedColumns.length === 0)} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 15, boxShadow: '0 2px 8px rgba(59,130,246,0.3)', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#3b82f6'; }}>Generate</button>
            )}
            {generatedFormula && !formulaLoading && (
              <>
                <button type="button" onClick={handleFormulaRegenerate} disabled={formulaLoading || (!formulaInput.trim() && selectedColumns.length === 0)} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 15, boxShadow: '0 2px 8px rgba(245,158,11,0.3)', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#d97706'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#f59e0b'; }}>Regenerate</button>
                <button type="button" onClick={handleFormulaAccept} disabled={formulaLoading || !generatedFormula} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 15, boxShadow: '0 2px 8px rgba(59,130,246,0.3)', transition: 'background 0.2s', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#3b82f6'; }}>Accept</button>
              </>
            )}
          </div>
        </div>
      )}
      
              {currentError && (
          <FormulaErrorDialog
            error={currentError}
            onClose={() => setCurrentError(null)}
          />
        )}
        {showErrorHistory && (
          <FormulaErrorHistoryPanel
            onClose={() => setShowErrorHistory(false)}
          />
        )}

        {/* Column Extraction Dialog */}
        {showColumnExtraction && (
          <ColumnExtractionDialog
            isOpen={showColumnExtraction}
            onClose={() => setShowColumnExtraction(false)}
            onExtract={handleColumnExtraction}
          />
        )}

        {/* Formula Error History Button */}
        <button
          onClick={() => setShowErrorHistory(true)}
          className="fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors z-[1000]"
          title="View Formula Error History"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorHistory.filter(e => !e.resolved).length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {errorHistory.filter(e => !e.resolved).length}
            </span>
          )}
        </button>
      </div>
    );
} 