// Spreadsheet Command Processor for Natural Language Operations
import { FlexiblePatternBuilder, extractPatternData } from './flexiblePatterns';

declare global {
  interface Window {
    luckysheet: any;
  }
}

export interface SpreadsheetCommand {
  action: string;
  params: any;
  target?: {
    type: 'cell' | 'column' | 'row' | 'range';
    identifier: string | number | { start: any; end: any };
  };
  success_message?: string;
}

export interface ColumnMapping {
  [key: string]: number; // column name -> index
}

export class SpreadsheetCommandProcessor {
  private columnMapping: ColumnMapping = {};
  private currentData: any[][] = [];

  constructor(data?: any[][], headers?: string[]) {
    if (data && headers) {
      this.updateData(data, headers);
    }
  }

  updateData(data: any[][], headers: string[]) {
    console.log('🔧 SpreadsheetCommandProcessor.updateData() called');
    console.log('📊 Input data shape:', data.length, 'rows x', data[0]?.length || 0, 'columns');
    console.log('📋 Input headers:', headers);
    
    this.currentData = data;
    this.columnMapping = {};
    
    // Build column name mapping
    headers.forEach((header, index) => {
      console.log(`🏷️ Processing header[${index}]: "${header}"`);
      
      if (header) {
        // Store multiple variations of the column name
        const cleanName = header.toLowerCase().trim();
        console.log(`   📝 Clean name: "${cleanName}" → index ${index}`);
        this.columnMapping[cleanName] = index;
        
        // Also store without spaces and special characters
        const simpleName = cleanName.replace(/[^a-z0-9]/g, '');
        if (simpleName !== cleanName) {
          console.log(`   🔤 Simple name: "${simpleName}" → index ${index}`);
          this.columnMapping[simpleName] = index;
        }
        
        // Store partial matches for common words
        const words = cleanName.split(/\s+/);
        if (words.length > 1) {
          console.log(`   📚 Words found:`, words);
          words.forEach(word => {
            if (word.length > 2) { // Only store meaningful words
              console.log(`     🔍 Word: "${word}" → index ${index}`);
              this.columnMapping[word] = index;
            }
          });
        }
      } else {
        console.log(`   ⚠️ Empty header at index ${index}`);
      }
    });
    
    console.log('🗺️ Final column mapping:', this.columnMapping);
  }

