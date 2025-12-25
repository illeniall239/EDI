/**
 * LLM Command Classification Service
 * 
 * Uses an LLM to intelligently classify user commands and extract parameters
 * with regex patterns as fallback for simple cases.
 */

export interface CommandClassification {
  intent: 'conditional_format' | 'data_modification' | 'find_replace' | 'filter' | 'sort' | 'column_operation' | 'row_operation' | 'cell_operation' | 'range_operation' | 'freeze_operation' | 'table_operation' | 'hyperlink_operation' | 'data_validation' | 'comment_operation' | 'image_operation' | 'named_range_operation' | 'intelligent_analysis' | 'smart_format' | 'data_entry' | 'general_query' | 'compound_operation' | 'unknown';
  action: string;
  target: {
    type: 'cell' | 'column' | 'row' | 'range' | 'all_data' | 'specific_value' | 'table' | 'compound';
    identifier: string;
  };
  parameters: {
    [key: string]: unknown;
  };
  confidence: number;
  reasoning?: string;
}

export class LLMCommandClassifier {
  private static instance: LLMCommandClassifier;
  private cache: Map<string, CommandClassification> = new Map();

  static getInstance(): LLMCommandClassifier {
    if (!LLMCommandClassifier.instance) {
      LLMCommandClassifier.instance = new LLMCommandClassifier();
    }
    return LLMCommandClassifier.instance;
  }

  /**
   * Main classification method - tries LLM first, falls back to patterns
   */
  async classifyCommand(userInput: string): Promise<CommandClassification> {
    console.log('🧠 LLM Classifier: Processing command:', userInput);

    // Check cache first
    const cacheKey = userInput.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      console.log('⚡ Cache hit for command classification');
      return this.cache.get(cacheKey)!;
    }

    // PRIORITY PATTERNS: Check multi-column operations BEFORE LLM to prevent mis-classification
    const lowerInput = userInput.toLowerCase().trim();

