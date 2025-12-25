/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Flexible Pattern Library for Natural Language Command Processing
 *
 * This library provides reusable, flexible regex components that can handle
 * natural language variations in user commands. Instead of rigid patterns,
 * these components can be combined to create robust command matching.
 */

// Core pattern components that can be mixed and matched
export const PATTERN_COMPONENTS = {
  // Action words - what the user wants to do
  actions: {
    highlight: '(?:highlight|color|mark|shade|paint|fill)',
    show: '(?:show|display|reveal|present|list)',
    filter: '(?:filter|keep|show|display|find|search)',
    sort: '(?:sort|order|arrange|organize)',
    modify: '(?:change|set|update|make|adjust|modify)',
    create: '(?:add|insert|create|new|generate)',
    remove: '(?:delete|remove|clear|erase|drop|eliminate)',
    format: '(?:format|style|bold|italic|underline)',
  },

  // Subjects - what is being acted upon
  subjects: {
    cells: '(?:cells?|values?|entries|items?|elements?|data)',
    rows: '(?:rows?|lines?|records?)',
    columns: '(?:columns?|cols?|fields?)',
    numbers: '(?:numbers?|values?|digits?|amounts?)',
    all: '(?:all\\s+)?(?:the\\s+)?',
  },

  // Connectors and modifiers
  connectors: {
    with: '(?:with|having|containing|that\\s+(?:have|contain))',
    that: '(?:that|which)\\s+(?:are|have|contain|equal|match)',
    where: '(?:where|when|if)',
    in: '(?:in|on|within|from|at)',
  },

  // Comparison operators for conditional formatting
  comparisons: {
    greater: '(?:greater\\s+than|above|over|more\\s+than|bigger\\s+than|larger\\s+than|>=|>)',
    less: '(?:less\\s+than|below|under|smaller\\s+than|fewer\\s+than|<=|<)',
    equal: '(?:equal\\s+to|equals?|is|matches?|same\\s+as|=)',
    between: '(?:between)',
    contains: '(?:contains?|includes?|has|with)',
  },

  // Location specifiers
  locations: {
    column: '(?:column\\s+)?([A-Za-z]+\\d*|[A-Za-z]+(?:\\s+[A-Za-z]+)*|\\w+(?:\\s+\\w+)*)',
    cell: '([A-Z]+\\d+)(?:\\s*(?:to|:|-|through)\\s*([A-Z]+\\d+))?',
    range: '([A-Z]+\\d+:[A-Z]+\\d+)',
  },

  // Common modifiers
  modifiers: {
    optional_all: '(?:all\\s+)?',
    optional_the: '(?:the\\s+)?',
    optional_values: '(?:values?\\s+)?',
    optional_data: '(?:data\\s+)?',
  },

  // Numbers and values
  values: {
    number: '([+-]?\\d*\\.?\\d+)',
    quoted_text: '(?:"([^"]+)"|\'([^\']+)\')',
    unquoted_text: '([^\\s"\']+)',
    any_value: '(?:"([^"]+)"|\'([^\']+)\'|([^\\s"\']+))',
  },

  // Direction and sorting
  direction: {
    ascending: '(?:ascending|asc|a-?z|up|upward|increasing)',
    descending: '(?:descending|desc|z-?a|down|downward|decreasing)',
  },

  // Size and appearance
  appearance: {
    wider: '(?:wider|bigger|larger|broader|increase|expand|stretch)',
    narrower: '(?:narrower|smaller|thinner|tighter|decrease|shrink|compress)',
    colors: '(?:red|blue|green|yellow|purple|orange|black|white|gray|grey|pink|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})',
  },
};