  // Fast pattern matching for common operations
  private quickPatternMatch(command: string): SpreadsheetCommand | null {
    console.log('⚡ quickPatternMatch() called with:', command);
    const lowerCommand = command.toLowerCase().trim();
    console.log('🔤 Lowercase command:', lowerCommand);
    
    // Undo/Redo operations
    if (/\b(undo|ctrl\s*z)\b/.test(lowerCommand)) {
      console.log('✅ Matched undo pattern');
      return {
        action: 'undo',
        params: {},
        success_message: '✅ Undone last action'
      };
    }
    
    if (/\b(redo|ctrl\s*y)\b/.test(lowerCommand)) {
      console.log('✅ Matched redo pattern');
      return {
        action: 'redo', 
        params: {},
        success_message: '✅ Redone last action'
      };
    }

    // FLEXIBLE Column Operations - handles both letter and name references with natural language
    const flexibleColumnPattern = FlexiblePatternBuilder.columnOperation();
    const columnFlexibleMatch = command.match(flexibleColumnPattern);
    if (columnFlexibleMatch) {
      console.log('✅ Matched FLEXIBLE column operation pattern:', columnFlexibleMatch);
      const extractedData = extractPatternData(command, 'columnOperation');
      
      if (extractedData && extractedData.column && extractedData.operation) {
        let colIndex: number | null = null;
        let targetColumn = '';
        
        // Determine column index - could be name or letter
        if (/^[A-Za-z]$/.test(extractedData.column)) {
          // Single letter column reference (A, B, C...)
          colIndex = this.columnLetterToIndex(extractedData.column.toUpperCase());
          targetColumn = extractedData.column.toUpperCase();
        } else {
          // Column name reference
          colIndex = this.findColumnByName(extractedData.column);
          targetColumn = extractedData.column;
        }
        
        if (colIndex !== null && colIndex >= 0) {
          // Determine the new width based on operation
          const isWidening = /wider|bigger|larger|broader|increase|expand|stretch/.test(extractedData.operation.toLowerCase());
          const newWidth = isWidening ? 200 : 100;
          const actionDescription = isWidening ? 'wider' : 'narrower';
          
          console.log(`📍 Column "${targetColumn}" → index ${colIndex}, making ${actionDescription}`);
          return {
            action: 'setColumnWidth',
            params: { [colIndex]: newWidth },
            target: { type: 'column' as const, identifier: colIndex },
            success_message: `✅ Column ${targetColumn} made ${actionDescription}`
          };
        }
      }
    }

    // Enhanced Row operations with natural language support
    const insertRowMatch = lowerCommand.match(/(?:add|insert|create)\s*(?:a\s*)?(?:new\s*)?(?:(\d+)\s*)?(?:rows?|lines?)(?:\s+(?:at|to|above|below|after|before)\s+(?:row\s*)?(\d+))?/);
    if (insertRowMatch) {
      console.log('✅ Matched insert row pattern:', insertRowMatch);
      const count = insertRowMatch[1] ? parseInt(insertRowMatch[1]) : 1;
      const position = insertRowMatch[2] ? parseInt(insertRowMatch[2]) - 1 : 1; // Default to row 1, convert to 0-based
      console.log(`📊 Inserting ${count} rows at position ${position}`);
      return {
        action: 'insertRow',
        params: [position, { number: count }],
        success_message: `✅ Added ${count} row${count > 1 ? 's' : ''} at row ${position + 1}`
      };
    }

    // Enhanced delete row patterns
    const deleteRowMatch = lowerCommand.match(/(?:delete|remove|clear)\s*(?:row\s*)?(\d+)(?:\s*(?:to|through|-)\s*(\d+))?/);
    if (deleteRowMatch) {
      console.log('✅ Matched delete row pattern:', deleteRowMatch);
      const startRow = parseInt(deleteRowMatch[1]) - 1; // Convert to 0-based
      const endRow = deleteRowMatch[2] ? parseInt(deleteRowMatch[2]) - 1 : startRow;
      console.log(`🗑️ Deleting rows ${deleteRowMatch[1]}${deleteRowMatch[2] ? ` to ${deleteRowMatch[2]}` : ''} (index ${startRow} to ${endRow})`);
      return {
        action: 'deleteRow',
        params: [startRow, endRow],
        success_message: `✅ Deleted row${startRow === endRow ? '' : 's'} ${startRow + 1}${startRow === endRow ? '' : ` to ${endRow + 1}`}`
      };
    }
    
    // Hide row patterns
    const hideRowMatch = lowerCommand.match(/(?:hide)\s*(?:row\s*)?(\d+)(?:\s*(?:to|through|-)\s*(\d+))?/);
    if (hideRowMatch) {
      console.log('✅ Matched hide row pattern:', hideRowMatch);
      const startRow = parseInt(hideRowMatch[1]) - 1; // Convert to 0-based
      const endRow = hideRowMatch[2] ? parseInt(hideRowMatch[2]) - 1 : startRow;
      console.log(`👁️‍🗨️ Hiding rows ${hideRowMatch[1]}${hideRowMatch[2] ? ` to ${hideRowMatch[2]}` : ''} (index ${startRow} to ${endRow})`);
      return {
        action: 'hideRow',
        params: [startRow, endRow],
        success_message: `✅ Hidden row${startRow === endRow ? '' : 's'} ${startRow + 1}${startRow === endRow ? '' : ` to ${endRow + 1}`}`
      };
    }
    
    // Show row patterns
    const showRowMatch = lowerCommand.match(/(?:show|unhide|display)\s*(?:row\s*)?(\d+)(?:\s*(?:to|through|-)\s*(\d+))?/);
    if (showRowMatch) {
      console.log('✅ Matched show row pattern:', showRowMatch);
      const startRow = parseInt(showRowMatch[1]) - 1; // Convert to 0-based
      const endRow = showRowMatch[2] ? parseInt(showRowMatch[2]) - 1 : startRow;
      console.log(`👁️ Showing rows ${showRowMatch[1]}${showRowMatch[2] ? ` to ${showRowMatch[2]}` : ''} (index ${startRow} to ${endRow})`);
      return {
        action: 'showRow',
        params: [startRow, endRow],
        success_message: `✅ Shown row${startRow === endRow ? '' : 's'} ${startRow + 1}${startRow === endRow ? '' : ` to ${endRow + 1}`}`
      };
    }

    // Column operations - Insert column
    const insertColumnMatch = lowerCommand.match(/(?:add|insert|create)\s*(?:a\s*)?(?:new\s*)?(?:(\d+)\s*)?(?:columns?|cols?)(?:\s+(?:at|to|before|after)\s+(?:column\s*)?([a-z]|\d+))?/);
    if (insertColumnMatch) {
      console.log('✅ Matched insert column pattern:', insertColumnMatch);
      const count = insertColumnMatch[1] ? parseInt(insertColumnMatch[1]) : 1;
      let position = 0; // Default to column A (index 0)
      
      if (insertColumnMatch[2]) {
        // Handle both letter (A, B, C) and number (1, 2, 3) references
        const positionRef = insertColumnMatch[2].toLowerCase();
        if (/^[a-z]$/.test(positionRef)) {
          position = positionRef.charCodeAt(0) - 97; // a=0, b=1, etc.
        } else {
          position = parseInt(positionRef) - 1; // Convert 1-based to 0-based
        }
      }
      
      console.log(`📊 Inserting ${count} columns at position ${position}`);
      return {
        action: 'insertColumn',
        params: [position, { number: count }],
        success_message: `✅ Added ${count} column${count > 1 ? 's' : ''} at position ${String.fromCharCode(65 + position)}`
      };
    }

    // Column operations - Delete column
    const deleteColumnMatch = lowerCommand.match(/(?:delete|remove|clear)\s*(?:column\s*)?([a-z]|\d+)(?:\s*(?:to|through|-)\s*([a-z]|\d+))?/);
    if (deleteColumnMatch) {
      console.log('✅ Matched delete column pattern:', deleteColumnMatch);
      
      // Parse start column
      let startCol = 0;
      const startRef = deleteColumnMatch[1].toLowerCase();
      if (/^[a-z]$/.test(startRef)) {
        startCol = startRef.charCodeAt(0) - 97; // a=0, b=1, etc.
      } else {
        startCol = parseInt(startRef) - 1; // Convert 1-based to 0-based
      }
      
      // Parse end column (if range specified)
      let endCol = startCol;
      if (deleteColumnMatch[2]) {
        const endRef = deleteColumnMatch[2].toLowerCase();
        if (/^[a-z]$/.test(endRef)) {
          endCol = endRef.charCodeAt(0) - 97;
        } else {
          endCol = parseInt(endRef) - 1;
        }
      }
      
      console.log(`🗑️ Deleting columns ${String.fromCharCode(65 + startCol)}${startCol === endCol ? '' : ` to ${String.fromCharCode(65 + endCol)}`} (index ${startCol} to ${endCol})`);
      return {
        action: 'deleteColumn',
        params: [startCol, endCol],
        success_message: `✅ Deleted column${startCol === endCol ? '' : 's'} ${String.fromCharCode(65 + startCol)}${startCol === endCol ? '' : ` to ${String.fromCharCode(65 + endCol)}`}`
      };
    }
    
    // Hide column patterns
    const hideColumnMatch = lowerCommand.match(/(?:hide)\s*(?:column\s*)?([a-z]|\d+)(?:\s*(?:to|through|-)\s*([a-z]|\d+))?/);
    if (hideColumnMatch) {
      console.log('✅ Matched hide column pattern:', hideColumnMatch);
      
      // Parse start column
      let startCol = 0;
      const startRef = hideColumnMatch[1].toLowerCase();
      if (/^[a-z]$/.test(startRef)) {
        startCol = startRef.charCodeAt(0) - 97; // a=0, b=1, etc.
      } else {
        startCol = parseInt(startRef) - 1; // Convert 1-based to 0-based
      }
      
      // Parse end column (if range specified)
      let endCol = startCol;
      if (hideColumnMatch[2]) {
        const endRef = hideColumnMatch[2].toLowerCase();
        if (/^[a-z]$/.test(endRef)) {
          endCol = endRef.charCodeAt(0) - 97;
        } else {
          endCol = parseInt(endRef) - 1;
        }
      }
      
      console.log(`👁️‍🗨️ Hiding columns ${String.fromCharCode(65 + startCol)}${startCol === endCol ? '' : ` to ${String.fromCharCode(65 + endCol)}`} (index ${startCol} to ${endCol})`);
      return {
        action: 'hideColumn',
        params: [startCol, endCol],
        success_message: `✅ Hidden column${startCol === endCol ? '' : 's'} ${String.fromCharCode(65 + startCol)}${startCol === endCol ? '' : ` to ${String.fromCharCode(65 + endCol)}`}`
      };
    }
    
    // Show column patterns
    const showColumnMatch = lowerCommand.match(/(?:show|unhide|display)\s*(?:column\s*)?([a-z]|\d+)(?:\s*(?:to|through|-)\s*([a-z]|\d+))?/);
    if (showColumnMatch) {
      console.log('✅ Matched show column pattern:', showColumnMatch);
      
      // Parse start column
      let startCol = 0;
      const startRef = showColumnMatch[1].toLowerCase();
      if (/^[a-z]$/.test(startRef)) {
        startCol = startRef.charCodeAt(0) - 97; // a=0, b=1, etc.
      } else {
        startCol = parseInt(startRef) - 1; // Convert 1-based to 0-based
      }
      
      // Parse end column (if range specified)
      let endCol = startCol;
      if (showColumnMatch[2]) {
        const endRef = showColumnMatch[2].toLowerCase();
        if (/^[a-z]$/.test(endRef)) {
          endCol = endRef.charCodeAt(0) - 97;
        } else {
          endCol = parseInt(endRef) - 1;
        }
      }
      
      console.log(`👁️ Showing columns ${String.fromCharCode(65 + startCol)}${startCol === endCol ? '' : ` to ${String.fromCharCode(65 + endCol)}`} (index ${startCol} to ${endCol})`);
      return {
        action: 'showColumn',
        params: [startCol, endCol],
        success_message: `✅ Shown column${startCol === endCol ? '' : 's'} ${String.fromCharCode(65 + startCol)}${startCol === endCol ? '' : ` to ${String.fromCharCode(65 + endCol)}`}`
      };
    }

    // Auto-fit columns
    if (/(?:auto\s*fit|autofit)\s*columns?/.test(lowerCommand)) {
      console.log('✅ Matched auto-fit columns pattern');
      return {
        action: 'autoFitColumns',
        params: {},
        success_message: '✅ Columns auto-fitted'
      };
    }

    // Freeze operations
    if (/freeze\s*(?:first\s*|top\s*)?row/.test(lowerCommand)) {
      console.log('✅ Matched freeze row pattern');
      return {
        action: 'setHorizontalFrozen',
        params: [false],
        success_message: '✅ First row frozen'
      };
    }

    // FLEXIBLE Sorting Operations - handles natural language variations
    // Examples: "sort by Name ascending", "order Price column Z-A", "arrange data by Date desc"
    const flexibleSortPattern = FlexiblePatternBuilder.sorting();
    const sortFlexibleMatch = command.match(flexibleSortPattern);
    if (sortFlexibleMatch) {
      console.log('✅ Matched FLEXIBLE sorting pattern:', sortFlexibleMatch);
      const extractedData = extractPatternData(command, 'sorting');
      
      if (extractedData && extractedData.column) {
        let colIndex: number | null = null;
        let targetColumn = '';
        
        // Determine column index - could be name or letter
        if (/^[A-Za-z]$/.test(extractedData.column)) {
          // Single letter column reference (A, B, C...)
          colIndex = this.columnLetterToIndex(extractedData.column.toUpperCase());
          targetColumn = extractedData.column.toUpperCase();
        } else {
          // Column name reference
          colIndex = this.findColumnByName(extractedData.column);
          targetColumn = extractedData.column;
        }
        
        if (colIndex !== null && colIndex >= 0 && this.currentData && this.currentData.length > 1) {
          // Determine sort direction
          const directionText = extractedData.direction || 'asc';
          const sortDir = /desc|z-?a|down|decreasing/.test(directionText.toLowerCase()) ? 'desc' : 'asc';
          const lastColIndex =
            this.currentData && this.currentData[0]
              ? Math.max(Object.keys(this.currentData[0]).length - 1, 0)
              : colIndex;
          const lastColLetter = indexToColumnLetter(lastColIndex);
          const lastRow1Based = this.currentData.length; // includes header
          const range = `A2:${lastColLetter}${lastRow1Based}`;

          const multiCommands: SpreadsheetCommand[] = [
            { action: 'setRangeShow', params: [range] },
            { action: 'setRangeSortMulti', params: [false, [{ i: colIndex, sort: sortDir }]] }
          ];

          console.log(`📍 Sorting column "${targetColumn}" (index ${colIndex}) ${sortDir === 'asc' ? 'A-Z' : 'Z-A'}`);
          return {
            action: 'multi',
            params: multiCommands,
            success_message: `✅ Sorted by ${targetColumn} ${sortDir === 'asc' ? 'A-Z' : 'Z-A'}`
          };
        }
      }
    }

    // Sort operations
    if (/sort\s*(?:data\s*)?(?:ascending|asc|a-z)/i.test(lowerCommand)) {
      console.log('✅ Matched sort ascending pattern');
      return {
        action: 'setRangeSort',
        params: ['asc'],
        success_message: '✅ Data sorted A-Z'
      };
    }

    if (/sort\s*(?:data\s*)?(?:descending|desc|z-a)/i.test(lowerCommand)) {
      console.log('✅ Matched sort descending pattern');
      return {
        action: 'setRangeSort',
        params: ['desc'],
        success_message: '✅ Data sorted Z-A'
      };
    }

    // =============================
    // Conditional Formatting (CF)
    // =============================
    // Helper to compute a column range excluding header
    const buildColumnRange = (colIndex: number): string | null => {
      if (colIndex < 0 || !this.currentData || this.currentData.length <= 1) return null;
      const lastRow1Based = this.currentData.length; // includes header in row 1
      const colLetter = indexToColumnLetter(colIndex);
      return `${colLetter}2:${colLetter}${lastRow1Based}`;
    };

    // Helper to compute full data range excluding header
    const buildFullDataRange = (): string | null => {
      if (!this.currentData || this.currentData.length <= 1) return null;
      const lastRow1Based = this.currentData.length;
      const lastColIndex =
        this.currentData && this.currentData[0]
          ? Math.max(Object.keys(this.currentData[0]).length - 1, 0)
          : 0;
      const lastColLetter = indexToColumnLetter(lastColIndex);
      return `A2:${lastColLetter}${lastRow1Based}`;
    };

    // FLEXIBLE CF: Universal conditional formatting pattern using flexible library
    // Handles both column names and letters with natural language variations
    const flexibleCfPattern = FlexiblePatternBuilder.conditionalFormatting();
    const cfFlexibleMatch = command.match(flexibleCfPattern);
    if (cfFlexibleMatch) {
      console.log('✅ Matched FLEXIBLE CF pattern:', cfFlexibleMatch);
      const extractedData = extractPatternData(command, 'conditionalFormatting');
      
      if (extractedData && extractedData.comparison && extractedData.value1 !== null) {
        let colIndex: number | null = null;
        let targetColumn = '';
        
        // Determine column index - could be name, letter, or unspecified (use all data)
        if (extractedData.column) {
          // Try as column letter first (A, B, C...)
          if (/^[A-Za-z]$/.test(extractedData.column)) {
            colIndex = this.columnLetterToIndex(extractedData.column.toUpperCase());
            targetColumn = extractedData.column.toUpperCase();
          } else {
            // Try as column name
            colIndex = this.findColumnByName(extractedData.column);
            targetColumn = extractedData.column;
          }
        }
        
        // Build range - use specific column or full data range
        let range: string | null;
        if (colIndex !== null && colIndex >= 0) {
          range = buildColumnRange(colIndex);
          targetColumn = targetColumn || indexToColumnLetter(colIndex);
        } else {
          // Apply to full data range if no specific column
          range = buildFullDataRange();
          targetColumn = 'all data';
        }
        
        if (!range) return null;
        
        // Use manual highlight instead of problematic setRangeConditionalFormatDefault API
        const comparisonLower = extractedData.comparison.toLowerCase();
        let command = '';
        let description = '';
        let condition = '';
        let values = [extractedData.value1];
        
        if (/less|below|under|smaller|fewer|</.test(comparisonLower)) {
          command = `highlight less than ${extractedData.value1} in column ${targetColumn}`;
          description = `Highlight cells with values less than ${extractedData.value1}`;
          condition = 'lessThan';
        } else if (/equal|is|matches|same|=/.test(comparisonLower)) {
          command = `highlight equal to ${extractedData.value1} in column ${targetColumn}`;
          description = `Highlight cells with values equal to ${extractedData.value1}`;
          condition = 'equal';
        } else if (/between/.test(comparisonLower) && extractedData.value2 !== null) {
          command = `highlight between ${extractedData.value1} and ${extractedData.value2} in column ${targetColumn}`;
          description = `Highlight cells with values between ${extractedData.value1} and ${extractedData.value2}`;
          condition = 'betweenness';
          values = [extractedData.value1, extractedData.value2];
        } else if (/greater|above|over|more|bigger|larger|>/.test(comparisonLower)) {
          command = `highlight greater than ${extractedData.value1} in column ${targetColumn}`;
          description = `Highlight cells with values greater than ${extractedData.value1}`;
          condition = 'greaterThan';
        } else {
          // Default to greater than
          command = `highlight greater than ${extractedData.value1} in column ${targetColumn}`;
          description = `Highlight cells with values greater than ${extractedData.value1}`;
          condition = 'greaterThan';
        }
        
        return {
          action: 'manual_highlight',
          params: {
            command,
            description,
            column: targetColumn,
            condition,
            values
          },
          success_message: `✅ ${description}`
        };
      }
    }

    // CF: text contains/equal in a named column (e.g., highlight Name column equal to "Valve")
    const cfContainsByName = lowerCommand.match(/(?:conditional\s*format|highlight)\s+(?:the\s+)?(.+?)\s+column\s+(?:containing|contains|contain|equal(?:s)?\s+to|equal)\s+("[^"]+"|'[^']+'|[^\s]+)/i);
    if (cfContainsByName) {
      console.log('✅ Matched CF contains by NAME pattern:', cfContainsByName);
      const colName = cfContainsByName[1].trim();
      let value = cfContainsByName[2].trim();
      value = value.replace(/^['"]|['"]$/g, '');
      const colIndex = this.findColumnByName(colName);
      if (colIndex !== null && colIndex >= 0) {
        const range = buildColumnRange(colIndex);
        if (!range) return null;
        const multiCommands: SpreadsheetCommand[] = [
          { action: 'setRangeShow', params: [range] },
          { action: 'setRangeConditionalFormatDefault', params: ['textContains', { type: 'value', content: [value] }, { cellrange: range, matchMode: 'exact' }] }
        ];
        return {
          action: 'multi',
          params: multiCommands,
          success_message: `✅ Highlighted ${indexToColumnLetter(colIndex)} cells containing "${value}"`
        };
      }
    }

    // Flexible phrasing: highlight/color/mark/shade VALUE in <column name> column (substring by default, exact if equality words present)
    const genericValueInNamedColumn = command.match(/(?:highlight|color|mark|shade)\s+(?:all\s+)?(?:cells|values)?(?:\s+that\s+)?(?:(are|is|equal(?:s)?\s*to|=|contain(?:s)?)\s+)?(\"[^\"]+\"|'[^']+'|[^\s]+)\s+(?:in|on|within)\s+(?:the\s+)?(.+?)\s+column\s*$/i);
    if (genericValueInNamedColumn) {
      const value = (genericValueInNamedColumn[2] || '').trim().replace(/^['"]|['"]$/g, '');
      const colName = (genericValueInNamedColumn[3] || '').trim();
      const op = (genericValueInNamedColumn[1] || '').toLowerCase();
      const colIndex = this.findColumnByName(colName);
      if (colIndex !== null && colIndex >= 0) {
        const range = buildColumnRange(colIndex);
        if (!range) return null;
        const useExact = /^(are|is|equal|=|equals)/.test(op);
        const multiCommands: SpreadsheetCommand[] = [
          { action: 'setRangeShow', params: [range] },
          { action: 'setRangeConditionalFormatDefault', params: ['textContains', { type: 'value', content: [value] }, { cellrange: range, matchMode: useExact ? 'exact' : 'contains' }] }
        ];
        return {
          action: 'multi',
          params: multiCommands,
          success_message: `✅ Highlighted ${indexToColumnLetter(colIndex)} cells ${useExact ? 'equal to' : 'containing'} "${value}"`
        };
      }
    }

    // Flexible phrasing: highlight/color/mark/shade VALUE in column <letter>
    const genericValueInLetterColumn = command.match(/(?:highlight|color|mark|shade)\s+(?:all\s+)?(?:cells|values)?(?:\s+that\s+)?(?:(are|is|equal(?:s)?\s*to|=|contain(?:s)?)\s+)?(\"[^\"]+\"|'[^']+'|[^\s]+)\s+(?:in|on|within)\s+(?:the\s+)?(?:column\s+)?([A-Za-z])\b/i);
    if (genericValueInLetterColumn) {
      const value = (genericValueInLetterColumn[2] || '').trim().replace(/^['"]|['"]$/g, '');
      const letter = (genericValueInLetterColumn[3] || '').toUpperCase();
      const op = (genericValueInLetterColumn[1] || '').toLowerCase();
      const colIndex = this.columnLetterToIndex(letter);
      if (colIndex >= 0) {
        const range = buildColumnRange(colIndex);
        if (!range) return null;
        const useExact = /^(are|is|equal|=|equals)/.test(op);
        const multiCommands: SpreadsheetCommand[] = [
          { action: 'setRangeShow', params: [range] },
          { action: 'setRangeConditionalFormatDefault', params: ['textContains', { type: 'value', content: [value] }, { cellrange: range, matchMode: useExact ? 'exact' : 'contains' }] }
        ];
        return {
          action: 'multi',
          params: multiCommands,
          success_message: `✅ Highlighted ${letter} cells ${useExact ? 'equal to' : 'containing'} "${value}"`
        };
      }
    }
    // CF: phrase "highlight all values that are X in <column> column" → substring match in specified column
    const cfValuesInColumn = lowerCommand.match(/highlight\s+all\s+values\s+that\s+are\s+("[^"]+"|'[^']+'|[^\s]+)\s+in\s+(?:the\s+)?(.+?)\s+column/i);
    if (cfValuesInColumn) {
      console.log('✅ Matched CF values-in-column pattern:', cfValuesInColumn);
      const value = cfValuesInColumn[1].trim().replace(/^['"]|['"]$/g, '');
      const colName = cfValuesInColumn[2].trim();
      const colIndex = this.findColumnByName(colName);
      if (colIndex !== null && colIndex >= 0) {
        const range = buildColumnRange(colIndex);
        if (!range) return null;
        const multiCommands: SpreadsheetCommand[] = [
          { action: 'setRangeShow', params: [range] },
          // Use contains for this phrasing
          { action: 'setRangeConditionalFormatDefault', params: ['textContains', { type: 'value', content: [value] }, { cellrange: range, matchMode: 'contains' }] }
        ];
        return {
          action: 'multi',
          params: multiCommands,
          success_message: `✅ Highlighted ${indexToColumnLetter(colIndex)} cells containing "${value}"`
        };
      }
    }

    // CF: highlight all duplicates (entire dataset)
    const cfAllDuplicates = lowerCommand.match(/(?:conditional\s*format|highlight)\s+(?:all\s+)?(?:the\s+)?duplicates?\b/i);
    if (cfAllDuplicates) {
      console.log('✅ Matched CF highlight ALL duplicates pattern:', cfAllDuplicates);
      
      // Apply duplicate highlighting to full data range
      const range = buildFullDataRange();
      if (!range) return null;
      
      const multiCommands: SpreadsheetCommand[] = [
        { action: 'setRangeShow', params: [range] },
        { action: 'setRangeConditionalFormatDefault', params: ['duplicateValue', { type: 'value', content: ['0'] }, { cellrange: range }] }
      ];
      
      return {
        action: 'multi',
        params: multiCommands,
        success_message: `✅ Highlighted all duplicate values in the dataset`
      };
    }

    // CF: duplicates/unique in a column
    // Using manual highlight instead of problematic setRangeConditionalFormatDefault API
    const cfDupName = lowerCommand.match(/(?:conditional\s*format|highlight)\s+(duplicates?|repeats?|unique)\s+(?:in|on|for)\s+(?:the\s+)?(.+?)\s+column/i);
    if (cfDupName) {
      console.log('✅ Matched CF duplicate/unique by NAME pattern:', cfDupName);
      const kind = cfDupName[1];
      const colName = cfDupName[2].trim();
      const colIndex = this.findColumnByName(colName);
      if (colIndex !== null && colIndex >= 0) {
        const colLetter = indexToColumnLetter(colIndex);
        const isUnique = /unique/i.test(kind);
        
        const command = isUnique ? `highlight unique in column ${colLetter}` : `highlight duplicates in column ${colLetter}`;
        const description = isUnique ? `Highlight unique values in column ${colLetter}` : `Highlight duplicate values in column ${colLetter}`;
        
        return {
          action: 'manual_highlight',
          params: {
            command,
            description,
            column: colLetter,
            condition: isUnique ? 'unique' : 'duplicates'
          },
          success_message: isUnique ? `✅ Highlighted unique values in ${colLetter}` : `✅ Highlighted duplicates in ${colLetter}`
        };
      }
    }

    // CF: top/bottom N or percent in a column
    const cfTopBottom = lowerCommand.match(/(?:conditional\s*format|highlight)\s+(top|bottom)\s+(\d+)(\s*%|\s*percent)?\s+(?:in|on|for)\s+(?:the\s+)?(.+?)\s+column/i);
    if (cfTopBottom) {
      console.log('✅ Matched CF top/bottom pattern:', cfTopBottom);
      const which = cfTopBottom[1].toLowerCase();
      const num = parseInt(cfTopBottom[2]);
      const isPercent = !!cfTopBottom[3];
      const colName = cfTopBottom[4].trim();
      const colIndex = this.findColumnByName(colName);
      if (colIndex !== null && colIndex >= 0) {
        const range = buildColumnRange(colIndex);
        if (!range) return null;
        const conditionName = which === 'top' ? (isPercent ? 'topPercent' : 'top') : (isPercent ? 'lastPercent' : 'last');
      const multiCommands: SpreadsheetCommand[] = [
        { action: 'setRangeShow', params: [range] },
        { action: 'setRangeConditionalFormatDefault', params: [conditionName, { type: 'value', content: [num] }, { cellrange: range }] }
      ];
        return {
          action: 'multi',
          params: multiCommands,
          success_message: `✅ Highlighted ${which} ${num}${isPercent ? '%' : ''} in ${indexToColumnLetter(colIndex)}`
        };
      }
    }

    // CF: above/below average in a column
    const cfAverage = lowerCommand.match(/(?:conditional\s*format|highlight)\s+(above\s+average|below\s+average)\s+(?:in|on|for)\s+(?:the\s+)?(.+?)\s+column/i);
    if (cfAverage) {
      console.log('✅ Matched CF average pattern:', cfAverage);
      const which = cfAverage[1].toLowerCase();
      const colName = cfAverage[2].trim();
      const colIndex = this.findColumnByName(colName);
      if (colIndex !== null && colIndex >= 0) {
        const range = buildColumnRange(colIndex);
        if (!range) return null;
        const conditionName = which.includes('above') ? 'AboveAverage' : 'SubAverage';
      const multiCommands: SpreadsheetCommand[] = [
        { action: 'setRangeShow', params: [range] },
        // Pass explicit empty content array within object for compatibility
        { action: 'setRangeConditionalFormatDefault', params: [conditionName, { type: 'value', content: [] }, { cellrange: range }] }
      ];
        return {
          action: 'multi',
          params: multiCommands,
          success_message: `✅ Highlighted ${which} in ${indexToColumnLetter(colIndex)}`
        };
      }
    }

    // CF: color scale / data bars / icon set on a column or full table
    const cfVisual = lowerCommand.match(/(?:apply|add|use|set)\s+(?:a\s+)?(color\s*(?:scale|gradation)|data\s*bars?|icon\s*set|icons?)\s+(?:to|on|for)\s+(?:the\s+)?(?:(.+?)\s+column|entire\s*(?:table|sheet|range)|all\s*cells?)/i);
    if (cfVisual) {
      console.log('✅ Matched CF visual pattern:', cfVisual);
      const typeToken = cfVisual[1].toLowerCase();
      const targetColName = cfVisual[2]?.trim();
      let cfType: 'dataBar' | 'icons' | 'colorGradation' = 'dataBar';
      if (/color/.test(typeToken)) cfType = 'colorGradation';
      else if (/icon/.test(typeToken) || /icons/.test(typeToken)) cfType = 'icons';
      else cfType = 'dataBar';

      let range: string | null = null;
      if (targetColName && targetColName.length > 0) {
        const colIndex = this.findColumnByName(targetColName);
        if (colIndex !== null && colIndex >= 0) range = buildColumnRange(colIndex);
      } else {
        range = buildFullDataRange();
      }
      if (!range) return null;

      const multiCommands: SpreadsheetCommand[] = [
        { action: 'setRangeShow', params: [range] },
        { action: 'setRangeConditionalFormat', params: [cfType, { format: cfType === 'dataBar' ? ["#63c384", "#ffffff"] : undefined }] }
      ];

      return {
        action: 'multi',
        params: multiCommands,
        success_message: `✅ Applied ${cfType} conditional format to ${targetColName ? targetColName + ' column' : 'selected range'}`
      };
    }

    console.log('❌ No quick pattern matched');
    return null;
  }

  // Find column by semantic name
  private findColumnByName(columnName: string): number | null {
    console.log('🔍 findColumnByName() called with:', columnName);
    const searchName = columnName.toLowerCase().trim();
    console.log('🔤 Search name (cleaned):', searchName);
    console.log('🗺️ Available column mappings:', Object.keys(this.columnMapping));
    
    // Direct match
    if (this.columnMapping[searchName] !== undefined) {
      const index = this.columnMapping[searchName];
      console.log(`✅ Direct match found: "${searchName}" → index ${index}`);
      return index;
    }
    
    // Partial match
    console.log('🔍 Trying partial matches...');
    for (const [name, index] of Object.entries(this.columnMapping)) {
      console.log(`   🔍 Checking "${name}" (index ${index}) against "${searchName}"`);
      if (name.includes(searchName)) {
        console.log(`   ✅ Partial match (name contains search): "${name}" contains "${searchName}" → index ${index}`);
        return index;
      }
      if (searchName.includes(name)) {
        console.log(`   ✅ Partial match (search contains name): "${searchName}" contains "${name}" → index ${index}`);
        return index;
      }
    }
    
    console.log('❌ No column found for:', searchName);
    return null;
  }

  // Process semantic column operations
  private processSemanticColumnCommand(command: string): SpreadsheetCommand | null {
    console.log('🧠 processSemanticColumnCommand() called with:', command);
    const lowerCommand = command.toLowerCase();
    console.log('🔤 Lowercase command:', lowerCommand);
    
    // Extract column name and action
    const patterns = [
      /(?:make|set)\s+(?:the\s+)?(.+?)\s+column\s+(wider|narrower|bigger|smaller)/,
      /(?:make|set)\s+(.+?)\s+(wider|narrower|bigger|smaller)/,
      /(?:widen|expand|increase)\s+(?:the\s+)?(.+?)\s+column/,
      /(?:narrow|shrink|decrease)\s+(?:the\s+)?(.+?)\s+column/
    ];

    console.log('🔍 Testing patterns against command...');
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      console.log(`   Pattern ${i + 1}: ${pattern.source}`);
      const match = lowerCommand.match(pattern);
      
      if (match) {
        console.log(`   ✅ Pattern ${i + 1} matched:`, match);
        const columnName = match[1];
        const action = match[2] || (pattern.source.includes('widen|expand') ? 'wider' : 'narrower');
        
        console.log(`   📝 Extracted column name: "${columnName}"`);
        console.log(`   📝 Extracted action: "${action}"`);
        
        const columnIndex = this.findColumnByName(columnName);
        console.log(`   📍 Column index result: ${columnIndex}`);
        
        if (columnIndex !== null) {
          const newWidth = action.includes('wider') || action.includes('bigger') || 
                          action.includes('widen') || action.includes('expand') ? 200 : 100;
          
          console.log(`   📏 New width will be: ${newWidth}`);
          
          const command = {
            action: 'setColumnWidth',
            params: { [columnIndex]: newWidth },
            target: { type: 'column' as const, identifier: columnIndex },
            success_message: `✅ ${columnName} column made ${action.includes('wider') || action.includes('bigger') ? 'wider' : 'narrower'}`
          };
          
          console.log('   🎯 Generated command:', command);
          return command;
        } else {
          console.log(`   ❌ Column "${columnName}" not found in mapping`);
        }
      } else {
        console.log(`   ❌ Pattern ${i + 1} did not match`);
      }
    }

    console.log('❌ No semantic column pattern matched');
    return null;
  }

  // Main processing function
  async processCommand(command: string): Promise<SpreadsheetCommand | null> {
    console.log('🎯 SpreadsheetCommandProcessor.processCommand() called');
    console.log('📝 Input command:', command);
    
    if (!command.trim()) {
      console.log('❌ Empty command, returning null');
      return null;
    }

    // Step 1: Try quick pattern matching (fast path)
    console.log('🚀 Step 1: Trying quick pattern matching...');
    const quickResult = this.quickPatternMatch(command);
    if (quickResult) {
      console.log('✅ Quick pattern matched, returning:', quickResult);
      return quickResult;
    }

    // Step 2: Try semantic column operations
    console.log('🚀 Step 2: Trying semantic column operations...');
    const semanticResult = this.processSemanticColumnCommand(command);
    if (semanticResult) {
      console.log('✅ Semantic pattern matched, returning:', semanticResult);
      return semanticResult;
    }

    // Step 3: Try LLM-based command processing
    console.log('🚀 Step 3: Trying LLM-based command processing...');
    const llmResult = await this.processLLMCommand(command);
    if (llmResult) {
      console.log('✅ LLM-based processing succeeded, returning:', llmResult);
      return llmResult;
    }

    // Step 4: Return null for backend processing
    console.log('🚀 Step 4: No local processing possible, returning null for backend');
    return null;
  }

  // Process commands using LLM
  async processLLMCommand(command: string): Promise<SpreadsheetCommand | null> {
    console.log('🧠 processLLMCommand() called with:', command);
    
    // --- Custom formula logic for sum/average/min/max with column name awareness ---
    const formulaOps = [
      { op: 'sum', regex: /sum (all )?(values )?(in|of|from)? ?([\w\s]+)? ?column/i, fn: 'SUM' },
      { op: 'average', regex: /average (all )?(values )?(in|of|from)? ?([\w\s]+)? ?column/i, fn: 'AVERAGE' },
      { op: 'min', regex: /min(imum)? (value)?( in| of| from)? ?([\w\s]+)? ?column/i, fn: 'MIN' },
      { op: 'max', regex: /max(imum)? (value)?( in| of| from)? ?([\w\s]+)? ?column/i, fn: 'MAX' },
    ];
    for (const { op: _op, regex, fn } of formulaOps) {
      void _op;
      const match = command.match(regex);
      if (match) {
        let colName = match[4]?.trim();
        if (colName) {
          colName = colName.replace(/ column$/i, '').trim();
          const colIndex = this.findColumnByName(colName);
          if (colIndex !== null && this.currentData.length > 1) {
            const colLetter = indexToColumnLetter(colIndex);
            let lastRow = 1;
            for (let r = this.currentData.length - 1; r >= 1; r--) {
              if (
                this.currentData[r] &&
                this.currentData[r][colIndex] !== undefined &&
                this.currentData[r][colIndex] !== null &&
                this.currentData[r][colIndex] !== ''
              ) {
                lastRow = r;
                break;
              }
            }
            const formula = `=${fn}(${colLetter}2:${colLetter}${lastRow + 1})`;
            return {
              action: 'setCellValue',
              params: { formula, column: colIndex },
              target: { type: 'column', identifier: colIndex },
              success_message: `✅ Inserted formula: ${formula}`
            };
          }
        }
      }
    }

    // --- COUNTIF pattern matching ---
    // e.g. count the occurrence of Good in the Review column
    const countifRegex = /count (the )?(occurrences?|number) of ([^\s]+|"[^"]+"|'[^']+') (in|from|of) ([\w\s]+) column/i;
    const countifMatch = command.match(countifRegex);
    if (countifMatch) {
      let value = countifMatch[3];
      value = value.replace(/^['"]|['"]$/g, ''); // Remove quotes
      let colName = countifMatch[5]?.trim();
      if (colName) {
        colName = colName.replace(/ column$/i, '').trim();
        const colIndex = this.findColumnByName(colName);
        if (colIndex !== null && this.currentData.length > 1) {
          const colLetter = indexToColumnLetter(colIndex);
          let lastRow = 1;
          for (let r = this.currentData.length - 1; r >= 1; r--) {
            if (
              this.currentData[r] &&
              this.currentData[r][colIndex] !== undefined &&
              this.currentData[r][colIndex] !== null &&
              this.currentData[r][colIndex] !== ''
            ) {
              lastRow = r;
              break;
            }
          }
          const range = `${colLetter}2:${colLetter}${lastRow + 1}`;
          const formula = `=COUNTIF(${range}, "${value}")`;
          return {
            action: 'setCellValue',
            params: { formula, column: colIndex },
            target: { type: 'column', identifier: colIndex },
            success_message: `✅ Inserted formula: ${formula}`
          };
        }
      }
    }

    // --- SUMIF pattern matching ---
    // e.g. sum values in Amount column where Status is Paid
    const sumifRegex = /sum (all )?(values )?(in|of|from)? ?([\w\s]+)? ?column where ([\w\s]+) (is|=|equals?) ([^\s]+|"[^"]+"|'[^']+')/i;
    const sumifMatch = command.match(sumifRegex);
    if (sumifMatch) {
      let sumColName = sumifMatch[4]?.trim();
      let critColName = sumifMatch[5]?.trim();
      let critValue = sumifMatch[7];
      critValue = critValue.replace(/^['"]|['"]$/g, '');
      if (sumColName && critColName) {
        sumColName = sumColName.replace(/ column$/i, '').trim();
        critColName = critColName.replace(/ column$/i, '').trim();
        const sumColIndex = this.findColumnByName(sumColName);
        const critColIndex = this.findColumnByName(critColName);
        if (sumColIndex !== null && critColIndex !== null && this.currentData.length > 1) {
          const sumColLetter = indexToColumnLetter(sumColIndex);
          const critColLetter = indexToColumnLetter(critColIndex);
          let lastRow = 1;
          for (let r = this.currentData.length - 1; r >= 1; r--) {
            if (
              this.currentData[r] &&
              (this.currentData[r][sumColIndex] !== undefined || this.currentData[r][critColIndex] !== undefined)
            ) {
              lastRow = r;
              break;
            }
          }
          const sumRange = `${sumColLetter}2:${sumColLetter}${lastRow + 1}`;
          const critRange = `${critColLetter}2:${critColLetter}${lastRow + 1}`;
          const formula = `=SUMIF(${critRange}, "${critValue}", ${sumRange})`;
          return {
            action: 'setCellValue',
            params: { formula, column: sumColIndex },
            target: { type: 'column', identifier: sumColIndex },
            success_message: `✅ Inserted formula: ${formula}`
          };
        }
      }
    }

    // --- VLOOKUP pattern matching ---
    // e.g. vlookup the name in A2 from the table in D:F
    const vlookupRegex = /vlookup (the )?([\w\s]+) in ([a-zA-Z]+\d+) from the table in ([a-zA-Z]+):([a-zA-Z]+)/i;
    const vlookupMatch = command.match(vlookupRegex);
    if (vlookupMatch) {
      const lookupValueCell = vlookupMatch[3];
      const tableStart = vlookupMatch[4];
      const tableEnd = vlookupMatch[5];
      // For simplicity, assume return column is the last column in the range
      const colStartIdx = this.columnLetterToIndex(tableStart);
      const colEndIdx = this.columnLetterToIndex(tableEnd);
      if (colStartIdx !== -1 && colEndIdx !== -1 && this.currentData.length > 1) {
        const tableRange = `${tableStart}2:${tableEnd}${this.currentData.length}`;
        const returnCol = colEndIdx - colStartIdx + 1;
        const formula = `=VLOOKUP(${lookupValueCell}, ${tableRange}, ${returnCol}, FALSE)`;
        return {
          action: 'setCellValue',
          params: { formula, column: colStartIdx },
          target: { type: 'column', identifier: colStartIdx },
          success_message: `✅ Inserted formula: ${formula}`
        };
      }
    }

    // --- Text Extraction Pattern Matching ---
    // e.g. extract first word from column, get first part, split by delimiter
    const textExtractionRegex = /(?:extract|get)(?:\s+(?:the|first))?\s+(?:first\s+)?(?:word|part|element)(?:\s+from)?(?:\s+(?:the|column|in))?\s+([\w\s]+)(?:\s+column)?/i;
    const textExtractionMatch = command.match(textExtractionRegex);
    if (textExtractionMatch) {
      let colName = textExtractionMatch[1]?.trim();
      if (colName) {
        colName = colName.replace(/ column$/i, '').trim();
        const colIndex = this.findColumnByName(colName);
        if (colIndex !== null && this.currentData.length > 1) {
          const colLetter = indexToColumnLetter(colIndex);
          
          // Analyze sample data to detect delimiter
          const sampleData: string[] = [];
          for (let r = 1; r < Math.min(this.currentData.length, 6); r++) {
            if (this.currentData[r] && this.currentData[r][colIndex] && 
                typeof this.currentData[r][colIndex] === 'string') {
              sampleData.push(this.currentData[r][colIndex]);
            }
          }
          
          // Detect most common delimiter
          const commonDelimiters = [' ', ':', ',', ';', '|', '-', '_', '/', '\\'];
          const delimiterCounts: {[key: string]: number} = {};
          
          sampleData.forEach(sample => {
            commonDelimiters.forEach(delimiter => {
              if (sample.includes(delimiter)) {
                delimiterCounts[delimiter] = (delimiterCounts[delimiter] || 0) + 1;
              }
            });
          });
          
          let mostCommonDelimiter = ' '; // default
          let maxCount = 0;
          Object.entries(delimiterCounts).forEach(([delimiter, count]) => {
            if (count > maxCount) {
              maxCount = count;
              mostCommonDelimiter = delimiter;
            }
          });
          
          console.log('🔍 Text extraction analysis:', {
            colName,
            sampleData: sampleData.slice(0, 3),
            delimiterCounts,
            mostCommonDelimiter
          });
          
          // Generate appropriate formula with error handling
          const formula = `=IFERROR(LEFT(${colLetter}2,FIND("${mostCommonDelimiter}",${colLetter}2)-1),${colLetter}2)`;
          
          return {
            action: 'setCellValue',
            params: { formula, column: colIndex },
            target: { type: 'column', identifier: colIndex },
            success_message: `✅ Inserted text extraction formula: ${formula} (using delimiter "${mostCommonDelimiter}")`
          };
        }
      }
    }

    // Handle clearing filters
    const clearFilterRegex = /(?:clear|remove|reset)(?:\s+(?:all|the))?\s+(?:filter|filters)/i;
    if (clearFilterRegex.test(command)) {
      console.log('✅ Clear filter command matched');
      
      try {
        // Import commandService dynamically to avoid circular dependency
        const { commandService } = await import('@/services/commandService');
        
        // Use the range filter API endpoint to clear filters
        const filterResponse = await commandService.processRangeFilter({
          action: 'close'
        });
        
        if (filterResponse.success && filterResponse.action?.type === 'luckysheet_api') {
          // Return setRangeFilter command for local execution
          return {
            action: 'setRangeFilter',
            params: filterResponse.action.payload.params,
            success_message: filterResponse.message || '✅ All filters cleared'
          };
        } else {
          console.error('❌ Clear filter processing failed:', filterResponse.message);
          return null;
        }
      } catch (error) {
        console.error('❌ Error in clear filter processing:', error);
        return null;
      }
    }
    
    // Handle filtering commands with improved pattern matching
    const filterRegex = /(?:filter|show|display)(?:\s+(?:rows?|data))?(?:\s+(?:in|from|where|by|with))?(?:\s+(?:the|in\s+the)?)?\s+(?:(?:column\s+)?([a-z]\d+|[a-z]+|\w+(?:\s+\w+)*))(?:\s+(?:(?:is|equals|=|contains|has|>|<|>=|<=|with|that\s+(?:is|has|contains|equals))(?:\s+(?:the\s+)?(?:value|text|content)?)?\s+|(?:where|having|contains|matching|for|value|values?|equals?|=)\s+))(?:"([^"]+)"|'([^']+)'|([^\s"']+))(?:\s*$|\s+(?:and|then))/i;
    const filterMatch = command.match(filterRegex);
    
    if (filterMatch) {
      console.log('✅ Filter command matched:', filterMatch);
      const columnIdentifier = filterMatch[1].trim();
      // Get the filter value from whichever group matched (with or without quotes)
      const filterValue = (filterMatch[2] || filterMatch[3] || filterMatch[4] || '').trim();
      
      console.log(`📝 Extracted column: "${columnIdentifier}"`);
      console.log(`📝 Extracted filter value: "${filterValue}"`);
      
      // Determine filter type (exact match or contains)
      let filterType = 'exact';
      if (/contains|has|matching/.test(command.toLowerCase())) {
        filterType = 'contains';
      }
      console.log(`📝 Filter type: "${filterType}"`);
      
      // Try to find column index either by cell reference or column name
      let columnIndex: number | null = null;
      let columnSpecifier: string | number = columnIdentifier; // Keep original for backend processing
      
      // First try as cell reference (e.g., A1, B2)
      if (/^[a-z]\d+$/i.test(columnIdentifier)) {
        const colLetter = columnIdentifier.match(/[A-Za-z]+/)?.[0] || '';
        columnIndex = this.columnLetterToIndex(colLetter);
        columnSpecifier = columnIndex; // Use index for backend
        console.log(`📍 Resolved column index from letter ${colLetter}: ${columnIndex}`);
      } 
      // Try as column letter only (e.g., A, B)
      else if (/^[a-z]$/i.test(columnIdentifier)) {
        columnIndex = this.columnLetterToIndex(columnIdentifier.toUpperCase());
        columnSpecifier = columnIndex; // Use index for backend
        console.log(`📍 Resolved column index from letter ${columnIdentifier}: ${columnIndex}`);
      }
      else {
        // Try as column name
        columnIndex = this.findColumnByName(columnIdentifier);
        columnSpecifier = columnIdentifier; // Use name for backend processing
        console.log(`📍 Resolved column index from name "${columnIdentifier}": ${columnIndex}`);
        
        // If not found, try removing "column" word if present
        if (columnIndex === null && columnIdentifier.toLowerCase().includes('column')) {
          const cleanIdentifier = columnIdentifier.toLowerCase().replace(/\s*column\s*/g, '').trim();
          columnIndex = this.findColumnByName(cleanIdentifier);
          columnSpecifier = cleanIdentifier;
          console.log(`📍 Retried with clean identifier "${cleanIdentifier}": ${columnIndex}`);
        }
      }
      
      console.log(`📍 Final column index: ${columnIndex}`);
      console.log('🗺️ Available column mappings:', this.columnMapping);
      
      if (columnIndex !== null || typeof columnSpecifier === 'string') {
        try {
          // Import commandService dynamically to avoid circular dependency
          const { commandService } = await import('@/services/commandService');
          
          // Use the range filter API endpoint to apply filter
          const filterResponse = await commandService.processRangeFilter({
            action: 'open',
            column: columnSpecifier,
            filter_value: filterValue,
            filter_type: filterType
          });
          
          if (filterResponse.success && filterResponse.action?.type === 'luckysheet_api') {
            // Return setRangeFilter command for local execution
            return {
              action: 'setRangeFilter',
              params: filterResponse.action.payload.params,
              target: {
                type: 'column' as const,
                identifier: columnIndex || columnIdentifier
              },
              success_message: filterResponse.message || `✅ Filtered ${columnIdentifier} column to show values ${filterType === 'exact' ? 'matching' : 'containing'} "${filterValue}"`
            };
          } else {
            console.error('❌ Range filter processing failed:', filterResponse.message);
            return null;
          }
        } catch (error) {
          console.error('❌ Error in range filter processing:', error);
          return null;
        }
      } else {
        console.log('❌ Could not resolve column index');
      }
    } else {
      console.log('❌ Command did not match filter pattern');
    }

    // Handle cell value change commands
    const cellValueRegex = /(?:change|set|update|put|make)\s+(?:the\s+)?(?:value\s+(?:of\s+)?)?(?:cell\s+)?([a-z]\d+)(?:\s*(?:to|-|:)\s*([a-z]\d+))?\s+(?:to|as|=)\s+(.+?)(?:\s*$|\s+(?:and|then))/i;
    const valueMatch = command.match(cellValueRegex);
    
    if (valueMatch) {
      const startCellRef = valueMatch[1].toUpperCase();
      const endCellRef = valueMatch[2]?.toUpperCase() || startCellRef;
      const newValue = valueMatch[3].trim();
      console.log(`📝 Extracted start cell: "${startCellRef}"`);
      console.log(`📝 Extracted end cell: "${endCellRef}"`);
      console.log(`📝 Extracted new value: "${newValue}"`);
      
      // Parse start cell reference
      const startColLetter = startCellRef.match(/[A-Z]+/)?.[0] || '';
      const startRowNum = parseInt(startCellRef.match(/\d+/)?.[0] || '0') - 1;
      const startColIndex = this.columnLetterToIndex(startColLetter);
      
      // Parse end cell reference
      const endColLetter = endCellRef.match(/[A-Z]+/)?.[0] || '';
      const endRowNum = parseInt(endCellRef.match(/\d+/)?.[0] || '0') - 1;
      const endColIndex = this.columnLetterToIndex(endColLetter);
      
      console.log(`📍 Parsed start row: ${startRowNum}, column: ${startColIndex}`);
      console.log(`📍 Parsed end row: ${endRowNum}, column: ${endColIndex}`);
      
      if (!isNaN(startRowNum) && !isNaN(startColIndex) && !isNaN(endRowNum) && !isNaN(endColIndex)) {
        // Try to parse the value as a number if it looks like one
        let parsedValue: string | number = newValue;
        if (/^-?\d*\.?\d+$/.test(newValue)) {
          parsedValue = parseFloat(newValue);
        }
        
        // Create a command for each cell in the range
        const commands: SpreadsheetCommand[] = [];
        for (let row = Math.min(startRowNum, endRowNum); row <= Math.max(startRowNum, endRowNum); row++) {
          for (let col = Math.min(startColIndex, endColIndex); col <= Math.max(startColIndex, endColIndex); col++) {
            commands.push({
              action: 'setCellValue',
              params: {
                row: row,
                column: col,
                value: parsedValue
              },
              target: { 
                type: 'cell' as const, 
                identifier: `${indexToColumnLetter(col)}${row + 1}` 
              }
            });
          }
        }
        
        // Return a batch command
        const command = {
          action: 'batchValue',
          params: commands,
          target: { 
            type: 'range' as const, 
            identifier: { start: startCellRef, end: endCellRef } 
          },
          success_message: `✅ Set value of ${startCellRef}${endCellRef !== startCellRef ? `:${endCellRef}` : ''} to "${newValue}"`
        };
        
        console.log('🎯 Generated command:', command);
        return command;
      }
    }
    
    // Handle cell formatting commands with range support
    const cellFormatRegex = /(?:make|set)\s+(?:cell\s+)?([a-z]\d+)(?:\s*(?:to|-|:)\s*([a-z]\d+))?\s+(bold|italic|underline|strikethrough|background|bg|color)\s*(?:to\s+)?(\w+)?/i;
    const formatMatch = command.match(cellFormatRegex);
    
    if (formatMatch) {
      const startCellRef = formatMatch[1].toUpperCase();
      const endCellRef = formatMatch[2]?.toUpperCase() || startCellRef;
      const formatType = formatMatch[3].toLowerCase();
      const colorValue = formatMatch[4]?.toLowerCase();
      console.log(`📝 Extracted start cell: "${startCellRef}"`);
      console.log(`📝 Extracted end cell: "${endCellRef}"`);
      console.log(`📝 Extracted format type: "${formatType}"`);
      console.log(`📝 Extracted color value: "${colorValue}"`);
      
      // Parse start cell reference
      const startColLetter = startCellRef.match(/[A-Z]+/)?.[0] || '';
      const startRowNum = parseInt(startCellRef.match(/\d+/)?.[0] || '0') - 1;
      const startColIndex = this.columnLetterToIndex(startColLetter);
      
      // Parse end cell reference
      const endColLetter = endCellRef.match(/[A-Z]+/)?.[0] || '';
      const endRowNum = parseInt(endCellRef.match(/\d+/)?.[0] || '0') - 1;
      const endColIndex = this.columnLetterToIndex(endColLetter);
      
      console.log(`📍 Parsed start row: ${startRowNum}, column: ${startColIndex}`);
      console.log(`📍 Parsed end row: ${endRowNum}, column: ${endColIndex}`);
      
      if (!isNaN(startRowNum) && !isNaN(startColIndex) && !isNaN(endRowNum) && !isNaN(endColIndex)) {
        let formatAction: string;
        let formatValue: number | string;
        let formatAttr: string;
        
        // Convert color names to hex values
        const colorMap: { [key: string]: string } = {
          red: '#ff0000',
          blue: '#0000ff',
          green: '#00ff00',
          yellow: '#ffff00',
          purple: '#800080',
          orange: '#ffa500',
          black: '#000000',
          white: '#ffffff',
          gray: '#808080',
          pink: '#ffc0cb'
        };
        
        switch (formatType) {
          case 'bold':
            formatAction = 'setCellFormat';
            formatAttr = 'bl';
            formatValue = 1;
            break;
          case 'italic':
            formatAction = 'setCellFormat';
            formatAttr = 'it';
            formatValue = 1;
            break;
          case 'underline':
            formatAction = 'setCellFormat';
            formatAttr = 'ul';
            formatValue = 1;
            break;
          case 'strikethrough':
            formatAction = 'setCellFormat';
            formatAttr = 'cl';
            formatValue = 1;
            break;
          case 'background':
          case 'bg':
            formatAction = 'setCellFormat';
            formatAttr = 'bg';
            formatValue = colorMap[colorValue] || colorValue;
            break;
          case 'color':
            formatAction = 'setCellFormat';
            formatAttr = 'fc';
            formatValue = colorMap[colorValue] || colorValue;
            break;
          default:
            return null;
        }
        
        // Create a command for each cell in the range
        const commands: SpreadsheetCommand[] = [];
        for (let row = Math.min(startRowNum, endRowNum); row <= Math.max(startRowNum, endRowNum); row++) {
          for (let col = Math.min(startColIndex, endColIndex); col <= Math.max(startColIndex, endColIndex); col++) {
            commands.push({
              action: formatAction,
              params: {
                row: row,
                column: col,
                attr: formatAttr,
                value: formatValue
              },
              target: { 
                type: 'cell' as const, 
                identifier: `${indexToColumnLetter(col)}${row + 1}` 
              }
            });
          }
        }
        
        // Return a batch command
        const command = {
          action: 'batchFormat',
          params: commands,
          target: { 
            type: 'range' as const, 
            identifier: { start: startCellRef, end: endCellRef } 
          },
          success_message: `✅ Cells ${startCellRef}:${endCellRef} ${
            formatType === 'background' || formatType === 'bg' ? 
              `background color set to ${colorValue}` : 
            formatType === 'color' ? 
              `font color set to ${colorValue}` : 
              `formatted as ${formatType}`
          }`
        };
        
        console.log('🎯 Generated command:', command);
        return command;
      }
    }
    
    return null;
  }

  // Execute command on Luckysheet
  executeCommand(command: SpreadsheetCommand): boolean {
    try {
      // Enhanced check for Luckysheet availability
      if (!(window as any).luckysheet) {
        console.error('Luckysheet is not available');
        
        // Attempt to find Luckysheet in alternative ways
        if ((window as any).luckysheet === null || (window as any).luckysheet === undefined) {
          console.log('Attempting to wait for Luckysheet to initialize...');
          
          // Create a promise that resolves when Luckysheet is available
          const waitForLuckysheet = (maxAttempts: number, interval: number): Promise<boolean> => {
            return new Promise((resolve) => {
              let attempts = 0;
              
              const checkLuckysheet = () => {
                if ((window as any).luckysheet) {
                  console.log('Luckysheet found after waiting!');
                  resolve(true);
                } else if (attempts >= maxAttempts) {
                  console.error(`Luckysheet not found after ${maxAttempts} attempts`);
                  resolve(false);
                } else {
                  attempts++;
                  console.log(`Waiting for Luckysheet (attempt ${attempts}/${maxAttempts})...`);
                  setTimeout(checkLuckysheet, interval);
                }
              };
              
              checkLuckysheet();
            });
          };
          
          // Initiate the wait, but don't block execution
          waitForLuckysheet(5, 500).then((success) => {
            if (success) {
              console.log('Retrying command after Luckysheet was found');
              this.executeCommand(command);
            }
          });
        }
        
        return false;
      }

      switch (command.action) {
        case 'undo':
          window.luckysheet.undo();
          break;
          
        case 'redo':
          window.luckysheet.redo();
          break;
          
        case 'setColumnWidth':
          window.luckysheet.setColumnWidth(command.params);
          break;
          
        case 'insertRow':
          window.luckysheet.insertRow(...command.params);
          break;
          
        case 'deleteRow':
          window.luckysheet.deleteRow(...command.params);
          break;
          
        case 'insertColumn':
          window.luckysheet.insertColumn(...command.params);
          break;
          
        case 'deleteColumn':
          window.luckysheet.deleteColumn(...command.params);
          break;
          
        case 'hideRow':
          window.luckysheet.hideRow(...command.params);
          break;
          
        case 'showRow':
          window.luckysheet.showRow(...command.params);
          break;
          
        case 'hideColumn':
          window.luckysheet.hideColumn(...command.params);
          break;
          
        case 'showColumn':
          window.luckysheet.showColumn(...command.params);
          break;
          
        case 'setHorizontalFrozen':
          window.luckysheet.setHorizontalFrozen(...command.params);
          break;
          
        case 'setRangeShow':
          window.luckysheet.setRangeShow(...command.params);
          break;

        case 'setRangeSort':
          window.luckysheet.setRangeSort(...command.params);
          break;

        case 'setRangeSortMulti':
          // params: [title:boolean, sortArray: Array<{i:number, sort:'asc'|'desc'}>, optionalSetting]
          window.luckysheet.setRangeSortMulti(...command.params);
          break;

        case 'setRangeConditionalFormatDefault':
          // params: [conditionName: string, conditionValue: { type: 'value'|'range', content: any[] } | any[], optionalSetting]
          // Example: setRangeConditionalFormatDefault('greaterThan', { type: 'value', content: [2] }, { cellrange: 'A2:A100' })
          try {
            const [condName, condValue, setting] = command.params as [any, any, any];

            // Short-circuit: for duplicate highlighting, bypass Luckysheet CF API completely and do manual highlight
            if (String(condName) === 'duplicateValue') {
              const rangeStr: string = (setting && (setting as any).cellrange) ? (setting as any).cellrange : '';
              const m = rangeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
              if (m && (window as any).luckysheet && typeof (window as any).luckysheet.getSheetData === 'function') {
                const startColLetter = m[1];
                const startRowRaw = parseInt(m[2], 10);
                const endColLetter = m[3];
                const endRow = parseInt(m[4], 10);
                const startRow = Math.max(2, startRowRaw); // Exclude header
                const colStartIndex = startColLetter.charCodeAt(0) - 65;
                const colEndIndex = endColLetter.charCodeAt(0) - 65;
                const sheetData = (window as any).luckysheet.getSheetData();

                const normalize = (cell: any): string => {
                  if (cell === null || cell === undefined) return '';
                  if (typeof cell === 'object' && cell !== null) {
                    const m = (cell as any).m;
                    const v = (cell as any).v;
                    if (m !== undefined && m !== null) return String(m).trim();
                    if (v !== undefined && v !== null) {
                      if (typeof v === 'object') {
                        const nm = (v as any).m;
                        const nv = (v as any).v;
                        if (nm !== undefined && nm !== null) return String(nm).trim();
                        if (nv !== undefined && nv !== null) return String(nv).trim();
                        return String(v).trim();
                      }
                      return String(v).trim();
                    }
                    return '';
                  }
                  return String(cell).trim();
                };

                if (colStartIndex === colEndIndex) {
                  // Single-column duplicates
                  const counts: Record<string, number> = {};
                  for (let r = startRow - 1; r <= endRow - 1 && r < sheetData.length; r++) {
                    const value = normalize(sheetData[r]?.[colStartIndex]);
                    if (value !== '') counts[value] = (counts[value] || 0) + 1;
                  }
                  const targetRows: number[] = [];
                  for (let r = startRow - 1; r <= endRow - 1 && r < sheetData.length; r++) {
                    const value = normalize(sheetData[r]?.[colStartIndex]);
                    if (value !== '' && (counts[value] || 0) > 1) targetRows.push(r + 1);
                  }
                  if (targetRows.length > 0) {
                    let s = targetRows[0];
                    let p = targetRows[0];
                    const blocks: Array<{ s: number; e: number }> = [];
                    for (let k = 1; k < targetRows.length; k++) {
                      if (targetRows[k] === p + 1) p = targetRows[k];
                      else { blocks.push({ s, e: p }); s = p = targetRows[k]; }
                    }
                    blocks.push({ s, e: p });
                    blocks.forEach(b => {
                      const blockRange = `${startColLetter}${b.s}:${startColLetter}${b.e}`;
                      try { 
                        window.luckysheet.setRangeFormat('bg', '#ffcccc', { range: blockRange }); 
                      } catch {}
                    });
                  }
                } else {
                  // Multi-column: duplicate rows across selected columns
                  const sigCounts: Record<string, number> = {};
                  const makeSig = (r: number): string => {
                    const parts: string[] = [];
                    for (let c = colStartIndex; c <= colEndIndex; c++) parts.push(normalize(sheetData[r]?.[c]));
                    return parts.join('\u241F');
                  };
                  for (let r = startRow - 1; r <= endRow - 1 && r < sheetData.length; r++) {
                    const sig = makeSig(r);
                    if (sig.replace(/\u241F/g, '') === '') continue; // ignore fully empty
                    sigCounts[sig] = (sigCounts[sig] || 0) + 1;
                  }
                  const dupRows: number[] = [];
                  for (let r = startRow - 1; r <= endRow - 1 && r < sheetData.length; r++) {
                    const sig = makeSig(r);
                    if (sig.replace(/\u241F/g, '') === '') continue;
                    if ((sigCounts[sig] || 0) > 1) dupRows.push(r + 1);
                  }
                  if (dupRows.length > 0) {
                    let s = dupRows[0];
                    let p = dupRows[0];
                    const blocks: Array<{ s: number; e: number }> = [];
                    for (let k = 1; k < dupRows.length; k++) {
                      if (dupRows[k] === p + 1) p = dupRows[k];
                      else { blocks.push({ s, e: p }); s = p = dupRows[k]; }
                    }
                    blocks.push({ s, e: p });
                    blocks.forEach(b => {
                      const rowRange = `${startColLetter}${b.s}:${endColLetter}${b.e}`;
                      try { 
                        window.luckysheet.setRangeFormat('bg', '#ffcccc', { range: rowRange }); 
                      } catch {}
                    });
                  }
                }
                return true;
              }
              // If range/sheet not available, do nothing to avoid API errors
              return false;
            }

            // Default path for other condition types: try Luckysheet CF API with fallbacks
            const attempts: any[] = [];
            const buildAttempt = (second: any) => [condName, second, setting].filter(v => v !== undefined);
            const isObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
            const isArray = (v: any) => Array.isArray(v);

            let contentArray: any[] | undefined = undefined;
            if (isArray(condValue)) {
              contentArray = condValue as any[];
              attempts.push(buildAttempt(contentArray));
              attempts.push(buildAttempt({ type: 'value', content: contentArray }));
            } else if (isObject(condValue)) {
              const obj = condValue as any;
              if (isArray(obj.content)) contentArray = obj.content;
              attempts.push(buildAttempt(obj));
              if (contentArray) attempts.push(buildAttempt(contentArray));
            } else if (condValue !== undefined) {
              contentArray = [condValue];
              attempts.push(buildAttempt(contentArray));
              attempts.push(buildAttempt({ type: 'value', content: contentArray }));
            } else {
              // Ensure there is at least one attempt with empty content
              attempts.push(buildAttempt({ type: 'value', content: [] }));
            }

            let success = false;
            let lastErr: any = null;
            for (const attempt of attempts) {
              try {
                window.luckysheet.setRangeConditionalFormatDefault(...attempt);
                success = true;
                break;
              } catch (err) {
                lastErr = err;
              }
            }

            if (!success) {
              throw lastErr || new Error('Conditional format application failed');
            }
          } catch (error) {
            console.error('Error in setRangeConditionalFormatDefault execution:', error);
            return false;
          }
          break;

        case 'setRangeConditionalFormat':
          // params: [type: 'dataBar'|'icons'|'colorGradation', { format?: any }]
          // Example: setRangeConditionalFormat('dataBar', { format: ["#63c384", "#ffffff"] })
          window.luckysheet.setRangeConditionalFormat(...command.params);
          break;

        case 'deleteRangeConditionalFormat':
          // params: [index: number]
          if (typeof window.luckysheet.deleteRangeConditionalFormat === 'function') {
            window.luckysheet.deleteRangeConditionalFormat(...command.params);
          } else {
            console.warn('deleteRangeConditionalFormat is not available in this Luckysheet build');
          }
          break;
          
        case 'setCellFormat':
          window.luckysheet.setCellFormat(
            command.params.row, 
            command.params.column, 
            command.params.attr, 
            command.params.value
          );
          break;
          
        case 'setRangeFormat':
          console.log('🎨 Executing setRangeFormat with params:', command.params);
          window.luckysheet.setRangeFormat(
            command.params[0],  // attr
            command.params[1],  // value  
            command.params[2]   // settings object with range
          );
          console.log('✅ setRangeFormat executed successfully');
          break;
          
        case 'setCellValue':
          window.luckysheet.setCellValue(
            command.params.row,
            command.params.column,
            command.params.value
          );
          break;
          
        case 'batchFormat':
          // Execute each command in the batch
          command.params.forEach((cmd: SpreadsheetCommand) => {
            window.luckysheet.setCellFormat(
              cmd.params.row,
              cmd.params.column,
              cmd.params.attr,
              cmd.params.value
            );
          });
          break;
          
        case 'batchValue':
          // Execute each command in the batch
          command.params.forEach((cmd: SpreadsheetCommand) => {
            window.luckysheet.setCellValue(
              cmd.params.row,
              cmd.params.column,
              cmd.params.value
            );
          });
          break;

        case 'multi':
          // Execute a sequence of Luckysheet commands
          (command.params as SpreadsheetCommand[]).forEach((sub: SpreadsheetCommand) => {
            this.executeCommand(sub);
          });
          break;
          
        case 'rowFilter':
          console.log('🔍 Executing row filter command:', command.params);
          
          try {
            // Additional safeguards for Luckysheet initialization
            if (!window.luckysheet) {
              console.error('Luckysheet is not available for filtering');
              return false;
            }
            
            if (typeof window.luckysheet.getSheetData !== 'function') {
              console.error('Luckysheet.getSheetData is not a function');
              return false;
            }
            
            // Get current sheet data
            const filterSheetData = window.luckysheet.getSheetData();
            if (!filterSheetData) {
              console.error('No sheet data available');
              return false;
            }
            
            console.log('📊 Current sheet data rows:', filterSheetData.length);
            
            const colIndex = command.params.column;
            const filterValue = command.params.value;
            const filterType = command.params.type || 'exact';
            
            console.log(`🔍 Filtering column ${colIndex} for value "${filterValue}" using ${filterType} matching`);
            
            // Find rows that don't match the filter value
            const rowsToHide: number[] = [];
            let matchCount = 0;
            
            for (let r = 1; r < filterSheetData.length; r++) { // Start from 1 to skip header
              if (r >= filterSheetData.length) break;
              
              // Skip row if it doesn't exist or doesn't have the column
              if (!filterSheetData[r] || !Object.prototype.hasOwnProperty.call(filterSheetData[r], colIndex)) {
                console.log(`🔍 Row ${r}, Column ${colIndex}: Skipping - row or column not found`);
                continue;
              }
              
              const cellValue = filterSheetData[r][colIndex];
              let cellTextValue = '';
              
              // Extract cell value depending on its format
              if (cellValue === null || cellValue === undefined) {
                cellTextValue = '';
              } else if (typeof cellValue === 'object' && cellValue !== null && cellValue.m !== undefined) {
                cellTextValue = String(cellValue.m);
              } else if (typeof cellValue === 'object' && cellValue !== null && cellValue.v !== undefined) {
                cellTextValue = String(cellValue.v);
              } else {
                cellTextValue = String(cellValue);
              }
              
              console.log(`🔍 Row ${r}, Column ${colIndex}: "${cellTextValue}"`);
              
              // Check if the cell matches the filter criteria
              let isMatch = false;
              
              if (filterType === 'exact') {
                // Case-insensitive exact match
                isMatch = cellTextValue.toLowerCase() === filterValue.toLowerCase();
              } else if (filterType === 'contains') {
                // Case-insensitive partial match
                isMatch = cellTextValue.toLowerCase().includes(filterValue.toLowerCase());
              }
              
              // If cell doesn't match, add to rows to hide
              if (!isMatch) {
                rowsToHide.push(r);
                console.log(`  ❌ Row ${r} will be hidden - no match`);
              } else {
                matchCount++;
                console.log(`  ✅ Row ${r} will remain visible - match found`);
              }
            }
            
            console.log(`🔍 Found ${matchCount} matching rows out of ${filterSheetData.length - 1} data rows`);
            console.log('🔍 Rows to hide:', rowsToHide.length);
            
            try {
              // Get current active sheet with enhanced checks
              if (!window.luckysheet) {
                console.error('Luckysheet is not available');
                return false;
              }
              
              if (!window.luckysheet.luckysheetfile) {
                console.error('luckysheetfile is not available');
                
                // Try to find the current sheet data through alternative means
                const currentData = window.luckysheet.getSheetData?.();
                if (currentData) {
                  console.log('Found sheet data through getSheetData() instead');
                  
                  // Create a minimal sheet config to apply filters
                  const customConfig: { rowhidden: {[key: string]: number} } = { rowhidden: {} };
                  
                  // Apply our filter by setting rows to hide
                  for (const rowIndex of rowsToHide) {
                    customConfig.rowhidden[rowIndex.toString()] = 0;
                  }
                  
                  // Try to use alternative refresh methods
                  if (typeof window.luckysheet.jfrefreshgrid === 'function') {
                    console.log('Using jfrefreshgrid with custom config');
                    window.luckysheet.jfrefreshgrid(undefined, undefined, undefined, undefined, customConfig);
                    console.log('🔍 Row filtering applied through alternative method');
                    return true;
                  }
                }
                
                return false;
              }
              
              const activeSheet = window.luckysheet.luckysheetfile.find((sheet: any) => sheet && sheet.status === 1);
              if (!activeSheet) {
                console.error('No active sheet found');
                return false;
              }
              
              // Create a custom filter visualization
              // 1. First check if config exists
              if (!activeSheet.config) {
                activeSheet.config = {};
              }
              
              // 2. Initialize or reset the rowhidden property
              activeSheet.config.rowhidden = activeSheet.config.rowhidden || {};
              
              // 3. Apply our filter by setting rows to hide
              for (const rowIndex of rowsToHide) {
                activeSheet.config.rowhidden[rowIndex] = 0;
              }
              
              // 4. Force refresh to apply changes with fallbacks
              console.log('🔍 Applying custom row hiding to sheet config:', Object.keys(activeSheet.config.rowhidden).length, 'rows hidden');
              if (typeof window.luckysheet.jfrefreshgrid === 'function') {
                window.luckysheet.jfrefreshgrid();
              } else if (typeof window.luckysheet.refresh === 'function') {
                console.log('Using refresh function instead');
                window.luckysheet.refresh();
              } else {
                console.error('No refresh methods available');
                // Try to trigger a UI update through alternative means
                if (window.luckysheet.flowdata) {
                  console.log('Attempting to update through flowdata');
                  window.luckysheet.flowdata();
                }
              }
              
              console.log('🔍 Row filtering completed');
              return true;
            } catch (error) {
              console.error('Error during custom filtering:', error);
              return false;
            }
          } catch (error) {
            console.error('Error in filter command execution:', error);
            return false;
          }
          
        case 'autoFitColumns':
          // Custom implementation for auto-fit
          try {
            console.log('📏 Executing autoFitColumns command');
            const sheetData = window.luckysheet.getSheetData();
            
            if (!sheetData || sheetData.length === 0) {
              console.warn('No sheet data available for autoFitColumns');
              return false;
            }
            
            // Determine the maximum number of columns
            const maxCols = Math.max(...sheetData.map((row: any) => row ? row.length : 0));
            console.log(`📏 Auto-fitting ${maxCols} columns`);
            
            // Calculate optimal widths for each column
            const columnWidths: {[key: number]: number} = {};
            
            // Default min and max widths
            const MIN_WIDTH = 80;
            const MAX_WIDTH = 300;
            const DEFAULT_CHAR_WIDTH = 8; // Average width of a character in pixels
            const PADDING = 20; // Extra padding
            
            for (let col = 0; col < maxCols; col++) {
              // Start with column header (if exists) or minimum width
              let maxContentLength = 0;
              
              // Check all rows for this column
              for (let row = 0; row < sheetData.length; row++) {
                if (sheetData[row] && sheetData[row][col]) {
                  const cellValue = sheetData[row][col];
                  
                  // Get cell content as string
                  let content = '';
                  
                  if (cellValue) {
                    // Try to get the formatted display value first
                    content = cellValue.m || '';
                    
                    // If no formatted value, try to get the raw value
                    if (!content && cellValue.v !== undefined) {
                      content = String(cellValue.v);
                    }
                  }
                  
                  // Update max content length
                  maxContentLength = Math.max(maxContentLength, content.length);
                }
              }
              
              // Calculate width based on content length
              const optimalWidth = Math.max(
                MIN_WIDTH,
                Math.min(MAX_WIDTH, maxContentLength * DEFAULT_CHAR_WIDTH + PADDING)
              );
              
              // Set column width
              columnWidths[col] = optimalWidth;
              console.log(`📏 Column ${col}: optimal width = ${optimalWidth}px`);
            }
            
            // Apply all column widths at once
            window.luckysheet.setColumnWidth(columnWidths);
            console.log('📏 All columns auto-fitted successfully');
            return true;
          } catch (error) {
            console.error('Error during autoFitColumns execution:', error);
            return false;
          }
          break;
          
        case 'setRangeFilter':
          // Handle both opening and closing filters using the actual Luckysheet API
          console.log('🔍 Executing setRangeFilter command:', command.params);
          
          // Extract parameters - should be [type, setting] format
          const filterType = command.params[0]; // "open" or "close"
          const filterSetting = command.params[1] || {}; // {range: "A1:B2", order: 0}
          
          console.log(`🔍 Filter type: ${filterType}, setting:`, filterSetting);
          
          try {
            if (typeof window.luckysheet.setRangeFilter === 'function') {
              window.luckysheet.setRangeFilter(filterType, filterSetting);
              console.log('✅ setRangeFilter executed successfully');
              return true;
            } else {
              console.error('❌ setRangeFilter method not available in Luckysheet');
              return false;
            }
          } catch (error) {
            console.error('❌ Error executing setRangeFilter:', error);
            return false;
          }
          
        case 'clearFilter':
          console.log('🔍 Clearing all filters');
          
          try {
            // Get current active sheet
            if (!window.luckysheet || !window.luckysheet.luckysheetfile) {
              console.error('Luckysheet or luckysheetfile is not available');
              return false;
            }
            
            const activeSheet = window.luckysheet.luckysheetfile.find((sheet: any) => sheet && sheet.status === 1);
            if (!activeSheet) {
              console.error('No active sheet found');
              return false;
            }
            
            // Clear rowhidden in config
            if (activeSheet.config && activeSheet.config.rowhidden) {
              console.log('🔍 Clearing rowhidden config with', Object.keys(activeSheet.config.rowhidden).length, 'hidden rows');
              activeSheet.config.rowhidden = {};
              
              // Force refresh to apply changes
              if (typeof window.luckysheet.jfrefreshgrid === 'function') {
                window.luckysheet.jfrefreshgrid();
              } else {
                console.error('jfrefreshgrid function is not available');
                if (typeof window.luckysheet.refresh === 'function') {
                  console.log('Using refresh function instead');
                  window.luckysheet.refresh();
                }
              }
              console.log('🔍 All filters cleared');
            } else {
              console.log('🔍 No filters to clear');
            }
            
            return true;
          } catch (error) {
            console.error('Error during filter clearing:', error);
            return false;
          }
          
        default:
          console.warn(`Unknown command action: ${command.action}`);
          return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error executing command:', error);
      return false;
    }
  }

  // Get current column headers for debugging
  getColumnMapping(): ColumnMapping {
    return { ...this.columnMapping };
  }

  // Helper method to convert column letter to index
  private columnLetterToIndex(letter: string): number {
    if (!letter) return -1;
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
      result = result * 26 + (letter.charCodeAt(i) - 64);
    }
    return result - 1; // Convert to 0-based index
  }
}

// Utility function to convert column letter to index
export function columnLetterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

// Utility function to convert index to column letter  
export function indexToColumnLetter(index: number): string {
  return String.fromCharCode(65 + index);
} 