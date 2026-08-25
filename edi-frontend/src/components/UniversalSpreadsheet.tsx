/**
 * UniversalSpreadsheet Component
 * 
 * The spreadsheet. Univer under the hood, wrapped in the file menu, the
 * formula assistant and the auto-save the rest of the app talks to.
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import 'reflect-metadata';

// Univer styles
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';

// Univer presets and configuration
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import UniverPresetSheetsFilterEnUS from '@univerjs/preset-sheets-filter/locales/en-US';
import { UniverSheetsNotePreset } from '@univerjs/preset-sheets-note';
import UniverPresetSheetsNoteEnUS from '@univerjs/preset-sheets-note/locales/en-US';
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace';
import UniverPresetSheetsFindReplaceEnUS from '@univerjs/preset-sheets-find-replace/locales/en-US';

// Regular plugins (not presets)
// The /facade entry is what puts sort() on FWorksheet and FRange. Registering
// the plugin alone gives you the toolbar command but not the scripting API, and
// UniverAdapter.sort() calls the scripting API.
import '@univerjs/sheets-sort/facade';
import { UniverSheetsSortPlugin } from '@univerjs/sheets-sort';
import { UniverSheetsSortUIPlugin } from '@univerjs/sheets-sort-ui';
import UniverSheetsSortUIEnUS from '@univerjs/sheets-sort-ui/locale/en-US';
import { UniverSheetsDataValidationPlugin } from '@univerjs/sheets-data-validation';
import { UniverSheetsDataValidationUIPlugin } from '@univerjs/sheets-data-validation-ui';
import UniverSheetsDataValidationUIEnUS from '@univerjs/sheets-data-validation-ui/locale/en-US';
import { UniverSheetsConditionalFormattingPlugin } from '@univerjs/sheets-conditional-formatting';
import { UniverSheetsConditionalFormattingUIPlugin } from '@univerjs/sheets-conditional-formatting-ui';
import UniverSheetsConditionalFormattingUIEnUS from '@univerjs/sheets-conditional-formatting-ui/locale/en-US';
import { UniverSheetsHyperLinkPlugin } from '@univerjs/sheets-hyper-link';
import { UniverSheetsHyperLinkUIPlugin } from '@univerjs/sheets-hyper-link-ui';
import UniverSheetsHyperLinkUIEnUS from '@univerjs/sheets-hyper-link-ui/locale/en-US';
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing';
import { UniverSheetsDrawingUIPlugin } from '@univerjs/sheets-drawing-ui';
import UniverSheetsDrawingUIEnUS from '@univerjs/sheets-drawing-ui/locale/en-US';

// Styles
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import '@univerjs/preset-sheets-note/lib/index.css';
import '@univerjs/preset-sheets-find-replace/lib/index.css';
import '@univerjs/sheets-sort-ui/lib/index.css';
import '@univerjs/sheets-data-validation-ui/lib/index.css';
import '@univerjs/sheets-conditional-formatting-ui/lib/index.css';
import '@univerjs/sheets-hyper-link-ui/lib/index.css';
import '@univerjs/sheets-drawing-ui/lib/index.css';

import { API_ENDPOINTS } from '@/config';
import { UniverConverter } from '@/utils/univerConverter';
import { UniverAdapter, createUniverAdapter } from '@/utils/univerAdapter';
import ChatSidebar from '@/components/ChatSidebar';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Calculator, BarChart3 } from 'lucide-react';

interface UniversalSpreadsheetProps {
  data?: Array<any>;
  onCommand?: (command: string) => Promise<any>;
  onDataUpdate?: (newData: Array<any>) => void;
  onFileUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearData?: () => void;
  isDataEmpty?: boolean;
  filename?: string;
  isFromSavedWorkspace?: boolean;
  disableFormulaErrorUI?: boolean;
  hideSidebar?: boolean;
  initialSheets?: any[]; // Univer workbook snapshot
  onAdapterReady?: (adapter: UniverAdapter | null) => void; // Callback to expose adapter to parent
}

/**
 * Column names and data-row count, for either shape the sheet's data can hold.
 *
 * Straight from an upload it is objects keyed by column. Once the spreadsheet
 * has taken ownership it is the 2D form the sheet works in -- `[headers,
 * ...rows]`. Reading `Object.keys(data[0])` on that second shape yields "0",
 * "1", "2" and counts the header as a data row, which is how the formula
 * dialog came to offer columns named 0-5 over the range A2:A122 for a file
 * with 120 rows.
 */
