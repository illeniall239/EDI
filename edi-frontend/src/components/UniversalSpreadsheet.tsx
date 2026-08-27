/**
 * UniversalSpreadsheet Component
 * 
 * The spreadsheet. Univer under the hood, wrapped in the file menu, the
 * and the auto-save the rest of the app talks to.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
// Registering a plugin gives the sheet the feature; importing its /facade is
// what puts the matching methods on the objects UniverAdapter holds. Without
// these two, range.setNote and worksheet.newDataValidationRule are undefined
// and every note or dropdown asked for in the chat fails at the last step.
import '@univerjs/sheets-note/facade';
import '@univerjs/sheets-data-validation/facade';
import '@univerjs/sheets-hyper-link/facade';
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

import { UniverConverter } from '@/utils/univerConverter';
import { UniverAdapter, createUniverAdapter } from '@/utils/univerAdapter';
import { rowsToRecords } from '@/utils/dataShape';
import ChatSidebar from '@/components/ChatSidebar';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface UniversalSpreadsheetProps {
  data?: Array<any>;
  onCommand?: (command: string) => Promise<any>;
  onDataUpdate?: (newData: Array<any>) => void;
  /** A Univer workbook snapshot to restore instead of rebuilding from rows.
   *  The parent only passes one that still matches the rows. */
  initialSnapshot?: unknown;
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

export default function UniversalSpreadsheet({
  data = [],
  onCommand,
  onDataUpdate,
  initialSnapshot,
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

  // Save state tracking
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // ChatSidebar state
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { currentWorkspace } = useWorkspace();

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


      // Restore the workbook the user left, or rebuild one from the rows.
      //
      // The snapshot is preferred because the rows do not carry any of the
      // formatting -- widths, number formats, colours -- and rebuilding from
      // them has been quietly discarding all of it. It is still only a
      // preference: a snapshot Univer refuses to open must not cost anyone
      // their spreadsheet, so a failure falls back to the rows, which is
      // exactly what happened before there was a snapshot to try.
      let created = false;
      if (initialSnapshot) {
        try {
          univerAPI.createWorkbook(initialSnapshot as any);
          created = true;
        } catch (error) {
          console.warn('[Univer] Snapshot would not open, rebuilding from rows:', error);
        }
      }
      if (!created) {
        univerAPI.createWorkbook(UniverConverter.arrayToUniver(initialSheets || data, columnOrder));
      }

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
  // Records out, always. The adapter hands back a 2-D array with the header
  // as row 0 while currentData holds records, and a function that returns
  // either depending on whether the sheet happens to be ready is a shape bug
  // waiting to reach state.
  const getCurrentData = useCallback((): any[] => {
    if (univerAdapterRef.current?.isReady()) {
      return rowsToRecords(univerAdapterRef.current.getAllData());
    }
    return currentData;
  }, [currentData]);

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
      onDataUpdate(rowsToRecords(fileData));
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

      // getAllData() reads a fixed window and trims it, and it has been seen
      // to come back empty on a sheet that plainly had rows. That was
      // harmless while this only called setData; now that it writes to the
      // store, an empty read would overwrite the workspace with nothing.
      // A sheet genuinely emptied goes through handleClearData, not here.
      if (!extractedData.length && lastSavedDataRef.current && lastSavedDataRef.current !== '[]') {
        console.warn('[Univer] Skipping save: the sheet read back empty but had data.');
        setSaveStatus('idle');
        return false;
      }

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

      // Recorded before the parent is told, not after. Telling the parent
      // sets state, which comes back down as a new `data` prop, and the
      // effect that watches that prop needs this ref already updated to
      // recognise the value as its own echo.
      lastSavedDataRef.current = dataString;
      lastSavedSheetRef.current = sheetString;

      // Notify parent to save (parent will call saveWorkspaceData)
      if (onDataUpdate) {
        onDataUpdate(extractedData);
      }
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
        // Not when the rows are the ones this sheet just handed upwards.
        //
        // Every edit runs autosave, autosave calls onDataUpdate, the parent
        // puts those rows in state, and they arrive back here as a new prop.
        // Reloading then rebuilds the grid out of values -- which is fine for
        // anything the values carry, and fatal for everything they do not.
        // Bold, fills, column widths and number formats were being applied
        // correctly and then wiped a second later by the echo of their own
        // save, which is why the commands looked like they did nothing while
        // sorting and formulas worked: those live in the values.
        const incoming = JSON.stringify(data);
        if (incoming === lastSavedDataRef.current) {
          return;
        }

        // And not when the grid already shows exactly these rows.
        //
        // That is the state on first load: the workbook has just been built
        // from the stored snapshot, which carries the formatting, and the
        // rows arrive immediately afterwards as a prop. They match what is on
        // screen, so reloading changes no value and costs every style the
        // snapshot just restored.
        try {
          if (incoming === JSON.stringify(getCurrentData())) {
            lastSavedDataRef.current = incoming;
            return;
          }
        } catch {
          // Unreadable grid: fall through and load, which is the safe way to
          // be wrong here.
        }

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
  }, [data, univerInitialized, getCurrentData]);

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

  return (
    <div className="h-full w-full relative bg-background">
      {/* Chat Sidebar */}
      {!hideSidebar && (
        <ChatSidebar
          isDataLoaded={!isDataEmpty}
          data={currentData}
          isExpanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
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

    </div>
  );
}