    // Multi-column deletion: "delete column D and E" or "delete columns A and C"
    if (lowerInput.match(/(?:delete|remove)\s+columns?\s+([a-z])\s+and\s+([a-z])/i)) {
      const colMatch = lowerInput.match(/(?:delete|remove)\s+columns?\s+([a-z])\s+and\s+([a-z])/i);
      if (colMatch) {
        const col1 = colMatch[1].toUpperCase();
        const col2 = colMatch[2].toUpperCase();
        const idx1 = col1.charCodeAt(0) - 65;
        const idx2 = col2.charCodeAt(0) - 65;

        console.log(`🔍 Multi-column pattern matched: ${col1} and ${col2} (indices: ${idx1}, ${idx2})`);

        // Check if consecutive (e.g., D and E where E = D + 1)
        if (idx2 === idx1 + 1) {
          console.log(`✅ Consecutive columns detected - returning count=2`);
          const result = {
            intent: 'column_operation' as const,
            action: 'delete_column',
            target: { type: 'column' as const, identifier: col1 },
            parameters: { column: col1, operation: 'delete', count: 2 },
            confidence: 0.95,
            reasoning: 'Delete consecutive columns'
          };
          this.cache.set(cacheKey, result);
          return result;
        } else {
          // Non-consecutive columns (e.g., A and C)
          console.log(`✅ Non-consecutive columns detected - using delete_columns_multiple`);
          const result = {
            intent: 'column_operation' as const,
            action: 'delete_columns_multiple',
            target: { type: 'column' as const, identifier: col1 },
            parameters: {
              columns: [col1, col2],
              operation: 'delete'
            },
            confidence: 0.95,
            reasoning: 'Delete non-consecutive columns'
          };
          this.cache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Multi-column with commas: "delete columns A, B, and C"
    if (lowerInput.match(/(?:delete|remove)\s+columns?\s+([a-z](?:\s*,\s*[a-z])+(?:\s+and\s+[a-z])?)/i)) {
      const match = lowerInput.match(/(?:delete|remove)\s+columns?\s+([a-z](?:\s*,\s*[a-z])+(?:\s+and\s+[a-z])?)/i);
      if (match) {
        const columnsStr = match[1];
        const columns = columnsStr.split(/\s*,\s*|\s+and\s+/).map(c => c.trim().toUpperCase()).filter(c => c.length > 0);

        console.log(`✅ Comma-separated columns detected:`, columns);
        const result = {
          intent: 'column_operation' as const,
          action: 'delete_columns_multiple',
          target: { type: 'column' as const, identifier: columns[0] },
          parameters: {
            columns: columns,
            operation: 'delete'
          },
          confidence: 0.95,
          reasoning: 'Delete multiple columns'
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // Intelligent Analysis Patterns
    if (lowerInput.match(/show\s+(?:me\s+)?(?:what|insights?|anomalies|trends?|patterns?).*(?:matters?|important)/i)) {
      const result = {
        intent: 'intelligent_analysis' as const,
        action: 'comprehensive_analysis',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: {},
        confidence: 0.95,
        reasoning: 'Request for comprehensive data insights'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    if (lowerInput.match(/(?:analyze|analyse)\s+(?:this\s+)?data/i)) {
      const result = {
        intent: 'intelligent_analysis' as const,
        action: 'comprehensive_analysis',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: {},
        confidence: 0.9,
        reasoning: 'Request for data analysis'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    if (lowerInput.match(/(?:detect|find|identify|show)\s+(?:anomalies|outliers)/i)) {
      const result = {
        intent: 'intelligent_analysis' as const,
        action: 'anomaly_detection',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: {},
        confidence: 0.9,
        reasoning: 'Request for anomaly detection'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    if (lowerInput.match(/(?:check|find|detect|show)\s+seasonality/i)) {
      const result = {
        intent: 'intelligent_analysis' as const,
        action: 'seasonality_analysis',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: {},
        confidence: 0.9,
        reasoning: 'Request for seasonality analysis'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    if (lowerInput.match(/(?:find|show|identify)\s+correlations?/i)) {
      const result = {
        intent: 'intelligent_analysis' as const,
        action: 'correlation_analysis',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: {},
        confidence: 0.9,
        reasoning: 'Request for correlation analysis'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Smart Formatting Patterns
    if (lowerInput.match(/(?:format|auto[\s-]?format|apply\s+formatting|make\s+professional)\s+(?:this|data|sheet|spreadsheet)/i)) {
      const result = {
        intent: 'smart_format' as const,
        action: 'auto_format',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: { template: 'professional' },
        confidence: 0.95,
        reasoning: 'Request for smart auto-formatting'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    if (lowerInput.match(/(?:format|make).*(?:financial|accounting|currency)/i)) {
      const result = {
        intent: 'smart_format' as const,
        action: 'auto_format',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: { template: 'financial' },
        confidence: 0.95,
        reasoning: 'Request for financial report formatting'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    if (lowerInput.match(/(?:format|make).*(?:minimal|simple|clean)/i)) {
      const result = {
        intent: 'smart_format' as const,
        action: 'auto_format',
        target: { type: 'all_data' as const, identifier: 'all' },
        parameters: { template: 'minimal' },
        confidence: 0.9,
        reasoning: 'Request for minimal formatting'
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Data Entry Patterns
    // Pattern 1: Single row entry with column-value pairs
    if (lowerInput.match(/^(?:add|insert|create)\s+(?:a\s+)?(?:new\s+)?row\s+(?:with\s+)?(.+)/i)) {
      const match = lowerInput.match(/^(?:add|insert|create)\s+(?:a\s+)?(?:new\s+)?row\s+(?:with\s+)?(.+)/i);
      if (match) {
        const rowDataStr = match[1];

        // Determine position
        let position = 'bottom'; // default
        if (lowerInput.includes('at the top') || lowerInput.includes('at top')) {
          position = 'top';
        } else if (lowerInput.match(/at\s+(?:row\s+)?(\d+)/i)) {
          const rowMatch = lowerInput.match(/at\s+(?:row\s+)?(\d+)/i);
          position = rowMatch![1];
        }

        const result = {
          intent: 'data_entry' as const,
          action: 'add_single_row',
          target: { type: 'row' as const, identifier: position.toString() },
          parameters: {
            row_data_string: rowDataStr,
            position: position,
            operation: 'insert_row'
          },
          confidence: 0.95,
          reasoning: 'Single row data entry request'
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // Pattern 2: Multiple row generation
    if (lowerInput.match(/^(?:add|insert|create|generate)\s+(\d+)\s+(?:sample\s+)?(.+?)(?:\s+with\s+(.+))?$/i)) {
      const match = lowerInput.match(/^(?:add|insert|create|generate)\s+(\d+)\s+(?:sample\s+)?(.+?)(?:\s+with\s+(.+))?$/i);
      if (match) {
        const count = parseInt(match[1]);
        const entityType = match[2].trim(); // "customers", "sales records"
        const fieldsHint = match[3]?.trim(); // "names and emails"

        const result = {
          intent: 'data_entry' as const,
          action: 'generate_multiple_rows',
          target: { type: 'all_data' as const, identifier: '*' },
          parameters: {
            count: count,
            entity_type: entityType,
            fields_hint: fieldsHint || '',
            operation: 'generate_rows'
          },
          confidence: 0.9,
          reasoning: 'Multiple row generation request'
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // Pattern 3: Header creation
    if (lowerInput.match(/^(?:create|add|insert)\s+(?:column\s+)?headers?(?:\s*:)?\s+(.+)/i)) {
      const match = lowerInput.match(/^(?:create|add|insert)\s+(?:column\s+)?headers?(?:\s*:)?\s+(.+)/i);
      if (match) {
        const headersStr = match[1];
        const headers = headersStr.split(/\s*,\s*/).map(h => h.trim());

        const result = {
          intent: 'data_entry' as const,
          action: 'create_headers',
          target: { type: 'row' as const, identifier: '0' },
          parameters: {
            headers: headers,
            operation: 'create_headers'
          },
          confidence: 0.95,
          reasoning: 'Header row creation request'
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    try {
      // Try LLM classification first
      const llmResult = await this.classifyWithLLM(userInput);
      
      // If high confidence, use LLM result
      if (llmResult.confidence >= 0.8) {
        console.log('✅ High confidence LLM classification:', llmResult.confidence);
        this.cache.set(cacheKey, llmResult);
        return llmResult;
      }

      console.log('⚠️ Low confidence LLM result, trying regex fallback...');
      
      // Fall back to regex patterns for common cases
      const regexResult = this.classifyWithRegex(userInput);
      
      // If regex has higher confidence, use it
      if (regexResult.confidence > llmResult.confidence) {
        console.log('🔧 Regex fallback provided better result');
        this.cache.set(cacheKey, regexResult);
        return regexResult;
      }

      // Use LLM result even if confidence is lower
      console.log('🧠 Using LLM result despite lower confidence');
      this.cache.set(cacheKey, llmResult);
      return llmResult;

    } catch (error) {
      console.error('❌ LLM classification failed, using regex fallback:', error);
      const regexResult = this.classifyWithRegex(userInput);
      this.cache.set(cacheKey, regexResult);
      return regexResult;
    }
  }

  /**
   * LLM-based classification using structured prompts
   */
  private async classifyWithLLM(userInput: string): Promise<CommandClassification> {
    const prompt = this.buildClassificationPrompt(userInput);

    // ⚡ OPTIMIZATION: Skip Groq for simple table patterns (faster, no timeout)
    const simpleTablePattern = /\b(create|make|add|insert)\s+(?:a\s+)?table\b/i;
    if (simpleTablePattern.test(userInput)) {
      console.log('⚡ Simple table pattern detected, using regex (skipping Groq API)');
      return this.classifyWithRegex(userInput);
    }

    // 1) Try Groq Chat Completions first (client-side) if API key is available
    try {
      const groqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
      if (groqKey) {
        console.log('🧠 Using Groq for classification (moonshotai/kimi-k2-instruct)...');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: 'moonshotai/kimi-k2-instruct',
            messages: [
              { role: 'system', content: 'You are a spreadsheet command classifier. Return ONLY JSON matching the schema.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 512
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!groqResp.ok) {
          console.warn('⚠️ Groq classify HTTP error:', groqResp.status, groqResp.statusText);
          throw new Error(`HTTP ${groqResp.status}`);
        }
        const groqJson = await groqResp.json();
        const content: string = groqJson?.choices?.[0]?.message?.content || '';
        let data: Record<string, unknown> | null = null;
        try {
          data = JSON.parse(content);
        } catch {
          const m = content.match(/\{[\s\S]*\}/);
          if (m) data = JSON.parse(m[0]);
        }
        if (!data) throw new Error('Invalid Groq response format');
        const targetData = (data.target ?? {}) as Partial<CommandClassification['target']>;
        const confidenceVal = Number(data.confidence ?? 0.5);
        const classification: CommandClassification = {
          intent: (data.intent as CommandClassification['intent']) || 'unknown',
          action: (data.action as CommandClassification['action']) || 'unknown',
          target: {
            type: (targetData.type as CommandClassification['target']['type']) || 'all_data',
            identifier: String(targetData.identifier ?? '*')
          },
          parameters: (data.parameters as Record<string, unknown>) || {},
          confidence: Math.min(
            Math.max(Number.isFinite(confidenceVal) ? confidenceVal : 0.5, 0),
            1
          ),
          reasoning: (data.reasoning as string) || 'Groq classification'
        };
        console.log('🧠 Groq classification result:', classification);
        return classification;
      }
    } catch (e) {
      console.warn('⚠️ Groq classification failed, falling back to local simulation...', e);
    }

    // 2) Simulation fallback only (no backend fallback)
    return this.simulateLLMClassification(userInput);
  }

  /**
   * Simulate LLM intelligence using enhanced pattern matching
   * This provides the benefits of LLM-style classification until real LLM is available
   */
  private async simulateLLMClassification(userInput: string): Promise<CommandClassification> {
    const lowerInput = userInput.toLowerCase().trim();
    
    // Advanced pattern matching that mimics LLM reasoning
    
    // CRITICAL: Highlight vs Remove disambiguation
    if (lowerInput.includes('highlight') || lowerInput.includes('color') || lowerInput.includes('mark') || lowerInput.includes('shade')) {
      if (lowerInput.includes('duplicate')) {
        // Try to infer column scope from user input
        let scope: 'all' | 'column' = 'all';
        let columnIdentifier: string | undefined = undefined;
        // Pattern: explicit letter (e.g., column A)
        const letterMatch = lowerInput.match(/\bcolumn\s+([a-z])\b/i) || lowerInput.match(/\bin\s+(?:the\s+)?column\s+([a-z])\b/i);
        // Pattern: named column (e.g., in the Name column)
        const nameMatch = lowerInput.match(/\bin\s+(?:the\s+)?(.+?)\s+column\b/i);
        if (letterMatch && letterMatch[1]) {
          scope = 'column';
          columnIdentifier = letterMatch[1].toUpperCase();
        } else if (nameMatch && nameMatch[1]) {
          const candidate = nameMatch[1].trim();
          scope = 'column';
          columnIdentifier = candidate;
        }

        return {
          intent: 'conditional_format',
          action: 'highlight_duplicates',
          target: scope === 'column' ? { type: 'column', identifier: columnIdentifier || '*' } : { type: 'all_data', identifier: '*' },
          parameters: { condition: 'duplicates', scope, column: columnIdentifier },
          confidence: 0.95,
          reasoning: 'Clear visual formatting intent with highlight + duplicates'
        };
      }
      
      // Other highlighting patterns
    }

    // Clear filters (broad phrasing)
    if (
      /\b(clear|remove|reset|turn off|disable|close|get rid of)\b/.test(lowerInput) &&
      /\bfilter|filters\b/.test(lowerInput)
    ) {
      return {
        intent: 'filter',
        action: 'clear_filters',
        target: { type: 'all_data', identifier: '*' },
        parameters: { action: 'close' },
        confidence: 0.9,
        reasoning: 'User asked to clear/disable filters'
      };
    }

    // Open/enable filters (broad phrasing)
    if (
      /\b(enable|turn on|open|apply|add|start|put on)\b/.test(lowerInput) &&
      /\bfilter|filters\b/.test(lowerInput)
    ) {
      return {
        intent: 'filter',
        action: 'open_filters',
        target: { type: 'all_data', identifier: '*' },
        parameters: { action: 'open' },
        confidence: 0.85,
        reasoning: 'User asked to open/enable filters'
      };
    }

    // Data modification patterns
    if ((lowerInput.includes('remove') || lowerInput.includes('delete')) && lowerInput.includes('duplicate')) {
      return {
        intent: 'data_modification',
        action: 'remove_duplicates',
        target: { type: 'all_data', identifier: '*' },
        parameters: { operation: 'remove', condition: 'duplicates' },
        confidence: 0.95,
        reasoning: 'Clear destructive intent with remove/delete + duplicates'
      };
    }

    // Find and replace patterns
    if ((lowerInput.includes('find') || lowerInput.includes('search')) &&
        (lowerInput.includes('replace') || lowerInput.includes('change'))) {
      const findText = this.extractFindText(userInput);
      const replaceText = this.extractReplaceText(userInput);

      return {
        intent: 'find_replace',
        action: 'replace_text',
        target: { type: 'all_data', identifier: '*' },
        parameters: {
          operation: 'find_replace',
          findText,
          replaceText
        },
        confidence: 0.95,
        reasoning: 'Clear find and replace operation'
      };
    }

    // Filter patterns
    if (lowerInput.includes('filter') || lowerInput.match(/show\s+only|display\s+only/)) {
      const filterMatch = lowerInput.match(/(?:filter|show\s+only|display\s+only)\s+(.+?)\s+(?:for|=|equals?|is)\s+(.+)/);
      if (filterMatch) {
        return {
          intent: 'filter',
          action: 'filter_column',
          target: { type: 'column', identifier: filterMatch[1] },
          parameters: { filter_value: filterMatch[2] },
          confidence: 0.85,
          reasoning: 'Column filtering pattern detected'
        };
      }
    }
    
    // Column operations
    const columnOpMatch = lowerInput.match(/(?:make|set|adjust)\s+(.+?)\s+column\s+(wider|narrower|bigger|smaller)/);
    if (columnOpMatch) {
      return {
        intent: 'column_operation',
        action: 'resize_column',
        target: { type: 'column', identifier: columnOpMatch[1] },
        parameters: { operation: columnOpMatch[2].includes('wide') || columnOpMatch[2].includes('big') ? 'widen' : 'narrow' },
        confidence: 0.9,
        reasoning: 'Column resizing operation'
      };
    }
    
    // Sort patterns  
    const sortMatch = lowerInput.match(/sort\s+(?:by\s+)?(.+?)(?:\s+(asc|desc|ascending|descending|a-z|z-a))?$/);
    if (sortMatch) {
      return {
        intent: 'sort',
        action: 'sort_by_column',
        target: { type: 'column', identifier: sortMatch[1] },
        parameters: { direction: sortMatch[2] || 'asc' },
        confidence: 0.85,
        reasoning: 'Sorting by column detected'
      };
    }
    
    // Row operation patterns
    if (lowerInput.match(/delete\s+row\s+(\d+)/) || lowerInput.match(/remove\s+row\s+(\d+)/)) {
      const rowMatch = lowerInput.match(/(?:delete|remove)\s+row\s+(\d+)/);
      if (rowMatch) {
        return {
          intent: 'row_operation',
          action: 'delete_row',
          target: { type: 'row', identifier: rowMatch[1] },
          parameters: { row: parseInt(rowMatch[1]), operation: 'delete' },
          confidence: 0.95,
          reasoning: 'Row deletion by number'
        };
      }
    }
    
    if (lowerInput.match(/insert\s+(?:a\s+)?(?:new\s+)?row/) || lowerInput.match(/add\s+(?:a\s+)?(?:new\s+)?row/)) {
      const posMatch = lowerInput.match(/(?:at\s+)?(?:position\s+)?(\d+)/);
      const rowNum = posMatch ? parseInt(posMatch[1]) : 1;
      return {
        intent: 'row_operation',
        action: 'insert_row',
        target: { type: 'row', identifier: rowNum.toString() },
        parameters: { row: rowNum, operation: 'insert' },
        confidence: 0.9,
        reasoning: 'Row insertion request'
      };
    }
    
    if (lowerInput.match(/hide\s+rows?/) || lowerInput.match(/hide\s+row\s+(\d+)/)) {
      return {
        intent: 'row_operation',
        action: 'hide_rows',
        target: { type: 'row', identifier: '*' },
        parameters: { operation: 'hide' },
        confidence: 0.85,
        reasoning: 'Hide rows request'
      };
    }
    
    if (lowerInput.match(/unhide\s+(?:all\s+)?rows?/) || lowerInput.match(/(?:unhide|show)\s+(?:all\s+)?hidden\s+rows?/)) {
      return {
        intent: 'row_operation',
        action: 'show_rows',
        target: { type: 'row', identifier: '*' },
        parameters: { operation: 'show' },
        confidence: 0.95,
        reasoning: 'Show/unhide all rows request'
      };
    }
    
    // Cell operation patterns
    if (lowerInput.match(/set\s+cell\s+([a-z]\d+)\s+to\s+(.+)/i)) {
      const cellMatch = lowerInput.match(/set\s+cell\s+([a-z]\d+)\s+to\s+(.+)/i);
      if (cellMatch) {
        return {
          intent: 'cell_operation',
          action: 'set_cell_value',
          target: { type: 'cell', identifier: cellMatch[1].toUpperCase() },
          parameters: { value: cellMatch[2].trim(), operation: 'set' },
          confidence: 0.95,
          reasoning: 'Set cell value request'
        };
      }
    }
    
    if (lowerInput.match(/clear\s+cell\s+([a-z]\d+)/i)) {
      const cellMatch = lowerInput.match(/clear\s+cell\s+([a-z]\d+)/i);
      if (cellMatch) {
        return {
          intent: 'cell_operation',
          action: 'clear_cell',
          target: { type: 'cell', identifier: cellMatch[1].toUpperCase() },
          parameters: { operation: 'clear' },
          confidence: 0.95,
          reasoning: 'Clear cell request'
        };
      }
    }
    
    // Range operation patterns
    if (lowerInput.match(/merge\s+cells?\s+([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i)) {
      const rangeMatch = lowerInput.match(/merge\s+cells?\s+([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i);
      if (rangeMatch) {
        const range = `${rangeMatch[1].toUpperCase()}:${rangeMatch[2].toUpperCase()}`;
        return {
          intent: 'range_operation',
          action: 'merge_range',
          target: { type: 'range', identifier: range },
          parameters: { range, operation: 'merge' },
          confidence: 0.9,
          reasoning: 'Merge cells range operation'
        };
      }
    }

    if (lowerInput.match(/(?:unmerge|break\s+apart|split)\s+cells?\s+([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i)) {
      const rangeMatch = lowerInput.match(/(?:unmerge|break\s+apart|split)\s+cells?\s+([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i);
      if (rangeMatch) {
        const range = `${rangeMatch[1].toUpperCase()}:${rangeMatch[2].toUpperCase()}`;
        return {
          intent: 'range_operation',
          action: 'unmerge_range',
          target: { type: 'range', identifier: range },
          parameters: { range, operation: 'unmerge' },
          confidence: 0.9,
          reasoning: 'Unmerge cells range operation'
        };
      }
    }

    if (lowerInput.match(/insert\s+cells?\s+(?:at\s+)?([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i)) {
      const rangeMatch = lowerInput.match(/insert\s+cells?\s+(?:at\s+)?([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i);
      if (rangeMatch) {
        const range = `${rangeMatch[1].toUpperCase()}:${rangeMatch[2].toUpperCase()}`;
        const shiftDir = lowerInput.includes('right') ? 'right' : 'down';
        return {
          intent: 'range_operation',
          action: 'insert_cells',
          target: { type: 'range', identifier: range },
          parameters: { range, operation: 'insert', shift: shiftDir },
          confidence: 0.85,
          reasoning: 'Insert cells range operation'
        };
      }
    }

    if (lowerInput.match(/delete\s+cells?\s+([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i)) {
      const rangeMatch = lowerInput.match(/delete\s+cells?\s+([a-z]\d+)\s+(?:to|through|-)\s+([a-z]\d+)/i);
      if (rangeMatch) {
        const range = `${rangeMatch[1].toUpperCase()}:${rangeMatch[2].toUpperCase()}`;
        const shiftDir = lowerInput.includes('left') ? 'left' : 'up';
        return {
          intent: 'range_operation',
          action: 'delete_cells',
          target: { type: 'range', identifier: range },
          parameters: { range, operation: 'delete', shift: shiftDir },
          confidence: 0.85,
          reasoning: 'Delete cells range operation'
        };
      }
    }

    // Column operations (insert/delete/hide/show)
    if (lowerInput.match(/insert\s+(?:a\s+)?(?:new\s+)?column/) || lowerInput.match(/add\s+(?:a\s+)?(?:new\s+)?column/)) {
      const posMatch = lowerInput.match(/(?:at\s+)?(?:position\s+)?([a-z])|(?:before|after)\s+(?:column\s+)?([a-z])/i);
      const colLetter = posMatch ? (posMatch[1] || posMatch[2])?.toUpperCase() : 'A';
      return {
        intent: 'column_operation',
        action: 'insert_column',
        target: { type: 'column', identifier: colLetter },
        parameters: { column: colLetter, operation: 'insert' },
        confidence: 0.9,
        reasoning: 'Column insertion request'
      };
    }

    // ⚠️ REMOVED: Multi-column patterns moved to classifyCommand() for priority checking
    // (See lines 49-115 in classifyCommand method)

    // Single column deletion (fallback for simple cases)
    if (lowerInput.match(/delete\s+column\s+([a-z])/i) || lowerInput.match(/remove\s+column\s+([a-z])/i)) {
      const colMatch = lowerInput.match(/(?:delete|remove)\s+column\s+([a-z])/i);
      if (colMatch) {
        return {
          intent: 'column_operation',
          action: 'delete_column',
          target: { type: 'column', identifier: colMatch[1].toUpperCase() },
          parameters: { column: colMatch[1].toUpperCase(), operation: 'delete' },
          confidence: 0.95,
          reasoning: 'Column deletion by letter'
        };
      }
    }

    if (lowerInput.match(/hide\s+columns?\s+([a-z])\s+(?:to|through|-)\s+([a-z])/i)) {
      const colMatch = lowerInput.match(/hide\s+columns?\s+([a-z])\s+(?:to|through|-)\s+([a-z])/i);
      if (colMatch) {
        return {
          intent: 'column_operation',
          action: 'hide_columns',
          target: { type: 'column', identifier: `${colMatch[1].toUpperCase()}-${colMatch[2].toUpperCase()}` },
          parameters: { start_column: colMatch[1].toUpperCase(), end_column: colMatch[2].toUpperCase(), operation: 'hide' },
          confidence: 0.9,
          reasoning: 'Hide columns request'
        };
      }
    }

    if (lowerInput.match(/(?:show|unhide)\s+(?:all\s+)?(?:hidden\s+)?columns?/i)) {
      return {
        intent: 'column_operation',
        action: 'show_columns',
        target: { type: 'column', identifier: '*' },
        parameters: { operation: 'show' },
        confidence: 0.95,
        reasoning: 'Show/unhide columns request'
      };
    }

    // Freeze operation patterns
    if (lowerInput.match(/freeze\s+(?:the\s+)?(?:first\s+)?(?:\d+\s+)?rows?/)) {
      return {
        intent: 'freeze_operation',
        action: 'freeze_horizontal',
        target: { type: 'row', identifier: '1' },
        parameters: { freeze_type: 'horizontal', row: 1 },
        confidence: 0.9,
        reasoning: 'Freeze rows request'
      };
    }
    
    if (lowerInput.match(/freeze\s+(?:the\s+)?(?:first\s+)?(?:\d+\s+)?columns?/)) {
      return {
        intent: 'freeze_operation',
        action: 'freeze_vertical',
        target: { type: 'column', identifier: 'A' },
        parameters: { freeze_type: 'vertical', column: 'A' },
        confidence: 0.9,
        reasoning: 'Freeze columns request'
      };
    }
    
    if (lowerInput.match(/unfreeze|cancel\s+freeze|remove\s+freeze/)) {
      return {
        intent: 'freeze_operation',
        action: 'unfreeze_panes',
        target: { type: 'all_data', identifier: '*' },
        parameters: { freeze_type: 'none', operation: 'unfreeze' },
        confidence: 0.95,
        reasoning: 'Unfreeze panes request'
      };
    }
    
    // Value-based filtering patterns
    if (lowerInput.match(/show\s+only.*(?:where|equals?|=)/i) || lowerInput.match(/filter.*(?:for|equals?|contains?|=)/i) || lowerInput.match(/filter\s+column/i)) {
      // Try to extract column and value
      const showOnlyMatch = lowerInput.match(/show\s+only.*?(?:where\s+)?(\w+)\s+(?:equals?|=|is)\s+(\w+)/i);
      const filterMatch = lowerInput.match(/filter\s+(\w+)\s+(?:for|equals?|contains?|=)\s+(\w+)/i);
      const simpleMatch = lowerInput.match(/show\s+only\s+(\w+)\s+(\w+)/i);
      const columnValueMatch = lowerInput.match(/filter\s+column\s+([a-z0-9]+)\s+with\s+value\s+(\w+)/i);
      
      let column = '';
      let value = '';
      let comparison = 'equals';
      
      if (showOnlyMatch) {
        column = showOnlyMatch[1];
        value = showOnlyMatch[2];
      } else if (filterMatch) {
        column = filterMatch[1];
        value = filterMatch[2];
        comparison = lowerInput.includes('contains') ? 'contains' : 'equals';
      } else if (simpleMatch) {
        column = simpleMatch[1];
        value = simpleMatch[2];
      } else if (columnValueMatch) {
        column = columnValueMatch[1];
        value = columnValueMatch[2];
        comparison = 'equals';
      }
      
      if (column && value) {
        return {
          intent: 'filter',
          action: 'filter_value_based',
          target: { type: 'column', identifier: column },
          parameters: { column, value, comparison, operation: 'filter' },
          confidence: 0.85,
          reasoning: 'Value-based filtering request'
        };
      }
    }
    
    // Clear filters patterns  
    if (lowerInput.match(/show\s+all\s+rows|clear\s+filters?|remove\s+filters?|reset\s+filters?/i)) {
      return {
        intent: 'filter',
        action: 'clear_filters',
        target: { type: 'all_data', identifier: '*' },
        parameters: { operation: 'clear' },
        confidence: 0.9,
        reasoning: 'Clear filters request'
      };
    }
    
    // General query patterns (analysis, questions, charts)
    if (lowerInput.includes('analyze') || lowerInput.includes('chart') || lowerInput.includes('graph') || 
        lowerInput.includes('trend') || lowerInput.includes('insight') || lowerInput.match(/show\s+me|tell\s+me|what/)) {
      return {
        intent: 'general_query',
        action: 'analyze_data',
        target: { type: 'all_data', identifier: '*' },
        parameters: { query_type: 'analysis' },
        confidence: 0.8,
        reasoning: 'Data analysis or visualization request'
      };
    }
    
    // Default: unknown with low confidence
    return {
      intent: 'unknown',
      action: 'unknown',
      target: { type: 'all_data', identifier: '*' },
      parameters: {},
      confidence: 0.3,
      reasoning: 'No clear pattern matched'
    };
  }

  /**
   * Build structured prompt for LLM classification
   */
  private buildClassificationPrompt(userInput: string): string {
    return `You are a spreadsheet command classifier. Output STRICT JSON matching the schema below. Infer the user's intent even for colloquial phrasing.

User Command: "${userInput}"

INTENTS
- conditional_format: visual highlighting/coloring (highlight, color, mark, shade)
- data_modification: destructive changes to DATA CONTENT (remove rows, delete values, change cell content)
- filter: show/hide rows or enable/disable filters
- sort: reorder data by columns
- column_operation: STRUCTURAL column changes (resize columns, delete columns, add columns, column formatting)
- row_operation: STRUCTURAL row changes (insert rows, delete rows, hide rows, show rows, row height)
- cell_operation: individual cell operations (set cell value, clear cell, format cell, delete cell)
- range_operation: range-level operations (merge cells, clear range, insert range, delete range)
- freeze_operation: freeze/unfreeze panes (freeze rows/columns, unfreeze)
- hyperlink_operation: add/remove/get hyperlinks on cells (add link, set link, remove link, show link)
- data_validation: add/remove validation rules on cells/ranges (dropdown, number range, date validation)
- comment_operation: add/remove/get comments/notes on cells (add note, remove note, show note)
- image_operation: insert images or create drawings (insert image, create rectangle, create circle)
- intelligent_analysis: automated data insights (show what matters, analyze data, detect anomalies)
- smart_format: apply professional formatting (auto-format, format as financial report, make professional)
- general_query: analysis, charts, insights, questions

CRITICAL DISAMBIGUATION RULES
- "highlight" → conditional_format
- "delete/remove COLUMNS" → column_operation (structural change)
- "delete/remove ROWS" → row_operation (structural change)
- "delete/remove DATA/VALUES" → data_modification (content change)
- "insert/add ROWS" → row_operation
- "insert/add COLUMNS" → column_operation
- "hide/show ROWS" → row_operation
- "hide/show COLUMNS" → column_operation
- "set/change CELL value" → cell_operation
- "add/set/create LINK/HYPERLINK" → hyperlink_operation (NOT cell_operation)
- "add/set VALIDATION/DROPDOWN" → data_validation (NOT cell_operation)
- "add/set NOTE/COMMENT" → comment_operation (NOT cell_operation)
- "insert/add IMAGE/DRAWING" → image_operation (NOT cell_operation)
- "merge cells/range" → range_operation
- "freeze/unfreeze" → freeze_operation
- "format/auto-format THIS/DATA/SHEET" → smart_format (NOT conditional_format)
- "format as financial report" → smart_format with template='financial'
- "make professional" → smart_format with template='professional'
- "filter/show only/display only" → filter
- STRUCTURAL changes (rows/columns/layout) vs CONTENT changes (data values)

SCHEMA
{
  "intent": "conditional_format|data_modification|filter|sort|column_operation|row_operation|cell_operation|range_operation|freeze_operation|hyperlink_operation|data_validation|comment_operation|image_operation|general_query|unknown",
  "action": "string",
  "target": { "type": "cell|column|row|range|all_data|specific_value", "identifier": "string" },
  "parameters": { "condition?": "string", "value?": "string|number", "column?": "string", "row?": "string|number", "direction?": "asc|desc", "scope?": "all|column|range", "filter_type?": "exact|contains", "action?": "open|close", "height?": "number", "width?": "number", "freeze_type?": "horizontal|vertical|both", "url?": "string", "label?": "string", "values?": "string", "min?": "number", "max?": "number", "note?": "string", "image_url?": "string", "shape?": "string" },
  "confidence": 0.0-1.0,
  "reasoning": "string"
}

FEW-SHOT EXAMPLES
1) Duplicate highlighting (all data)
Input: "highlight all duplicates"
Output: {"intent":"conditional_format","action":"highlight_duplicates","target":{"type":"all_data","identifier":"*"},"parameters":{"condition":"duplicates","scope":"all"},"confidence":0.95}

2) Duplicate highlighting (column letter)
Input: "highlight duplicates in column A"
Output: {"intent":"conditional_format","action":"highlight_duplicates","target":{"type":"column","identifier":"A"},"parameters":{"condition":"duplicates","scope":"column","column":"A"},"confidence":0.95}

3) Duplicate highlighting (named column)
Input: "highlight duplicate cells in the Price column"
Output: {"intent":"conditional_format","action":"highlight_duplicates","target":{"type":"column","identifier":"Price"},"parameters":{"condition":"duplicates","scope":"column","column":"Price"},"confidence":0.95}

4) Numeric conditional formatting
Input: "highlight values greater than 50 in the Price column"
Output: {"intent":"conditional_format","action":"highlight_greater_than","target":{"type":"column","identifier":"Price"},"parameters":{"condition":"greater_than","value":50,"scope":"column","column":"Price"},"confidence":0.9}

5) Clear filters (colloquial)
Input: "get rid of the filter"
Output: {"intent":"filter","action":"clear_filters","target":{"type":"all_data","identifier":"*"},"parameters":{"action":"close"},"confidence":0.9}

6) Open/enable filters (colloquial)
Input: "put on a filter"
Output: {"intent":"filter","action":"open_filters","target":{"type":"all_data","identifier":"*"},"parameters":{"action":"open"},"confidence":0.85}

7) Filter exact match
Input: "filter Status equals Complete"
Output: {"intent":"filter","action":"filter_column","target":{"type":"column","identifier":"Status"},"parameters":{"filter_value":"Complete","filter_type":"exact"},"confidence":0.9}

8) Filter contains
Input: "show only rows where Status contains \"Complete\""
Output: {"intent":"filter","action":"filter_column","target":{"type":"column","identifier":"Status"},"parameters":{"filter_value":"Complete","filter_type":"contains"},"confidence":0.9}

9) Sort by name ascending
Input: "sort by Name ascending"
Output: {"intent":"sort","action":"sort_by_column","target":{"type":"column","identifier":"Name"},"parameters":{"direction":"asc"},"confidence":0.9}

10) Sort by column letter descending
Input: "sort column C Z-A"
Output: {"intent":"sort","action":"sort_by_column","target":{"type":"column","identifier":"C"},"parameters":{"direction":"desc"},"confidence":0.9}

11) Column resize (widen)
Input: "make Price column wider"
Output: {"intent":"column_operation","action":"resize_column","target":{"type":"column","identifier":"Price"},"parameters":{"operation":"widen"},"confidence":0.9}

12) Column resize (narrow)
Input: "set column A narrower"
Output: {"intent":"column_operation","action":"resize_column","target":{"type":"column","identifier":"A"},"parameters":{"operation":"narrow"},"confidence":0.9}

13) Delete columns by name
Input: "delete all columns named Zscore"
Output: {"intent":"column_operation","action":"delete_columns","target":{"type":"column","identifier":"Zscore"},"parameters":{"column_name":"Zscore","operation":"delete"},"confidence":0.9}

14) Delete specific column by letter
Input: "delete column B"
Output: {"intent":"column_operation","action":"delete_columns","target":{"type":"column","identifier":"B"},"parameters":{"column":"B","operation":"delete"},"confidence":0.9}

15) Delete columns (STRUCTURAL - always column_operation)
Input: "can you delete all columns named Zscore"
Output: {"intent":"column_operation","action":"delete_columns","target":{"type":"column","identifier":"Zscore"},"parameters":{"column_name":"Zscore","operation":"delete"},"confidence":0.95}

16) Remove duplicates (DATA CONTENT - data_modification)
Input: "remove duplicate rows"
Output: {"intent":"data_modification","action":"remove_duplicates","target":{"type":"all_data","identifier":"*"},"parameters":{"operation":"remove","condition":"duplicates"},"confidence":0.95}

17) General analysis
Input: "show me sales trends"
Output: {"intent":"general_query","action":"analyze_data","target":{"type":"all_data","identifier":"*"},"parameters":{"query_type":"analysis"},"confidence":0.8}

18) Delete row by number
Input: "delete row 5"
Output: {"intent":"row_operation","action":"delete_row","target":{"type":"row","identifier":"5"},"parameters":{"row":5,"operation":"delete"},"confidence":0.95}

19) Insert row
Input: "insert a new row at position 3"
Output: {"intent":"row_operation","action":"insert_row","target":{"type":"row","identifier":"3"},"parameters":{"row":3,"operation":"insert"},"confidence":0.9}

20) Hide rows
Input: "hide rows 2 to 5"
Output: {"intent":"row_operation","action":"hide_rows","target":{"type":"row","identifier":"2-5"},"parameters":{"start_row":2,"end_row":5,"operation":"hide"},"confidence":0.9}

21) Show/unhide rows
Input: "show hidden rows 3 to 6"
Output: {"intent":"row_operation","action":"show_rows","target":{"type":"row","identifier":"3-6"},"parameters":{"start_row":3,"end_row":6,"operation":"show"},"confidence":0.9}

22) Set row height
Input: "make row 2 taller"
Output: {"intent":"row_operation","action":"set_row_height","target":{"type":"row","identifier":"2"},"parameters":{"row":2,"height":30,"operation":"resize"},"confidence":0.85}

23) Set cell value
Input: "set cell B3 to 100"
Output: {"intent":"cell_operation","action":"set_cell_value","target":{"type":"cell","identifier":"B3"},"parameters":{"row":2,"column":1,"value":"100"},"confidence":0.95}

24) Clear cell
Input: "clear cell A1"
Output: {"intent":"cell_operation","action":"clear_cell","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0,"operation":"clear"},"confidence":0.95}

25) Format cell
Input: "make cell C2 bold"
Output: {"intent":"cell_operation","action":"format_cell","target":{"type":"cell","identifier":"C2"},"parameters":{"row":1,"column":2,"format":"bold"},"confidence":0.9}

26) Merge cells
Input: "merge cells A1 to C3"
Output: {"intent":"range_operation","action":"merge_range","target":{"type":"range","identifier":"A1:C3"},"parameters":{"range":"A1:C3","operation":"merge"},"confidence":0.9}

27) Clear range
Input: "clear range B2 to D5"
Output: {"intent":"range_operation","action":"clear_range","target":{"type":"range","identifier":"B2:D5"},"parameters":{"range":"B2:D5","operation":"clear"},"confidence":0.9}

28) Freeze rows
Input: "freeze the first row"
Output: {"intent":"freeze_operation","action":"freeze_horizontal","target":{"type":"row","identifier":"1"},"parameters":{"freeze_type":"horizontal","row":1},"confidence":0.9}

29) Freeze columns
Input: "freeze column A"
Output: {"intent":"freeze_operation","action":"freeze_vertical","target":{"type":"column","identifier":"A"},"parameters":{"freeze_type":"vertical","column":"A"},"confidence":0.9}

30) Unfreeze panes
Input: "unfreeze the spreadsheet"
Output: {"intent":"freeze_operation","action":"unfreeze_panes","target":{"type":"all_data","identifier":"*"},"parameters":{"freeze_type":"none","operation":"unfreeze"},"confidence":0.95}

31) Value-based filtering (exact match)
Input: "show only rows where Status equals Complete"
Output: {"intent":"filter","action":"filter_value_based","target":{"type":"column","identifier":"Status"},"parameters":{"column":"Status","value":"Complete","comparison":"equals","operation":"filter"},"confidence":0.95}

32) Value-based filtering (contains)
Input: "filter Name contains John"
Output: {"intent":"filter","action":"filter_value_based","target":{"type":"column","identifier":"Name"},"parameters":{"column":"Name","value":"John","comparison":"contains","operation":"filter"},"confidence":0.9}

33) Simple value filtering
Input: "show only Priority High"
Output: {"intent":"filter","action":"filter_value_based","target":{"type":"column","identifier":"Priority"},"parameters":{"column":"Priority","value":"High","comparison":"equals","operation":"filter"},"confidence":0.9}

34) Clear filters
Input: "show all rows"
Output: {"intent":"filter","action":"clear_filters","target":{"type":"all_data","identifier":"*"},"parameters":{"operation":"clear"},"confidence":0.95}

35) Unhide all rows
Input: "unhide all rows"
Output: {"intent":"row_operation","action":"show_rows","target":{"type":"row","identifier":"*"},"parameters":{"operation":"show"},"confidence":0.95}

36) Remove filters
Input: "clear filters"
Output: {"intent":"filter","action":"clear_filters","target":{"type":"all_data","identifier":"*"},"parameters":{"operation":"clear"},"confidence":0.95}

37) Filter column by letter with value
Input: "filter column J with value Action"
Output: {"intent":"filter","action":"filter_value_based","target":{"type":"column","identifier":"J"},"parameters":{"column":"J","value":"Action","comparison":"equals","operation":"filter"},"confidence":0.9}

38) Filter specific column with specific value
Input: "filter column A with value Complete"
Output: {"intent":"filter","action":"filter_value_based","target":{"type":"column","identifier":"A"},"parameters":{"column":"A","value":"Complete","comparison":"equals","operation":"filter"},"confidence":0.9}

39) Add hyperlink to cell
Input: "add link to A1 pointing to https://google.com"
Output: {"intent":"hyperlink_operation","action":"add_hyperlink","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0,"url":"https://google.com"},"confidence":0.95}

40) Add hyperlink with custom label
Input: "set hyperlink at B5 with text 'Click here' pointing to https://github.com"
Output: {"intent":"hyperlink_operation","action":"add_hyperlink_with_label","target":{"type":"cell","identifier":"B5"},"parameters":{"row":4,"column":1,"url":"https://github.com","label":"Click here"},"confidence":0.93}

41) Remove hyperlink
Input: "remove hyperlink from A1"
Output: {"intent":"hyperlink_operation","action":"remove_hyperlink","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0},"confidence":0.91}

42) Get hyperlink
Input: "show link at A1"
Output: {"intent":"hyperlink_operation","action":"get_hyperlink","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0},"confidence":0.90}

43) Add dropdown validation
Input: "add validation on A1:A10 with dropdown values: Red, Green, Blue"
Output: {"intent":"data_validation","action":"add_dropdown_validation","target":{"type":"range","identifier":"A1:A10"},"parameters":{"values":"Red, Green, Blue","validation_type":"dropdown"},"confidence":0.92}

44) Add number range validation
Input: "set validation on B1:B5 for numbers between 1 and 100"
Output: {"intent":"data_validation","action":"add_number_range_validation","target":{"type":"range","identifier":"B1:B5"},"parameters":{"min":1,"max":100,"validation_type":"number_range"},"confidence":0.93}

45) Add date validation
Input: "add validation on C1:C5 for dates"
Output: {"intent":"data_validation","action":"add_date_validation","target":{"type":"range","identifier":"C1:C5"},"parameters":{"validation_type":"date"},"confidence":0.91}

46) Remove validation
Input: "remove validation from A1:A10"
Output: {"intent":"data_validation","action":"remove_validation","target":{"type":"range","identifier":"A1:A10"},"parameters":{},"confidence":0.90}

47) Add note/comment to cell
Input: "add note to A1: This is a test note"
Output: {"intent":"comment_operation","action":"add_note","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0,"note":"This is a test note"},"confidence":0.92}

48) Get note from cell
Input: "show note at A1"
Output: {"intent":"comment_operation","action":"get_note","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0},"confidence":0.90}

49) Remove note from cell
Input: "remove note from A1"
Output: {"intent":"comment_operation","action":"remove_note","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0},"confidence":0.91}

50) Insert image from URL
Input: "insert image at A1 from url https://picsum.photos/200/300"
Output: {"intent":"image_operation","action":"insert_image","target":{"type":"cell","identifier":"A1"},"parameters":{"row":0,"column":0,"image_url":"https://picsum.photos/200/300"},"confidence":0.92}

51) Create rectangle drawing
Input: "create rectangle at B5"
Output: {"intent":"image_operation","action":"create_drawing","target":{"type":"cell","identifier":"B5"},"parameters":{"row":4,"column":1,"shape":"rectangle"},"confidence":0.90}

52) Create circle drawing
Input: "add circle in C10"
Output: {"intent":"image_operation","action":"create_drawing","target":{"type":"cell","identifier":"C10"},"parameters":{"row":9,"column":2,"shape":"circle"},"confidence":0.90}

53) Create named range
Input: "create a named range called Sales from A1 to D10"
Output: {"intent":"named_range_operation","action":"create_named_range","target":{"type":"range","identifier":"A1:D10"},"parameters":{"name":"Sales","range":"A1:D10"},"confidence":0.95}

54) Delete named range
Input: "delete the named range Sales"
Output: {"intent":"named_range_operation","action":"delete_named_range","target":{"type":"range","identifier":"Sales"},"parameters":{"name":"Sales"},"confidence":0.93}

55) List named ranges
Input: "show all named ranges"
Output: {"intent":"named_range_operation","action":"list_named_ranges","target":{"type":"all_data","identifier":"*"},"parameters":{},"confidence":0.92}

56) Rename named range
Input: "rename named range Sales to Revenue"
Output: {"intent":"named_range_operation","action":"rename_named_range","target":{"type":"range","identifier":"Sales"},"parameters":{"oldName":"Sales","newName":"Revenue"},"confidence":0.90}

57) Update named range
Input: "update named range Sales to A1:E10"
Output: {"intent":"named_range_operation","action":"update_named_range","target":{"type":"range","identifier":"Sales"},"parameters":{"name":"Sales","newRange":"A1:E10"},"confidence":0.89}

58) Smart auto-format (professional)
Input: "format this data professionally"
Output: {"intent":"smart_format","action":"auto_format","target":{"type":"all_data","identifier":"*"},"parameters":{"template":"professional"},"confidence":0.95}

59) Smart auto-format (financial)
Input: "make this look like a financial report"
Output: {"intent":"smart_format","action":"auto_format","target":{"type":"all_data","identifier":"*"},"parameters":{"template":"financial"},"confidence":0.95}

60) Smart auto-format (minimal)
Input: "apply clean minimal formatting"
Output: {"intent":"smart_format","action":"auto_format","target":{"type":"all_data","identifier":"*"},"parameters":{"template":"minimal"},"confidence":0.9}

61) Add single row with data
Input: "add a row with Product: iPhone, Price: 999, Quantity: 5"
Output: {"intent":"data_entry","action":"add_single_row","target":{"type":"row","identifier":"bottom"},"parameters":{"row_data_string":"Product: iPhone, Price: 999, Quantity: 5","position":"bottom","operation":"insert_row"},"confidence":0.95}

62) Generate multiple sample rows
Input: "add 10 sample customers with names and emails"
Output: {"intent":"data_entry","action":"generate_multiple_rows","target":{"type":"all_data","identifier":"*"},"parameters":{"count":10,"entity_type":"customers","fields_hint":"names and emails","operation":"generate_rows"},"confidence":0.9}

63) Create column headers
Input: "create headers: Date, Product, Quantity, Total"
Output: {"intent":"data_entry","action":"create_headers","target":{"type":"row","identifier":"0"},"parameters":{"headers":["Date","Product","Quantity","Total"],"operation":"create_headers"},"confidence":0.95}

Return ONLY JSON for the current input.`;
  }

  /**
   * Parse and validate LLM response
   */
  private parseClassificationResult(result: unknown): CommandClassification {
    try {
      // Handle case where result might be nested or contain extra text
      let parsed: Record<string, unknown> = (result ?? {}) as Record<string, unknown>;
      if (typeof result === 'string') {
        // Extract JSON from response if it contains other text
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        } else {
          parsed = JSON.parse(result) as Record<string, unknown>;
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('LLM response is not a valid object');
      }

      const targetData = (parsed.target ?? {}) as Partial<CommandClassification['target']>;
      const parameters = (parsed.parameters as Record<string, unknown>) || {};
      const confidenceVal = Number(parsed.confidence ?? 0.5);

      // Validate required fields and set defaults
      const classification: CommandClassification = {
        intent: (parsed.intent as CommandClassification['intent']) || 'unknown',
        action: (parsed.action as CommandClassification['action']) || 'unknown_action',
        target: {
          type: (targetData.type as CommandClassification['target']['type']) || 'all_data',
          identifier: targetData.identifier ? String(targetData.identifier) : '*'
        },
        parameters,
        confidence: Math.min(Math.max(Number.isFinite(confidenceVal) ? confidenceVal : 0.5, 0), 1), // Clamp between 0-1
        reasoning: (parsed.reasoning as string) || 'LLM classification'
      };

      console.log('🧠 LLM Classification result:', classification);
      return classification;

    } catch (error) {
      console.error('❌ Failed to parse LLM classification result:', error);
      throw new Error('Invalid LLM response format');
    }
  }

  /**
   * Regex-based fallback for common patterns
   */
  private classifyWithRegex(userInput: string): CommandClassification {
    const lowerInput = userInput.toLowerCase().trim();

    // COMPOUND OPERATIONS: Detect multiple operations in a single command
    // Examples: "delete column D and freeze first row", "insert column after B and make it bold"
    const compoundConjunctions = /\b(and then|then|and also|also|and)\b/i;
    if (compoundConjunctions.test(lowerInput)) {
      // Check if this is truly a compound operation vs. multiple targets for same operation
      // "delete column D and E" → same operation, multiple targets (handled by delete_columns_multiple)
      // "delete column D and freeze row 1" → different operations (compound)

      // Look for different operation keywords
      const hasMultipleOperations = (
        // Check for mix of different operation types
        (lowerInput.match(/\b(delete|remove|insert|add)\b/gi)?.length || 0) >= 1 &&
        (lowerInput.match(/\b(freeze|unfreeze)\b/gi)?.length || 0) >= 1
      ) || (
        (lowerInput.match(/\b(hide|show|unhide|display)\b/gi)?.length || 0) >= 1 &&
        (lowerInput.match(/\b(delete|remove|insert|add)\b/gi)?.length || 0) >= 1
      ) || (
        (lowerInput.match(/\b(bold|italic|color|highlight|format)\b/gi)?.length || 0) >= 1 &&
        (lowerInput.match(/\b(delete|remove|insert|add)\b/gi)?.length || 0) >= 1
      );

      if (hasMultipleOperations) {
        // Split on conjunctions
        const parts = userInput.split(compoundConjunctions).filter(p => p.trim().length > 0);

        // Clean up the parts (remove conjunction words that might be captured)
        const operations = parts.filter(p => !['and', 'then', 'also', 'and then', 'and also'].includes(p.trim().toLowerCase()));

        if (operations.length >= 2) {
          console.log('🎭 Detected compound operation with parts:', operations);
          return {
            intent: 'compound_operation',
            action: 'execute_multiple',
            target: { type: 'compound', identifier: 'multiple' },
            parameters: {
              operations: operations.map(op => op.trim()),
              count: operations.length
            },
            confidence: 0.85,
            reasoning: 'Compound operation with multiple distinct operations'
          };
        }
      }
    }

    // High-confidence regex patterns for common cases
    const patterns = [
      {
        pattern: /highlight\s+(?:all\s+)?(?:the\s+)?duplicates?\b/i,
        intent: 'conditional_format' as const,
        action: 'highlight_duplicates',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { condition: 'duplicates', scope: 'all' },
        confidence: 0.95
      },
      {
        pattern: /(?:remove|delete)\s+(?:all\s+)?(?:the\s+)?duplicates?\b/i,
        intent: 'data_modification' as const,
        action: 'remove_duplicates', 
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { operation: 'remove', condition: 'duplicates' },
        confidence: 0.95
      },
      {
        pattern: /(?:clear|remove|reset|turn off|disable|close|get rid of)\s+(?:all\s+)?(?:the\s+)?filters?/i,
        intent: 'filter' as const,
        action: 'clear_filters',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { action: 'close' },
        confidence: 0.9
      },
      {
        pattern: /(?:enable|turn on|open|apply|add|start|put on)\s+(?:a\s+)?(?:the\s+)?filters?/i,
        intent: 'filter' as const,
        action: 'open_filters',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { action: 'open' },
        confidence: 0.85
      },
      {
        pattern: /highlight\s+(?:all\s+)?(?:cells?|values?)\s+(?:that\s+are\s+)?(?:greater\s+than|above|over|>)\s+([0-9.]+)/i,
        intent: 'conditional_format' as const,
        action: 'highlight_greater_than',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { condition: 'greater_than', value: 'extracted' },
        confidence: 0.9
      },
      {
        pattern: /highlight\s+(?:all\s+)?(?:the\s+)?(?:unique|distinct)\s+(?:values?|cells?)/i,
        intent: 'conditional_format' as const,
        action: 'highlight_unique',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { condition: 'unique' },
        confidence: 0.9
      },
      {
        pattern: /highlight\s+(?:cells?|values?)\s+(?:that\s+)?(?:contain|include|with|having)\s+['"]?([^'"]+)['"]?/i,
        intent: 'conditional_format' as const,
        action: 'highlight_contains',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { condition: 'contains', text: 'extracted' },
        confidence: 0.9
      },
      {
        pattern: /highlight\s+(?:cells?|values?)\s+(?:that\s+are\s+)?(?:less\s+than|below|under|<)\s+([0-9.]+)/i,
        intent: 'conditional_format' as const,
        action: 'highlight_less_than',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { condition: 'less_than', value: 'extracted' },
        confidence: 0.9
      },
      {
        pattern: /highlight\s+(?:cells?|values?)\s+(?:that\s+)?(?:equal|=|are)\s+([0-9.]+)/i,
        intent: 'conditional_format' as const,
        action: 'highlight_equals',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: { condition: 'equals', value: 'extracted' },
        confidence: 0.9
      },
      {
        pattern: /(?:make|set|adjust)\s+(?:the\s+)?(.+?)\s+column\s+(?:wider|bigger|larger)/i,
        intent: 'column_operation' as const,
        action: 'resize_column',
        target: { type: 'column' as const, identifier: 'extracted' },
        parameters: { operation: 'widen' },
        confidence: 0.9
      },
      {
        pattern: /(?:filter|show\s+only)\s+(.+?)\s+(?:for|=|equals?)\s+(.+)/i,
        intent: 'filter' as const,
        action: 'filter_column',
        target: { type: 'column' as const, identifier: 'extracted' },
        parameters: { filter_value: 'extracted' },
        confidence: 0.85
      },
      // ========== HYPERLINK PATTERNS ==========
      {
        pattern: /(?:add|set|create|insert)\s+(?:a\s+)?(?:hyper)?link\s+(?:to|on|at|in)\s+(?:cell\s+)?([A-Z]\d+)(?:\s+(?:pointing|linking)\s+to)?(?:\s+url)?[:\s]+(.+)/i,
        intent: 'hyperlink_operation' as const,
        action: 'add_hyperlink',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: { url: 'extracted' },
        confidence: 0.92
      },
      {
        pattern: /(?:add|set)\s+(?:hyper)?link\s+(?:to|at)\s+([A-Z]\d+)\s+with\s+(?:text|label)\s+["\']([^"\']+)["\']\s+(?:pointing|linking)\s+to\s+(.+)/i,
        intent: 'hyperlink_operation' as const,
        action: 'add_hyperlink_with_label',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: { label: 'extracted', url: 'extracted' },
        confidence: 0.93
      },
      {
        pattern: /(?:remove|delete|clear)\s+(?:the\s+)?(?:hyper)?link\s+(?:from|at|in)\s+(?:cell\s+)?([A-Z]\d+)/i,
        intent: 'hyperlink_operation' as const,
        action: 'remove_hyperlink',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: {},
        confidence: 0.91
      },
      {
        pattern: /(?:get|show|what(?:'s|\s+is))\s+(?:the\s+)?(?:hyper)?link\s+(?:from|at|in)\s+(?:cell\s+)?([A-Z]\d+)/i,
        intent: 'hyperlink_operation' as const,
        action: 'get_hyperlink',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: {},
        confidence: 0.90
      },
      // ========== DATA VALIDATION PATTERNS ==========
      {
        pattern: /(?:add|set|create)\s+(?:data\s+)?validation\s+(?:on|to|for)\s+(?:range\s+)?([A-Z]\d+(?::[A-Z]\d+)?)\s+(?:with\s+)?(?:dropdown|list)\s+(?:values?|options?)(?:\s+of)?[:\s]*(.+)/i,
        intent: 'data_validation' as const,
        action: 'add_dropdown_validation',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: { values: 'extracted' },
        confidence: 0.92
      },
      {
        pattern: /(?:add|set)\s+(?:data\s+)?validation\s+(?:on|to)\s+([A-Z]\d+(?::[A-Z]\d+)?)\s+(?:for\s+)?numbers?\s+between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/i,
        intent: 'data_validation' as const,
        action: 'add_number_range_validation',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: { min: 'extracted', max: 'extracted' },
        confidence: 0.93
      },
      {
        pattern: /(?:add|set)\s+(?:data\s+)?validation\s+(?:on|to)\s+([A-Z]\d+(?::[A-Z]\d+)?)\s+(?:for\s+)?dates?/i,
        intent: 'data_validation' as const,
        action: 'add_date_validation',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: {},
        confidence: 0.91
      },
      {
        pattern: /(?:remove|clear|delete)\s+(?:data\s+)?validation\s+(?:from|on)\s+([A-Z]\d+(?::[A-Z]\d+)?)/i,
        intent: 'data_validation' as const,
        action: 'remove_validation',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: {},
        confidence: 0.90
      },
      // ========== COMMENT/NOTE PATTERNS ==========
      {
        pattern: /(?:add|set|create|insert)\s+(?:a\s+)?(?:note|comment)\s+(?:to|on|at|in)\s+(?:cell\s+)?([A-Z]\d+)(?:\s+(?:saying|with\s+text|that\s+says))?[:\s]+["']?(.+?)["']?$/i,
        intent: 'comment_operation' as const,
        action: 'add_note',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: { text: 'extracted' },
        confidence: 0.92
      },
      {
        pattern: /(?:get|show|what(?:'s|\s+is))\s+(?:the\s+)?(?:note|comment)\s+(?:from|at|in|on)\s+(?:cell\s+)?([A-Z]\d+)/i,
        intent: 'comment_operation' as const,
        action: 'get_note',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: {},
        confidence: 0.91
      },
      {
        pattern: /(?:remove|delete|clear)\s+(?:the\s+)?(?:note|comment)\s+(?:from|at|in|on)\s+(?:cell\s+)?([A-Z]\d+)/i,
        intent: 'comment_operation' as const,
        action: 'remove_note',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: {},
        confidence: 0.90
      },
      // ========== IMAGE/DRAWING PATTERNS ==========
      {
        pattern: /(?:insert|add|place)\s+(?:an?\s+)?image\s+(?:at|in|to)\s+(?:cell\s+)?([A-Z]\d+)\s+(?:from\s+)?(?:url\s+)?[:\s]*(.+)/i,
        intent: 'image_operation' as const,
        action: 'insert_image',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: { imageUrl: 'extracted' },
        confidence: 0.91
      },
      {
        pattern: /(?:insert|add|create)\s+(?:a\s+)?(rectangle|circle|line|shape)\s+(?:at|in)\s+(?:cell\s+)?([A-Z]\d+)/i,
        intent: 'image_operation' as const,
        action: 'create_drawing',
        target: { type: 'cell' as const, identifier: 'extracted' },
        parameters: { shapeType: 'extracted' },
        confidence: 0.88
      },
      // Named Range Operations
      {
        pattern: /(?:create|add|make|define)\s+(?:a\s+)?(?:named\s+)?range\s+(?:called\s+|named\s+)?['"]?(\w+)['"]?\s+(?:from|for)\s+(?:cells?\s+)?([A-Z]+\d+(?::[A-Z]+\d+)?)/i,
        intent: 'named_range_operation' as const,
        action: 'create_named_range',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: { name: 'extracted', range: 'extracted' },
        confidence: 0.95
      },
      {
        pattern: /(?:delete|remove)\s+(?:the\s+)?(?:named\s+)?range\s+['"]?(\w+)['"]?/i,
        intent: 'named_range_operation' as const,
        action: 'delete_named_range',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: { name: 'extracted' },
        confidence: 0.93
      },
      {
        pattern: /(?:list|show|display)\s+(?:all\s+)?(?:named\s+)?ranges?/i,
        intent: 'named_range_operation' as const,
        action: 'list_named_ranges',
        target: { type: 'all_data' as const, identifier: '*' },
        parameters: {},
        confidence: 0.92
      },
      {
        pattern: /(?:rename|change)\s+(?:named\s+)?range\s+['"]?(\w+)['"]?\s+to\s+['"]?(\w+)['"]?/i,
        intent: 'named_range_operation' as const,
        action: 'rename_named_range',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: { oldName: 'extracted', newName: 'extracted' },
        confidence: 0.90
      },
      {
        pattern: /(?:update|modify|change)\s+(?:named\s+)?range\s+['"]?(\w+)['"]?\s+to\s+(?:cells?\s+)?([A-Z]+\d+(?::[A-Z]+\d+)?)/i,
        intent: 'named_range_operation' as const,
        action: 'update_named_range',
        target: { type: 'range' as const, identifier: 'extracted' },
        parameters: { name: 'extracted', newRange: 'extracted' },
        confidence: 0.89
      }
    ];

    // Try each pattern
    for (const patternObj of patterns) {
      const match = userInput.match(patternObj.pattern);

      if (match) {
        console.log('🔧 Regex pattern matched:', patternObj.pattern);
        
        // Extract dynamic values from regex groups
        const result = { ...patternObj };
        if (match[1] && result.parameters.value === 'extracted') {
          result.parameters.value = String(match[1]);
        }
        if (match[1] && result.parameters.text === 'extracted') {
          result.parameters.text = match[1].trim();
        }
        if (match[1] && result.target.identifier === 'extracted') {
          result.target.identifier = match[1].trim();
        }
        if (match[2] && result.parameters.filter_value === 'extracted') {
          result.parameters.filter_value = match[2].trim();
        }
        // Hyperlink pattern extractions
        if (match[2] && result.parameters.url === 'extracted' && result.action === 'add_hyperlink') {
          result.parameters.url = match[2].trim();
        }
        if (match[2] && result.parameters.label === 'extracted' && result.action === 'add_hyperlink_with_label') {
          result.parameters.label = match[2].trim();
        }
        if (match[3] && result.parameters.url === 'extracted' && result.action === 'add_hyperlink_with_label') {
          result.parameters.url = match[3].trim();
        }
        // Data validation pattern extractions
        if (match[2] && result.parameters.values === 'extracted' && result.action === 'add_dropdown_validation') {
          result.parameters.values = match[2].trim();
        }
        if (match[2] && result.parameters.min === 'extracted' && result.action === 'add_number_range_validation') {
          result.parameters.min = match[2].trim();
        }
        if (match[3] && result.parameters.max === 'extracted' && result.action === 'add_number_range_validation') {
          result.parameters.max = match[3].trim();
        }
        // Comment/note pattern extractions
        if (match[2] && result.parameters.text === 'extracted' && result.action === 'add_note') {
          result.parameters.text = match[2].trim();
        }
        // Image/drawing pattern extractions
        if (match[2] && result.parameters.imageUrl === 'extracted' && result.action === 'insert_image') {
          result.parameters.imageUrl = match[2].trim();
        }
        if (match[1] && result.parameters.shapeType === 'extracted' && result.action === 'create_drawing') {
          result.parameters.shapeType = match[1].toLowerCase();
        }
        // Named range pattern extractions
        if (match[1] && result.parameters.name === 'extracted' && result.action === 'create_named_range') {
          result.parameters.name = match[1].trim();
        }
        if (match[2] && result.parameters.range === 'extracted' && result.action === 'create_named_range') {
          result.parameters.range = match[2].trim().toUpperCase();
        }
        if (match[1] && result.parameters.name === 'extracted' && result.action === 'delete_named_range') {
          result.parameters.name = match[1].trim();
        }
        if (match[1] && result.parameters.oldName === 'extracted' && result.action === 'rename_named_range') {
          result.parameters.oldName = match[1].trim();
        }
        if (match[2] && result.parameters.newName === 'extracted' && result.action === 'rename_named_range') {
          result.parameters.newName = match[2].trim();
        }
        if (match[1] && result.parameters.name === 'extracted' && result.action === 'update_named_range') {
          result.parameters.name = match[1].trim();
        }
        if (match[2] && result.parameters.newRange === 'extracted' && result.action === 'update_named_range') {
          result.parameters.newRange = match[2].trim().toUpperCase();
        }

        return {
          intent: result.intent,
          action: result.action,
          target: result.target,
          parameters: result.parameters,
          confidence: result.confidence,
          reasoning: 'Regex pattern match'
        };
      }
    }

    // No pattern matched - return low confidence unknown
    console.log('❌ No regex patterns matched');
    return {
      intent: 'unknown',
      action: 'unknown',
      target: { type: 'all_data', identifier: '*' },
      parameters: {},
      confidence: 0.1,
      reasoning: 'No patterns matched'
    };
  }

  /**
   * Parse column-value pairs from natural language input.
   * Handles formats like:
   * - "Product: iPhone, Price: 999, Qty: 5"
   * - "Name=John, Age=25, City=NYC"
   * - "Title 'Manager', Department 'Sales'"
   *
   * @param input - String containing column-value pairs
   * @returns Record<string, unknown> - Parsed column-value object
   */
  parseColumnValuePairs(input: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Match patterns: "Column: Value" or "Column=Value" or "Column Value"
    // Supports multi-word column names and quoted values
    const pairRegex = /(\w+(?:\s+\w+)*)(?:\s*[:=]\s*|\s+)([^,]+?)(?=,|$)/gi;

    let match;
    while ((match = pairRegex.exec(input)) !== null) {
      const columnName = match[1].trim();
      let value: string | number | boolean | null = match[2].trim();

      // Remove quotes from strings (only if value is a string)
      if (typeof value === 'string') {
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Handle booleans BEFORE numeric conversion
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true') {
          value = true;
        } else if (lowerValue === 'false') {
          value = false;
        } else if (lowerValue === 'auto' || lowerValue === 'null' || lowerValue === 'empty') {
          // Handle special keywords
          value = null;
        } else if (/^-?\d+(\.\d+)?$/.test(value)) {
          // Auto-detect numeric values (only if not a boolean/keyword)
          value = parseFloat(value);
        }
      }

      result[columnName] = value;
    }

    return result;
  }

  /**
   * Clear the cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Extract find text from natural language
   */
  private extractFindText(input: string): string {
    // Pattern: "find X and replace" or "replace X with Y" or "search for X"
    const patterns = [
      /find\s+["']?([^"']+?)["']?\s+(?:and|with)/i,
      /replace\s+["']?([^"']+?)["']?\s+with/i,
      /search\s+(?:for\s+)?["']?([^"']+?)["']?\s+(?:and|with)/i
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1].trim();
    }
    return '';
  }

  /**
   * Extract replace text from natural language
   */
  private extractReplaceText(input: string): string {
    // Pattern: "replace with Y" or "change to Y"
    const patterns = [
      /(?:replace|change)\s+(?:with|to)\s+["']?([^"']+?)["']?$/i,
      /with\s+["']?([^"']+?)["']?$/i
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1].trim();
    }
    return '';
  }
}

// Export singleton instance
export const llmCommandClassifier = LLMCommandClassifier.getInstance();