// Utility functions for building flexible patterns
export class FlexiblePatternBuilder {
  /**
   * Creates a flexible conditional formatting pattern
   * Handles variations like:
   * - "highlight all cells greater than 30"
   * - "color values with data above 50"
   * - "mark entries that have numbers over 100"
   * - "shade cells containing values between 10 and 20"
   */
  static conditionalFormatting(): RegExp {
    const { actions, subjects, connectors, comparisons, values, locations, modifiers } = PATTERN_COMPONENTS;
    
    return new RegExp([
      actions.highlight,                              // highlight|color|mark|shade
      '\\s+',
      modifiers.optional_all,                         // (all)?
      '(?:', subjects.cells, '\\s+)?',               // (cells|values|data)?
      '(?:', connectors.with, '\\s+)?',              // (with|having|containing)?
      modifiers.optional_values,                      // (values)?
      '(?:', connectors.that, '\\s+)?',              // (that are|which have)?
      '(',                                            // Capture group 1: comparison
        Object.values(comparisons).join('|'),
      ')',
      '\\s+',
      '(?:than\\s+)?',                               // optional "than"
      values.number,                                  // Capture group 2: first number
      '(?:\\s+and\\s+', values.number, ')?',        // Capture group 3: second number (for between)
      '(?:\\s+', connectors.in, '\\s+', locations.column, ')?', // Capture group 4: column
    ].join(''), 'i');
  }

  /**
   * Creates a flexible filter pattern
   * Handles variations like:
   * - "filter Status column for Complete"
   * - "show only rows where Name contains John"
   * - "keep entries with Priority equal to High"
   * - "display data having Category is Electronics"
   */
  static filtering(): RegExp {
    const { actions, subjects, connectors, comparisons, values, locations, modifiers } = PATTERN_COMPONENTS;
    
    return new RegExp([
      '(?:', actions.filter, '|', actions.show, ')',  // filter|show|display
      '\\s+',
      modifiers.optional_all,                         // (all)?
      '(?:', subjects.rows, '\\s+)?',                // (rows|data)?
      '(?:', connectors.where, '\\s+)?',             // (where|when)?
      modifiers.optional_the,                         // (the)?
      '(', locations.column, ')',                     // Capture group 1: column
      '\\s+',
      '(?:', comparisons.equal, '|', comparisons.contains, ')',  // comparison type
      '\\s+',
      '(', values.any_value, ')',                     // Capture group 2-4: value (quoted or unquoted)
    ].join(''), 'i');
  }

  /**
   * Creates a flexible column operation pattern
   * Handles variations like:
   * - "make Name column wider"
   * - "set column B bigger" 
   * - "adjust Status field broader"
   * - "increase width of Price column"
   */
  static columnOperation(): RegExp {
    const { actions, subjects, appearance, locations, modifiers } = PATTERN_COMPONENTS;
    
    return new RegExp([
      '(?:', actions.modify, ')',                     // make|set|adjust|modify
      '\\s+',
      modifiers.optional_the,                         // (the)?
      '(', locations.column, ')',                     // Capture group 1: column identifier
      '\\s+',
      '(?:column\\s+)?',                             // (column)?
      '(',                                            // Capture group 2: size change
        appearance.wider, '|', appearance.narrower,
      ')',
    ].join(''), 'i');
  }

  /**
   * Creates a flexible sorting pattern
   * Handles variations like:
   * - "sort by Name ascending"
   * - "order Status column Z-A"
   * - "arrange data by Price desc"
   * - "organize by Date field A-Z"
   */
  static sorting(): RegExp {
    const { actions, subjects, direction, locations, modifiers } = PATTERN_COMPONENTS;
    
    return new RegExp([
      actions.sort,                                   // sort|order|arrange
      '\\s+',
      '(?:by\\s+)?',                                 // (by)?
      modifiers.optional_the,                         // (the)?
      '(', locations.column, ')',                     // Capture group 1: column
      '\\s+',
      '(?:column\\s+)?',                             // (column)?
      '(',                                            // Capture group 2: direction
        direction.ascending, '|', direction.descending,
      ')?',
    ].join(''), 'i');
  }