function describeGrid(rows?: any[]): { headers: string[]; rowCount: number } {
    if (!rows || rows.length === 0) return { headers: [], rowCount: 0 };

    const first = rows[0];
    if (Array.isArray(first)) {
        const headerRow = rows.length > 1 && first.every((cell) => typeof cell === 'string');
        return {
            headers: headerRow
                ? first.map(String)
                : first.map((_, i) => String.fromCharCode(65 + i)),
            rowCount: headerRow ? rows.length - 1 : rows.length
        };
    }

    return { headers: Object.keys(first), rowCount: rows.length };
}

export default function UniversalSpreadsheet({
  data = [],
  onCommand,
  onDataUpdate,
  onFileUpload,
  isDataEmpty,
  filename,
  isFromSavedWorkspace = false,
  hideSidebar = false,
  initialSheets,
  onAdapterReady,
}: UniversalSpreadsheetProps) {


  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<any>(null); // Type: Univer
  const univerAPIRef = useRef<any>(null); // Type: FUniver
  const univerAdapterRef = useRef<UniverAdapter | null>(null); // API Adapter for AI commands
  const initializingRef = useRef<boolean>(false); // Guard against double initialization

  // Save state tracking refs (for auto-save)
  const lastSavedDataRef = useRef<string>('');
  const lastSavedSheetRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventDisposableRef = useRef<any>(null); // Store event listener disposable

  // Univer's change listener is registered once, during initialization, so a
  // direct reference would pin the first trackDataChange forever -- and with it
  // the workspace id that happened to be current then. Going through a ref
  // means an edit made after switching workspaces is saved against the one the
  // user is actually looking at.
  const trackDataChangeRef = useRef<() => void>(() => {});

  // State
  const [univerInitialized, setUniverInitialized] = useState(false);
  // The same adapter the ref holds. The ref is for the imperative call sites in
  // this file; this is for handing to ChatSidebar, which needs it to arrive as
  // a prop rather than by reaching into a ref mid-render.
  const [univerAdapter, setUniverAdapter] = useState<UniverAdapter | null>(null);
  const [currentData, setCurrentData] = useState<any[]>(data);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const isProcessingCommand = false;

  // Save state tracking
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // ChatSidebar state
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const { currentWorkspace } = useWorkspace();

  // Formula Dialog state
  const [showFormulaDialog, setShowFormulaDialog] = useState(false);
  const [formulaInput, setFormulaInput] = useState('');
  const [formulaDialogPos, setFormulaDialogPos] = useState<{top: number, left: number} | null>(null);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [generatedFormula, setGeneratedFormula] = useState<string | null>(null);
  const [formulaExplanation, setFormulaExplanation] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [formulaCell, setFormulaCell] = useState<{row: number, col: number}>({row: 0, col: 0});
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isDraggingFormula, setIsDraggingFormula] = useState(false);
  const [formulaDragOffset, setFormulaDragOffset] = useState<{x: number, y: number}>({x: 0, y: 0});
  const formulaModalRef = useRef<HTMLDivElement>(null);

  // Handle Univer resize when sidebar expands/collapses
  useEffect(() => {
    if (!univerInitialized || !univerRef.current) return;
    
    // Add a timeout to account for the CSS transition (300ms)
    const timeoutId = setTimeout(() => {
      try {
        // Force Univer to recalculate its dimensions
        // Univer doesn't have a direct resize method, but we can trigger a window resize event
        window.dispatchEvent(new Event('resize'));
      } catch (error) {
        console.error('Error resizing Univer:', error);
      }
    }, 350); // Slightly longer than CSS transition to ensure it completes
    
    return () => clearTimeout(timeoutId);
  }, [sidebarExpanded, univerInitialized]);

  // This effect will handle the one-time initialization of Univer.
  useEffect(() => {
    // There is no "are the Univer packages installed" check here on purpose.
    // They are static imports at the top of this file, so a missing one fails
    // the module before this component exists; the check that used to live here
    // could never be reached, and TypeScript said so.

    // Prevent double initialization in React Strict Mode
    if (initializingRef.current || univerRef.current || !containerRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      // Use the new createUniver API with all presets and proper localization
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales(
            UniverPresetSheetsCoreEnUS,
            UniverPresetSheetsFilterEnUS,
            UniverPresetSheetsNoteEnUS,
            UniverPresetSheetsFindReplaceEnUS,
            UniverSheetsSortUIEnUS,
            UniverSheetsDataValidationUIEnUS,
            UniverSheetsConditionalFormattingUIEnUS,
            UniverSheetsHyperLinkUIEnUS,
            UniverSheetsDrawingUIEnUS
          ),
        },
        presets: [
          UniverSheetsCorePreset({
            container: 'univer-container',
          }),
          UniverSheetsFilterPreset(),
          UniverSheetsNotePreset(),
          UniverSheetsFindReplacePreset(),
        ],
      });
      
      univerRef.current = univer;
      univerAPIRef.current = univerAPI;

      // Create API adapter for AI commands and programmatic control
      univerAdapterRef.current = createUniverAdapter(univerAPI, univer);
      setUniverAdapter(univerAdapterRef.current);

      // Expose adapter to parent component for state persistence
      if (onAdapterReady) {
        onAdapterReady(univerAdapterRef.current);
      }
      
      // Register all regular plugins (not presets) in proper order
      
      // Note: Number formatting (numfmt) is already included in UniverSheetsCorePreset
      
      // Sort plugins
      if (UniverSheetsSortPlugin && UniverSheetsSortUIPlugin) {
        univer.registerPlugin(UniverSheetsSortPlugin);
        univer.registerPlugin(UniverSheetsSortUIPlugin);
      }
      
      // Note: Find & Replace is already included in UniverSheetsFindReplacePreset
      // Access via Ctrl+F or toolbar button
      
      // Data Validation (depends on numfmt)
      if (UniverSheetsDataValidationPlugin && UniverSheetsDataValidationUIPlugin) {
        univer.registerPlugin(UniverSheetsDataValidationPlugin);
        univer.registerPlugin(UniverSheetsDataValidationUIPlugin);
      }
      
      // Conditional Formatting
      if (UniverSheetsConditionalFormattingPlugin && UniverSheetsConditionalFormattingUIPlugin) {
        univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
        univer.registerPlugin(UniverSheetsConditionalFormattingUIPlugin);
      }
      
      // Hyperlinks
      if (UniverSheetsHyperLinkPlugin && UniverSheetsHyperLinkUIPlugin) {
        univer.registerPlugin(UniverSheetsHyperLinkPlugin);
        univer.registerPlugin(UniverSheetsHyperLinkUIPlugin);
      }
      
      // Drawing (shapes, images)
      if (UniverSheetsDrawingPlugin && UniverSheetsDrawingUIPlugin) {
        univer.registerPlugin(UniverSheetsDrawingPlugin);
        univer.registerPlugin(UniverSheetsDrawingUIPlugin);
      }


      // Create workbook with data
      const workbookData = UniverConverter.arrayToUniver(initialSheets || data, columnOrder);
      univerAPI.createWorkbook(workbookData);

      // Set up event listener for auto-save on changes
      if (univerAPI && univerAPI.Event && typeof univerAPI.addEvent === 'function') {
        try {
          const disposable = univerAPI.addEvent(
            univerAPI.Event.CommandExecuted,
            (command: any) => {
              // Filter out read-only commands (we only care about mutations)
              const readOnlyCommands = ['SetSelectionsOperation', 'ScrollOperation', 'SetZoomRatioOperation'];
              if (command && command.id && !readOnlyCommands.includes(command.id)) {
                trackDataChangeRef.current();
              }
            }
          );
          eventDisposableRef.current = disposable;
        } catch (error) {
          console.error('❌ [Univer] Failed to register event listener:', error);
        }
      } else {
        console.warn('⚠️ [Univer] Event API not available, auto-save disabled');
      }

      setUniverInitialized(true);

      // NO CLEANUP - Univer instance persists for the lifetime of the app
      // Disposing causes issues with React's rendering lifecycle
      // The instance will be garbage collected when the page is closed

    } catch (error: any) {
      console.error('❌ [Univer] Initialization error:', error);
      const msg = (error?.message || error?.toString?.() || 'Unknown error') as string;
      setInitError(msg);
      setUniverInitialized(true);
      initializingRef.current = false;
    }

    // Cleanup function
    return () => {
      // Cleanup event listener if exists
      if (eventDisposableRef.current && typeof eventDisposableRef.current.dispose === 'function') {
        eventDisposableRef.current.dispose();
        eventDisposableRef.current = null;
      }

      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures it runs only on mount.

  /**
   * Get current data from Univer
   */
  const getCurrentData = useCallback((): any[] => {
    if (univerAdapterRef.current?.isReady()) {
      return univerAdapterRef.current.getAllData();
    }
    return currentData;
  }, [currentData]);

  /**
   * Voice recognition functions
   */
  const startVoiceRecognition = useCallback(() => {
    // TODO: Implement voice recognition
    setIsListening(true);
  }, []);

  const stopVoiceRecognition = useCallback(() => {
    setIsListening(false);
  }, []);

  // Formula Dialog helper functions
  const columnLetter = (index: number) => String.fromCharCode(65 + index);
  
  const allColumns = useMemo(() => describeGrid(currentData).headers, [currentData]);

  const getDataRangeInfo = useCallback(() => {
    if (!currentData || currentData.length === 0) return null;

    const { headers, rowCount } = describeGrid(currentData);
    if (headers.length === 0 || rowCount === 0) return null;

    const dataStartRow = 2; // Row 1 is headers
    const lastRow = rowCount + 1;

    const columnRanges = headers.map((header, idx) => {
      const colLetter = columnLetter(idx);
      const range = `${colLetter}${dataStartRow}:${colLetter}${lastRow}`;
      return { range, dataCount: rowCount, hasData: rowCount > 0 };
    });

    const summary = `${rowCount} rows × ${headers.length} columns (${columnLetter(0)}${dataStartRow}:${columnLetter(headers.length - 1)}${lastRow})`;

    return { columnRanges, dataStartRow, lastRow, summary };
  }, [currentData]);

  // Formula Dialog handlers
  const handleFormulaCancel = useCallback(() => {
    setShowFormulaDialog(false);
    setFormulaInput('');
    setGeneratedFormula(null); setFormulaExplanation(null);
    setFormulaError(null);
    setSelectedColumns([]);
  }, []);

  const handleFormulaSubmit = useCallback(async () => {
    if (!formulaInput.trim() && selectedColumns.length === 0) {
      setFormulaError('Please enter a description or select columns');
      return;
    }

    setFormulaLoading(true);
    setFormulaError(null);

    try {
      // Build enhanced prompt with data context
      const dataRangeInfo = getDataRangeInfo();
      let prompt = formulaInput;

      // Add selected columns info
      if (selectedColumns.length > 0) {
        const columnsWithLetters = selectedColumns.map(col => {
          const idx = allColumns.indexOf(col);
          if (idx !== -1 && dataRangeInfo) {
            const rangeInfo = dataRangeInfo.columnRanges[idx];
            return `${col} (${columnLetter(idx)}, data range: ${rangeInfo.range})`;
          }
          return idx !== -1 ? `${col} (${columnLetter(idx)})` : col;
        });
        prompt += ` (columns: ${columnsWithLetters.join(', ')})`;
      }

      // Add data range context.
      //
      // Each line has to name the column, because the column name is the only
      // thing connecting the user's words ("revenue for the South region") to a
      // cell range. This previously recovered the name by taking the range
      // back apart -- "A2:A121" -> "A" -> allColumns.indexOf("A") -> -1 --
      // and every line came out as "@: A2:A121", leaving the model to guess
      // which column was which. It guessed wrong, and produced formulas that
      // pointed at the wrong columns while looking perfectly plausible.
      if (dataRangeInfo) {
        const columnDetails = dataRangeInfo.columnRanges
          .map((col, idx) => `${allColumns[idx]} (${columnLetter(idx)}): ${col.range} [${col.dataCount} data rows]`)
          .join('\n  - ');

        prompt += `\n\nIMPORTANT DATA CONTEXT:\n- ${dataRangeInfo.summary}\n- Column data ranges:\n  - ${columnDetails}\n- ALWAYS use specific ranges instead of entire columns\n- Header is in row 1, actual data starts from row ${dataRangeInfo.dataStartRow}\n- Do not include the header row in calculations`;
      }

      const fullPrompt = `Write a spreadsheet formula for: ${prompt} (for cell ${columnLetter(formulaCell.col)}${formulaCell.row + 1})`;

      const response = await fetch(API_ENDPOINTS.generateFormula, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.formula) {
        throw new Error(result.detail || 'Could not generate a formula. Try rewording it.');
      }

      setGeneratedFormula(result.formula);
      setFormulaExplanation(result.explanation || null);
    } catch (error) {
      console.error('Error generating formula:', error);
      setFormulaError(error instanceof Error ? error.message : 'Failed to generate formula');
    } finally {
      setFormulaLoading(false);
    }
  }, [formulaInput, selectedColumns, formulaCell, getDataRangeInfo, allColumns]);

  const handleFormulaRegenerate = useCallback(() => {
    setGeneratedFormula(null); setFormulaExplanation(null);
    handleFormulaSubmit();
  }, [handleFormulaSubmit]);

  const handleFormulaAccept = useCallback(() => {
    if (!generatedFormula || !univerAdapterRef.current?.isReady()) return;

    const success = univerAdapterRef.current.setFormula(
      formulaCell.row,
      formulaCell.col,
      generatedFormula
    );

    if (success) {
      handleFormulaCancel();
    } else {
      setFormulaError('Failed to insert formula');
    }
  }, [generatedFormula, formulaCell, handleFormulaCancel]);

  // Formula drag handlers
  const handleFormulaDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!formulaModalRef.current) return;
    
    const rect = formulaModalRef.current.getBoundingClientRect();
    const offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setFormulaDragOffset(offset);
    setIsDraggingFormula(true);
    
    if (!formulaDialogPos) {
      setFormulaDialogPos({
        left: rect.left,
        top: rect.top
      });
    }
  }, [formulaDialogPos]);

  const handleFormulaDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingFormula) return;
    
    setFormulaDialogPos({
      left: e.clientX - formulaDragOffset.x,
      top: e.clientY - formulaDragOffset.y
    });
  }, [isDraggingFormula, formulaDragOffset]);

  const handleFormulaDragEnd = useCallback(() => {
    setIsDraggingFormula(false);
  }, []);

  useEffect(() => {
    if (isDraggingFormula) {
      window.addEventListener('mousemove', handleFormulaDrag);
      window.addEventListener('mouseup', handleFormulaDragEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleFormulaDrag);
        window.removeEventListener('mouseup', handleFormulaDragEnd);
      };
    }
  }, [isDraggingFormula, handleFormulaDrag, handleFormulaDragEnd]);

  /**
   * Load data from file upload (CSV/Excel parsed as array)
   */
  const loadFileData = useCallback((fileData: any[][], clearExisting: boolean = true) => {
    if (!univerAdapterRef.current?.isReady()) {
      console.warn('[Univer] Adapter not ready, cannot load file data');
      return false;
    }

    const success = univerAdapterRef.current.loadData(fileData, clearExisting);
    
    if (success && onDataUpdate) {
      onDataUpdate(fileData);
    }
    
    return success;
  }, [onDataUpdate]);

  /**
   * Handle file input change - called by parent component (navbar)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;


    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        // Parse CSV
        if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').filter(line => line.trim());
          const data = lines.map(line => 
            line.split(',').map(cell => cell.trim())
          );
          
          const success = loadFileData(data, true);
          if (success) {
            alert(`File loaded: ${data.length} rows`);
          } else {
            console.error('[Univer] Failed to load data');
            alert('Failed to load file data');
          }
        }
        // Parse JSON
        else if (file.name.endsWith('.json')) {
          const jsonData = JSON.parse(content);
          if (Array.isArray(jsonData)) {
            const success = loadFileData(jsonData, true);
            if (success) {
              alert(`File loaded: ${jsonData.length} rows`);
            }
          } else {
            alert('JSON file must be an array of arrays');
          }
        } else {
          alert('Please upload a .csv or .json file');
        }
      } catch (error) {
        console.error('[Univer] Error loading file:', error);
        alert(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    event.target.value = '';
  }, [loadFileData]);

  // The onFileUpload prop from parent should be called with our handleFileInput
  // This allows the parent's file input (in navbar or ChatSidebar) to trigger our file loading
  // We simply use the passed onFileUpload handler - no need to intercept
  // The parent will call onFileUpload(event) and we handle it in handleFileInput

  /**
   * Handle AI commands via the adapter
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleCommand = useCallback(async (command: string) => {
    if (!univerAdapterRef.current) {
      console.warn('[Univer] Adapter not ready, cannot execute command');
      return { success: false, error: 'Adapter not initialized' };
    }


    // Pass to parent's onCommand handler if provided
    if (onCommand) {
      return await onCommand(command);
    }

    return { success: false, error: 'No command handler' };
  }, [onCommand]);

  /**
   * Save current state with change detection
   */
  const saveCurrentState = useCallback(async () => {
    if (!currentWorkspace?.id) {
      return false;
    }

    if (!univerAdapterRef.current?.isReady()) {
      return false;
    }

    try {
      setSaveStatus('saving');

      // Get current data and sheet state
      const extractedData = getCurrentData();
      const dataString = JSON.stringify(extractedData);

      // Get workbook snapshot for full fidelity
      let sheetState: any = undefined;
      let sheetString = '';
      try {
        if (univerAdapterRef.current && typeof univerAdapterRef.current.getWorkbookSnapshot === 'function') {
          sheetState = await univerAdapterRef.current.getWorkbookSnapshot();
          sheetString = JSON.stringify(sheetState);
        }
      } catch (error) {
        console.warn('[Univer] Failed to get workbook snapshot:', error);
      }

      // Only save if data OR sheet state has changed
      if (dataString === lastSavedDataRef.current && sheetString === lastSavedSheetRef.current) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        return true;
      }

      // Notify parent to save (parent will call saveWorkspaceData)
      if (onDataUpdate) {
        onDataUpdate(extractedData);
      }

      // Update refs
      lastSavedDataRef.current = dataString;
      lastSavedSheetRef.current = sheetString;
      setSaveStatus('saved');

      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);

      return true;
    } catch (error) {
      console.error('❌ [Univer] Save failed:', error);
      setSaveStatus('error');

      // Reset status after 4 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 4000);

      return false;
    }
  }, [getCurrentData, onDataUpdate, currentWorkspace?.id]);

  /**
   * Track data changes (triggers debounced save)
   */
  const trackDataChange = useCallback(() => {

    // Clear any existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 2 seconds
    saveTimeoutRef.current = setTimeout(() => {
      saveCurrentState();
    }, 2000);
  }, [saveCurrentState]);

  useEffect(() => {
    trackDataChangeRef.current = trackDataChange;
  }, [trackDataChange]);

  /**
   * Refresh data in Univer
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _refreshData = useCallback((newData: any[]) => {
    if (!univerAPIRef.current) {
      console.warn('⚠️ [Univer] Cannot refresh - API not initialized');
      return;
    }


    // For now, just update state
    // TODO: Update Univer workbook once API is stable
    setCurrentData(newData);
  }, []);

  // Effect for handling data prop changes from parent.
  //
  // currentData is not a mirror of the prop that could be derived during
  // render: the sheet writes to it too, whenever the user edits a cell. So a
  // new prop has to be pushed into Univer and into state together, and that
  // push is a call into a library outside React's knowledge -- which is what
  // the set-state-in-effect exemption below is for.
  useEffect(() => {
    if (univerInitialized && univerAdapterRef.current?.isReady()) {
      // Handle data cleared (empty array)
      if (!data || data.length === 0) {
        univerAdapterRef.current.clearSheet();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentData([]);
        setColumnOrder([]);
      }
      // Handle data loaded
      else {

        // Convert object array to 2D array if needed
        if (typeof data[0] === 'object' && !Array.isArray(data[0])) {
          const headers = Object.keys(data[0]);
          const rows = [headers, ...data.map(row => headers.map(key => row[key]))];
          univerAdapterRef.current.loadData(rows, true);
          setColumnOrder(headers);
        } else {
          univerAdapterRef.current.loadData(data, true);
        }

        setCurrentData(data);
      }
    }
  }, [data, univerInitialized]);

  // Listen for dataUpdate events from ChatSidebar and other components
  useEffect(() => {
    const handleDataUpdate = (event: CustomEvent) => {
      
      if (event.detail && event.detail.data) {
        const newData = event.detail.data;
        
        if (univerAdapterRef.current?.isReady()) {
          // Convert object array to 2D array if needed
          let dataToLoad = newData;
          if (typeof newData[0] === 'object' && !Array.isArray(newData[0])) {
            const headers = Object.keys(newData[0]);
            dataToLoad = [headers, ...newData.map((row: any) => headers.map(key => row[key]))];
          }
          
          univerAdapterRef.current.loadData(dataToLoad, true);
          setCurrentData(newData);
          
          // Notify parent of data update
          if (onDataUpdate) {
            onDataUpdate(newData);
          }
        }
      }
    };

    window.addEventListener('dataUpdate', handleDataUpdate as EventListener);
    
    return () => {
      window.removeEventListener('dataUpdate', handleDataUpdate as EventListener);
    };
  }, [currentData, univerInitialized, onDataUpdate]);

  // Listen for formulaAssistant event to open dialog
  useEffect(() => {
    const handleFormulaAssistantOpen = () => {

      // Get the current cell selection from Univer
      let currentCell = { row: 0, col: 0 }; // Default to A1
      if (univerAdapterRef.current?.isReady()) {
        const selection = univerAdapterRef.current.getCurrentSelection();
        if (selection) {
          currentCell = selection;
        }
      }

      setFormulaCell(currentCell);
      setFormulaDialogPos(null); // Center dialog
      setShowFormulaDialog(true);
      setFormulaInput('');
      setGeneratedFormula(null); setFormulaExplanation(null);
      setFormulaError(null);
      setSelectedColumns([]);
    };

    window.addEventListener('openFormulaAssistant', handleFormulaAssistantOpen);

    return () => {
      window.removeEventListener('openFormulaAssistant', handleFormulaAssistantOpen);
    };
  }, []);

  // Listen for addNewSheet event (from column extraction)
  useEffect(() => {
    const handleAddNewSheet = (event: CustomEvent) => {

      const { sheetData, sheetName } = event.detail;

      if (!univerAdapterRef.current?.isReady()) {
        console.error('[Univer] Cannot add sheet - adapter not ready');
        return;
      }

      try {
        // Convert backend sheet_data (celldata format) to 2D array
        if (sheetData && sheetData.celldata) {
          const celldata = sheetData.celldata;

          // Get dimensions
          const maxRow = Math.max(...celldata.map((cell: any) => cell.r)) + 1;
          const maxCol = Math.max(...celldata.map((cell: any) => cell.c)) + 1;

          // Initialize 2D array
          const dataArray: any[][] = [];
          for (let r = 0; r < maxRow; r++) {
            dataArray[r] = new Array(maxCol).fill('');
          }

          // Fill in the data from celldata
          celldata.forEach((cell: any) => {
            if (cell.v && cell.v.v !== undefined) {
              dataArray[cell.r][cell.c] = cell.v.v;
            }
          });


          // Add the sheet using UniverAdapter
          const success = univerAdapterRef.current.addSheet(sheetName, dataArray);

          if (success) {
          } else {
            console.error(`❌ [Univer] Failed to add sheet: ${sheetName}`);
            alert('Failed to create new sheet. Please try again.');
          }
        } else {
          console.error('[Univer] Invalid sheet data received');
        }
      } catch (error) {
        console.error('[Univer] Error adding new sheet:', error);
        alert(`Error creating new sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    window.addEventListener('addNewSheet', handleAddNewSheet as EventListener);

    return () => {
      window.removeEventListener('addNewSheet', handleAddNewSheet as EventListener);
    };
  }, []);

  return (
    <div className="h-full w-full relative bg-background">
      {/* Chat Sidebar */}
      {!hideSidebar && (
        <ChatSidebar
          isDataLoaded={!isDataEmpty}
          data={currentData}
          isExpanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          isListening={isListening}
          isProcessingCommand={isProcessingCommand}
          onStartVoiceRecognition={startVoiceRecognition}
          onStopVoiceRecognition={stopVoiceRecognition}
          onFileUpload={onFileUpload}
          filename={filename}
          isFromSavedWorkspace={isFromSavedWorkspace}
          univerAdapter={univerAdapter}
        />
      )}

      {/* Main Content */}
      <div
        className="h-full flex flex-col transition-all duration-300"
        style={{
          marginLeft: hideSidebar ? '0' : (sidebarExpanded ? '28rem' : '4rem')
        }}
      >
      {/* Save Status Indicator */}
      {saveStatus !== 'idle' && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-lg text-sm font-medium transition-all duration-300"
          style={{
            backgroundColor: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
            color: '#ffffff'
          }}
        >
          {saveStatus === 'saving' && (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              <span>Save failed</span>
            </>
          )}
        </div>
      )}

      {/* Univer Container */}
      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px'
        }}
      >
        {/* Dedicated container for Univer to prevent React DOM conflicts */}
        <div
          id="univer-container"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#ffffff',
            color: '#000000',
            display: univerInitialized && !initError ? 'block' : 'none'
          }}
        />

        {!univerInitialized ? (
          // Loading placeholder
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : initError ? (
          // Show initialization error
          <div className="flex items-center justify-center h-full m-4">
            <div className="max-w-xl w-full bg-card border border-border rounded-lg p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Univer failed to initialize</h3>
              <p className="text-sm text-muted-foreground mb-3">Reloading usually clears it.</p>
              <pre className="text-xs bg-muted text-muted-foreground p-3 rounded overflow-auto max-h-48 whitespace-pre-wrap">{initError}</pre>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      {/* Formula Assistant Dialog */}
      {showFormulaDialog && (
        <div
          ref={formulaModalRef}
          className="fixed z-[9999] bg-card border border-border rounded-2xl shadow-2xl p-8 min-w-[380px] max-w-[95vw] max-h-[90vh] overflow-y-auto font-sans text-foreground flex flex-col"
          style={{
            top: formulaDialogPos?.top && formulaDialogPos.top < window.innerHeight - 500 ? formulaDialogPos.top : '50%',
            left: formulaDialogPos?.left && formulaDialogPos.left < window.innerWidth - 500 ? formulaDialogPos.left : '50%',
            transform: formulaDialogPos ? 'none' : 'translate(-50%, -50%)',
            cursor: isDraggingFormula ? 'grabbing' : 'default',
          }}
        >
          {/* Close Button */}
          <button
            onClick={handleFormulaCancel}
            className="absolute top-[18px] right-6 bg-secondary/50 border border-border rounded-lg w-8 h-8 text-lg text-muted-foreground cursor-pointer font-bold z-[2] flex items-center justify-center transition-all duration-200 hover:bg-secondary/80 hover:text-foreground"
            aria-label="Close"
            type="button"
          >
            ×
          </button>
          <div className="mb-6 select-none">
            <div 
              className="text-2xl font-bold text-foreground mb-2 tracking-wide py-2 flex items-center gap-2"
              style={{ 
                cursor: isDraggingFormula ? 'grabbing' : 'grab',
              }}
              onMouseDown={handleFormulaDragStart}
            >
              <Calculator className="w-6 h-6" />
              Natural Language Formula
            </div>
            <div className="text-sm text-muted-foreground mb-[18px]">Describe your calculation or select columns to generate a spreadsheet formula.</div>
            
            {/* Data Context Info */}
            {currentData && currentData.length > 0 && (() => {
              const dataRangeInfo = getDataRangeInfo();
              return dataRangeInfo ? (
                <div className="bg-muted/60 border border-border rounded-md p-2.5 mb-[18px] text-xs leading-relaxed">
                  <div className="font-semibold text-primary mb-1 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Data Context
                  </div>
                  <div className="text-muted-foreground">
                    {dataRangeInfo.summary}<br/>
                    Formulas will use precise ranges instead of entire columns for better performance.
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Column selection with checkboxes */}
            <div className="mb-[18px]">
              <label className="font-semibold mb-1.5 block text-foreground text-sm">Select column(s):</label>
              <div className="flex flex-col gap-2 mb-1.5 max-h-[180px] overflow-y-auto bg-muted/50 rounded-md border border-border p-2.5">
                {allColumns.map((col, idx) => {
                  const checked = selectedColumns.includes(col);
                  const dataRangeInfo = getDataRangeInfo();
                  const columnRange = dataRangeInfo?.columnRanges[idx];
                  const rangeText = columnRange?.hasData 
                    ? `${columnRange.range} [${columnRange.dataCount} rows]`
                    : `${columnLetter(idx)}${dataRangeInfo?.dataStartRow || 2} [no data]`;
                  
                  return (
                    <label 
                      key={col} 
                      className={`flex flex-col gap-0.5 ${checked ? 'font-bold text-primary bg-primary/10' : 'font-medium text-muted-foreground'} rounded cursor-pointer p-1.5 transition-all duration-200`}
                    >
                      <div className="flex items-center gap-2">
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
                          className="w-4 h-4 accent-primary"
                          aria-label={`Select column ${col}`}
                        />
                        <span className="text-sm">{`${col} (${columnLetter(idx)})`}</span>
                      </div>
                      <div className={`text-xs ml-6 font-mono ${checked ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
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
              onChange={e => { setFormulaInput(e.target.value); setGeneratedFormula(null); setFormulaExplanation(null); setFormulaError(null); }}
              placeholder="e.g. sum all values above"
              className="w-full p-3 text-base rounded-md border border-border text-foreground bg-input mb-3 mt-0.5 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              autoFocus
              disabled={formulaLoading || !!generatedFormula}
            />
            {formulaError && <div className="text-destructive mb-2.5 font-medium">{formulaError}</div>}
            {formulaLoading && <div className="mb-2.5 text-muted-foreground">Generating formula...</div>}
                          {generatedFormula && !formulaLoading && (
                <>
                  <div className="mb-2 font-semibold text-foreground">Generated Formula:</div>
                  <input
                    type="text"
                    value={generatedFormula}
                    onChange={e => setGeneratedFormula(e.target.value)}
                    className="w-full p-2.5 text-sm rounded-md border border-border text-foreground bg-input mb-2 font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {/* What the formula does, in a sentence. A formula pasted into
                      a cell without explanation is something to be trusted or
                      not; with one it can be checked. */}
                  {formulaExplanation && (
                    <div className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
                      {formulaExplanation}
                    </div>
                  )}
                </>
              )}
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button 
              type="button" 
              onClick={handleFormulaCancel} 
              disabled={formulaLoading} 
              className="px-5 py-2.5 rounded-md border border-border bg-secondary text-secondary-foreground font-semibold text-sm shadow-sm transition-all duration-200 cursor-pointer hover:bg-secondary/80 disabled:opacity-50"
            >
              Cancel
            </button>
            {!generatedFormula && (
              <button 
                type="button" 
                onClick={handleFormulaSubmit} 
                disabled={formulaLoading || (!formulaInput.trim() && selectedColumns.length === 0)} 
                className="px-5 py-2.5 rounded-md border-none bg-primary text-primary-foreground font-bold text-sm shadow-lg transition-colors duration-200 cursor-pointer hover:bg-primary/90 disabled:opacity-50"
              >
                Generate
              </button>
            )}
            {generatedFormula && !formulaLoading && (
              <>
                <button 
                  type="button" 
                  onClick={handleFormulaRegenerate} 
                  disabled={formulaLoading || (!formulaInput.trim() && selectedColumns.length === 0)} 
                  className="px-5 py-2.5 rounded-md border border-border bg-background text-foreground font-bold text-sm shadow-lg transition-colors duration-200 cursor-pointer hover:bg-accent disabled:opacity-50"
                >
                  Regenerate
                </button>
                <button 
                  type="button" 
                  onClick={handleFormulaAccept} 
                  disabled={formulaLoading || !generatedFormula} 
                  className="px-5 py-2.5 rounded-md border-none bg-primary text-primary-foreground font-bold text-sm shadow-lg transition-colors duration-200 cursor-pointer hover:bg-primary/90 disabled:opacity-50"
                >
                  Accept
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

