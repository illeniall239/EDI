// Spreadsheet Command Processor for Natural Language Operations
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

    // Column width operations with letter references
    const columnWidthMatch = lowerCommand.match(/^(?:make|set|adjust)?\s*column\s+([a-z])\s+(?:wider|bigger|larger|increase|expand)$/);
    if (columnWidthMatch) {
      console.log('✅ Matched column letter width pattern:', columnWidthMatch);
      const columnLetter = columnWidthMatch[1].toUpperCase();
      const columnIndex = columnLetter.charCodeAt(0) - 65; // A=0, B=1, etc.
      console.log(`📍 Column letter "${columnLetter}" → index ${columnIndex}`);
      return {
        action: 'setColumnWidth',
        params: { [columnIndex]: 200 },
        target: { type: 'column' as const, identifier: columnIndex },
        success_message: `✅ Column ${columnLetter} made wider`
      };
    }

    const columnNarrowMatch = lowerCommand.match(/^(?:make|set|adjust)?\s*column\s+([a-z])\s+(?:narrower|smaller|thinner|decrease|shrink)$/);
    if (columnNarrowMatch) {
      console.log('✅ Matched column letter narrow pattern:', columnNarrowMatch);
      const columnLetter = columnNarrowMatch[1].toUpperCase();
      const columnIndex = columnLetter.charCodeAt(0) - 65;
      console.log(`📍 Column letter "${columnLetter}" → index ${columnIndex}`);
      return {
        action: 'setColumnWidth',
        params: { [columnIndex]: 100 },
        target: { type: 'column' as const, identifier: columnIndex },
        success_message: `✅ Column ${columnLetter} made narrower`
      };
    }

    // Row operations
    const insertRowMatch = lowerCommand.match(/(?:add|insert)\s*(\d+)?\s*(?:new\s*)?rows?/);
    if (insertRowMatch) {
      console.log('✅ Matched insert row pattern:', insertRowMatch);
      const count = insertRowMatch[1] ? parseInt(insertRowMatch[1]) : 1;
      console.log(`📊 Inserting ${count} rows`);
      return {
        action: 'insertRow',
        params: [1, { number: count }], // Insert at row 1
        success_message: `✅ Added ${count} row${count > 1 ? 's' : ''}`
      };
    }

    const deleteRowMatch = lowerCommand.match(/(?:delete|remove)\s*(?:row\s*)?(\d+)/);
    if (deleteRowMatch) {
      console.log('✅ Matched delete row pattern:', deleteRowMatch);
      const rowNum = parseInt(deleteRowMatch[1]) - 1; // Convert to 0-based
      console.log(`🗑️ Deleting row ${deleteRowMatch[1]} (index ${rowNum})`);
      return {
        action: 'deleteRow',
        params: [rowNum, rowNum],
        success_message: `✅ Deleted row ${deleteRowMatch[1]}`
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
        params: ['des'],
        success_message: '✅ Data sorted Z-A'
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
    for (const { op, regex, fn } of formulaOps) {
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
          let sampleData: string[] = [];
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
      return {
        action: 'clearFilter',
        params: {},
        success_message: '✅ All filters cleared'
      };
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
      
      // First try as cell reference (e.g., A1, B2)
      if (/^[a-z]\d+$/i.test(columnIdentifier)) {
        const colLetter = columnIdentifier.match(/[A-Za-z]+/)?.[0] || '';
        columnIndex = this.columnLetterToIndex(colLetter);
        console.log(`📍 Resolved column index from letter ${colLetter}: ${columnIndex}`);
      } 
      // Try as column letter only (e.g., A, B)
      else if (/^[a-z]$/i.test(columnIdentifier)) {
        columnIndex = this.columnLetterToIndex(columnIdentifier.toUpperCase());
        console.log(`📍 Resolved column index from letter ${columnIdentifier}: ${columnIndex}`);
      }
      else {
        // Try as column name
        columnIndex = this.findColumnByName(columnIdentifier);
        console.log(`📍 Resolved column index from name "${columnIdentifier}": ${columnIndex}`);
        
        // If not found, try removing "column" word if present
        if (columnIndex === null && columnIdentifier.toLowerCase().includes('column')) {
          const cleanIdentifier = columnIdentifier.toLowerCase().replace(/\s*column\s*/g, '').trim();
          columnIndex = this.findColumnByName(cleanIdentifier);
          console.log(`📍 Retried with clean identifier "${cleanIdentifier}": ${columnIndex}`);
        }
      }
      
      console.log(`📍 Final column index: ${columnIndex}`);
      console.log('🗺️ Available column mappings:', this.columnMapping);
      
      if (columnIndex !== null) {
        // Create filter command
        const command = {
          action: 'rowFilter',
          params: {
            column: columnIndex,
            value: filterValue,
            type: filterType
          },
          target: {
            type: 'column' as const,
            identifier: columnIndex
          },
          success_message: `✅ Filtered ${columnIdentifier} column to show values ${filterType === 'exact' ? 'matching' : 'containing'} "${filterValue}"`
        };
        
        console.log('🎯 Generated filter command:', command);
        return command;
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
      if (!window.luckysheet) {
        console.error('Luckysheet is not available');
        
        // Attempt to find Luckysheet in alternative ways
        if (window.luckysheet === null || window.luckysheet === undefined) {
          console.log('Attempting to wait for Luckysheet to initialize...');
          
          // Create a promise that resolves when Luckysheet is available
          const waitForLuckysheet = (maxAttempts: number, interval: number): Promise<boolean> => {
            return new Promise((resolve) => {
              let attempts = 0;
              
              const checkLuckysheet = () => {
                if (window.luckysheet) {
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
          
        case 'setHorizontalFrozen':
          window.luckysheet.setHorizontalFrozen(...command.params);
          break;
          
        case 'setRangeSort':
          window.luckysheet.setRangeSort(...command.params);
          break;
          
        case 'setCellFormat':
          window.luckysheet.setCellFormat(
            command.params.row, 
            command.params.column, 
            command.params.attr, 
            command.params.value
          );
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
                    // @ts-ignore - Ignore potential type errors with custom parameters
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
              let optimalWidth = Math.max(
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