  /**
   * Creates a flexible row/column modification pattern
   * Handles variations like:
   * - "add 3 rows above row 5"
   * - "insert new column after B"
   * - "create 2 lines before row 10"
   * - "delete rows 5 to 8"
   */
  static rowColumnModification(): RegExp {
    const { actions, subjects, values } = PATTERN_COMPONENTS;
    
    return new RegExp([
      '(?:', actions.create, '|', actions.remove, ')', // add|insert|delete|remove
      '\\s+',
      '(?:a\\s+)?(?:new\\s+)?',                      // (a)? (new)?
      '(?:', values.number, '\\s+)?',                // (number)? - how many
      '(',                                            // Capture group: row/column type
        subjects.rows, '|', subjects.columns,
      ')',
      '(?:\\s+(?:at|to|above|below|after|before)\\s+(?:row|column)\\s+', values.number, ')?', // position
    ].join(''), 'i');
  }

  /**
   * Test if a command matches any of the flexible patterns
   */
  static testCommand(command: string): {
    type: string;
    match: RegExpMatchArray | null;
    confidence: number;
  }[] {
    const tests = [
      { type: 'conditionalFormatting', pattern: this.conditionalFormatting() },
      { type: 'filtering', pattern: this.filtering() },
      { type: 'columnOperation', pattern: this.columnOperation() },
      { type: 'sorting', pattern: this.sorting() },
      { type: 'rowColumnModification', pattern: this.rowColumnModification() },
    ];

    return tests.map(test => {
      const match = command.match(test.pattern);
      const confidence = match ? this.calculateConfidence(match) : 0;
      return { type: test.type, match, confidence };
    }).filter(result => result.confidence > 0.5) // Only return confident matches
      .sort((a, b) => b.confidence - a.confidence); // Sort by confidence
  }

  /**
   * Calculate confidence score for a regex match
   */
  private static calculateConfidence(match: RegExpMatchArray): number {
    if (!match) return 0;
    
    // Basic confidence based on how many capture groups were filled
    const totalGroups = match.length - 1; // Exclude the full match
    const filledGroups = match.slice(1).filter(group => group != null).length;
    
    if (totalGroups === 0) return 0.8; // Pattern without groups
    return Math.min(0.9, 0.5 + (filledGroups / totalGroups) * 0.4); // 0.5-0.9 range
  }
}

// Export commonly used combined patterns
export const FLEXIBLE_PATTERNS = {
  conditionalFormatting: FlexiblePatternBuilder.conditionalFormatting(),
  filtering: FlexiblePatternBuilder.filtering(),
  columnOperation: FlexiblePatternBuilder.columnOperation(),
  sorting: FlexiblePatternBuilder.sorting(),
  rowColumnModification: FlexiblePatternBuilder.rowColumnModification(),
};

// Helper function to extract values from common patterns
export function extractPatternData(command: string, patternType: keyof typeof FLEXIBLE_PATTERNS) {
  const pattern = FLEXIBLE_PATTERNS[patternType];
  const match = command.match(pattern);
  
  if (!match) return null;

  // Return extracted data based on pattern type
  switch (patternType) {
    case 'conditionalFormatting':
      return {
        comparison: match[1],
        value1: match[2] ? parseFloat(match[2]) : null,
        value2: match[3] ? parseFloat(match[3]) : null,
        column: match[4] || null,
      };
    
    case 'filtering':
      return {
        column: match[1],
        value: match[2] || match[3] || match[4], // Handle quoted/unquoted values
      };
    
    case 'columnOperation':
      return {
        column: match[1],
        operation: match[2],
      };
    
    case 'sorting':
      return {
        column: match[1],
        direction: match[2] || 'asc',
      };
    
    case 'rowColumnModification':
      return {
        action: match[1],
        type: match[2],
        count: match[3] ? parseInt(match[3]) : 1,
        position: match[4] ? parseInt(match[4]) : null,
      };
    
    default:
      return { match };
  }
}

// Export for testing and debugging
export const testFlexiblePatterns = (command: string) => {
  console.log(`🧪 Testing command: "${command}"`);
  const results = FlexiblePatternBuilder.testCommand(command);
  
  results.forEach(result => {
    console.log(`✅ ${result.type}: ${result.confidence.toFixed(2)} confidence`);
    if (result.match) {
      console.log(`   Match groups:`, result.match.slice(1));
      console.log(`   Extracted data:`, extractPatternData(command, result.type as keyof typeof FLEXIBLE_PATTERNS));
    }
  });
  
  return results;
};