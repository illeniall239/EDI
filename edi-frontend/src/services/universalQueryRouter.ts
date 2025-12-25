/**
 * Universal Query Router
 * 
 * Centralized, intelligent query routing system that replaces scattered routing logic
 * with unified intelligence about query types and optimal processing paths.
 * 
 * This solves the fundamental problem of:
 * - Analytical queries being over-decomposed into unnecessary compound operations
 * - Inconsistent routing decisions across different components  
 * - No central understanding of query types and processor capabilities
 */

// ================================
// UNIVERSAL QUERY TYPE TAXONOMY
// ================================

export enum UniversalQueryType {
  // UI Operations (spreadsheet manipulation)
  UI_BASIC = 'ui_basic',                    // "sort column A"
  UI_FORMATTING = 'ui_formatting',          // "highlight duplicates"
  UI_FILTERING = 'ui_filtering',            // "filter status = complete"
  UI_CELL_OPERATIONS = 'ui_cell_operations', // "set A1 to 100"
  
  // Analytics (all analytical operations) 
  ANALYTICS_SIMPLE = 'analytics_simple',         // "what's the average price?"
  ANALYTICS_COMPARATIVE = 'analytics_comparative', // "compare averages between groups"
  ANALYTICS_CORRELATIVE = 'analytics_correlative', // "correlation between X and Y"  
  ANALYTICS_TEMPORAL = 'analytics_temporal',       // "trends over time"
  ANALYTICS_STATISTICAL = 'analytics_statistical', // "standard deviation", "outliers"
  ANALYTICS_AGGREGATIVE = 'analytics_aggregative', // "sum by category"
  
  // Visualization
  VISUALIZATION_BASIC = 'visualization_basic',     // "create bar chart"
  VISUALIZATION_COMPLEX = 'visualization_complex', // "dashboard with multiple charts"
  
  // Mixed Operations
  MIXED_UI_ANALYTICS = 'mixed_ui_analytics',   // "filter then analyze"
  MIXED_ANALYTICS_VIZ = 'mixed_analytics_viz', // "analyze and create chart"
  
  // True Compound (rare - genuinely multi-step independent operations)
  TRUE_COMPOUND = 'true_compound',             // "analyze Q1, forecast Q2, update budget"
  
  // Unknown/Fallback
  UNKNOWN = 'unknown'
}

export enum ProcessorType {
  DIRECT_BACKEND = 'direct_backend',       // AgentServices - single backend call
  DIRECT_FRONTEND = 'direct_frontend',     // SpreadsheetProcessor - UI operations
  SEQUENTIAL = 'sequential',               // Ordered sequence of operations  
  ORCHESTRATED = 'orchestrated',           // QueryOrchestrator - true compound
  FALLBACK_LEGACY = 'fallback_legacy'      // Existing system as fallback
}

// ================================
// QUERY ANALYSIS INTERFACES
// ================================

export interface SemanticAnalysis {
  text: string;
  intent: string;
  entities: string[];
  operations: string[];
  complexity: 'simple' | 'analytical' | 'compound' | 'mixed';
  confidence: number;
}

export interface QueryContext {
  chatId?: string;
  workspaceId?: string;
  currentData?: any[][];
  selectedRange?: any;
  userPreferences?: Record<string, any>;
}

export interface RoutingDecision {
  queryType: UniversalQueryType;
  processorType: ProcessorType;
  confidence: number;
  reasoning: string;
  fallbackOptions: ProcessorType[];
  executionParams: Record<string, any>;
}

export interface ExecutionPlan {
  routing: RoutingDecision;
  steps: ExecutionStep[];
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ExecutionStep {
  id: string;
  type: ProcessorType;
  command: string;
  description: string;
  dependencies: string[];
  timeout: number;
}

// ================================
// PROCESSOR CAPABILITY MATRIX
// ================================

interface ProcessorCapabilities {
  [ProcessorType.DIRECT_BACKEND]: {
    // ALL analytical operations (this is what was missing!)
    [UniversalQueryType.ANALYTICS_SIMPLE]: boolean;
    [UniversalQueryType.ANALYTICS_COMPARATIVE]: boolean;    // ← YOUR QUERY TYPE
    [UniversalQueryType.ANALYTICS_CORRELATIVE]: boolean;
    [UniversalQueryType.ANALYTICS_TEMPORAL]: boolean;
    [UniversalQueryType.ANALYTICS_STATISTICAL]: boolean;
    [UniversalQueryType.ANALYTICS_AGGREGATIVE]: boolean;
    [UniversalQueryType.VISUALIZATION_BASIC]: boolean;
    
    // What it CANNOT handle
    [UniversalQueryType.UI_BASIC]: boolean;
    [UniversalQueryType.UI_FORMATTING]: boolean;
    [UniversalQueryType.UI_FILTERING]: boolean;
  };
  
  [ProcessorType.DIRECT_FRONTEND]: {
    // ALL UI operations  
    [UniversalQueryType.UI_BASIC]: boolean;
    [UniversalQueryType.UI_FORMATTING]: boolean;
    [UniversalQueryType.UI_FILTERING]: boolean;
    [UniversalQueryType.UI_CELL_OPERATIONS]: boolean;
    
    // What it CANNOT handle
    [UniversalQueryType.ANALYTICS_SIMPLE]: boolean;
    [UniversalQueryType.ANALYTICS_COMPARATIVE]: boolean;
  };
  
  [ProcessorType.ORCHESTRATED]: {
    // ONLY true compound operations (this fixes over-orchestration!)
    [UniversalQueryType.TRUE_COMPOUND]: boolean;
    [UniversalQueryType.VISUALIZATION_COMPLEX]: boolean;
    
    // What it should NOT handle (key insight!)
    [UniversalQueryType.ANALYTICS_COMPARATIVE]: boolean;    // ← YOUR CASE - should be false
    [UniversalQueryType.ANALYTICS_SIMPLE]: boolean;
  };
}

const PROCESSOR_CAPABILITIES: ProcessorCapabilities = {
  [ProcessorType.DIRECT_BACKEND]: {
    // AgentServices excels at ALL analytical operations
    [UniversalQueryType.ANALYTICS_SIMPLE]: true,
    [UniversalQueryType.ANALYTICS_COMPARATIVE]: true,      // ← YOUR QUERY - should go here!
    [UniversalQueryType.ANALYTICS_CORRELATIVE]: true,
    [UniversalQueryType.ANALYTICS_TEMPORAL]: true,
    [UniversalQueryType.ANALYTICS_STATISTICAL]: true,
    [UniversalQueryType.ANALYTICS_AGGREGATIVE]: true,
    [UniversalQueryType.VISUALIZATION_BASIC]: true,
    
    // Cannot handle UI operations
    [UniversalQueryType.UI_BASIC]: false,
    [UniversalQueryType.UI_FORMATTING]: false,
    [UniversalQueryType.UI_FILTERING]: false,
  },
  
  [ProcessorType.DIRECT_FRONTEND]: {
    // SpreadsheetProcessor excels at UI operations
    [UniversalQueryType.UI_BASIC]: true,
    [UniversalQueryType.UI_FORMATTING]: true,
    [UniversalQueryType.UI_FILTERING]: true,
    [UniversalQueryType.UI_CELL_OPERATIONS]: true,
    
    // Cannot handle analytics
    [UniversalQueryType.ANALYTICS_SIMPLE]: false,
    [UniversalQueryType.ANALYTICS_COMPARATIVE]: false,
  },
  
  [ProcessorType.ORCHESTRATED]: {
    // QueryOrchestrator should ONLY handle genuine compound operations
    [UniversalQueryType.TRUE_COMPOUND]: true,
    [UniversalQueryType.VISUALIZATION_COMPLEX]: true,
    
    // Should NOT handle single analytics (this is the key fix!)
    [UniversalQueryType.ANALYTICS_COMPARATIVE]: false,     // ← YOUR CASE - don't orchestrate!
    [UniversalQueryType.ANALYTICS_SIMPLE]: false,
  }
};

// ================================
// UNIVERSAL QUERY ROUTER CLASS
// ================================

export class UniversalQueryRouter {
  private static instance: UniversalQueryRouter;
  private fallbackToLegacy: boolean;

  constructor(options: { fallbackToLegacy?: boolean } = {}) {
    this.fallbackToLegacy = options.fallbackToLegacy ?? true;
  }

  static getInstance(options?: { fallbackToLegacy?: boolean }): UniversalQueryRouter {
    if (!UniversalQueryRouter.instance) {
      UniversalQueryRouter.instance = new UniversalQueryRouter(options);
    }
    return UniversalQueryRouter.instance;
  }

  /**
   * Main routing method - analyzes query and determines optimal processing path
   */
  async route(query: string, context: QueryContext = {}): Promise<ExecutionPlan> {
    try {
      console.log('🧠 Universal Query Router: Analyzing query:', query);
      
      // Step 1: Deep semantic analysis
      const semantics = await this.analyzeSemantics(query, context);
      console.log('📊 Semantic analysis:', semantics);
      
      // Step 2: Universal query classification
      const queryType = this.classifyUniversally(semantics, context);
      console.log('🏷️ Query classified as:', queryType);
      
      // Step 3: Find optimal processor based on capabilities
      const processorType = this.findOptimalProcessor(queryType);
      console.log('🎯 Optimal processor:', processorType);
      
      // Step 4: Create routing decision with fallbacks
      const routing = this.createRoutingDecision(queryType, processorType, semantics);
      console.log('🗺️ Routing decision:', routing);
      
      // Step 5: Build execution plan
      const executionPlan = this.buildExecutionPlan(query, routing, context);
      console.log('📋 Execution plan created:', executionPlan);
      
      return executionPlan;
      
    } catch (error) {
      console.error('❌ Universal Query Router error:', error);
      
      // Fallback to legacy system if enabled
      if (this.fallbackToLegacy) {
        return this.createLegacyFallbackPlan(query, context);
      }
      
      throw error;
    }
  }

  /**
   * Deep semantic analysis to understand query intent and complexity
   */
  private async analyzeSemantics(query: string, context: QueryContext): Promise<SemanticAnalysis> {
    const lowerQuery = query.toLowerCase().trim();
    void context;
    
    // Extract entities (data elements referenced)
    const entities = this.extractEntities(lowerQuery);
    
    // Identify operations (what user wants to do)
    const operations = this.identifyOperations(lowerQuery);
    
    // Determine intent category
    const intent = this.determineIntent(lowerQuery, operations);
    
    // Assess complexity
    const complexity = this.assessComplexity(lowerQuery, operations, entities);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(intent, operations, entities);
    
    return {
      text: query,
      intent,
      entities,
      operations,
      complexity,
      confidence
    };
  }

  /**
   * Universal query classification based on semantic analysis
   */
  private classifyUniversally(semantics: SemanticAnalysis, context: QueryContext): UniversalQueryType {
    const { text, operations, entities } = semantics;
    const lowerText = text.toLowerCase();
    void context;
    
    // =================================
    // ANALYTICS CLASSIFICATION RULES 
    // =================================
    
    // Rule 1: Comparative Analytics (YOUR CASE!)
    if (this.isComparativeAnalytics(lowerText, operations)) {
      console.log('✅ Classified as ANALYTICS_COMPARATIVE (direct backend route)');
      return UniversalQueryType.ANALYTICS_COMPARATIVE;
    }
    
    // Rule 2: Statistical Analytics
    if (this.isStatisticalAnalytics(lowerText, operations)) {
      return UniversalQueryType.ANALYTICS_STATISTICAL;
    }
    
    // Rule 3: Temporal Analytics  
    if (this.isTemporalAnalytics(lowerText, operations)) {
      return UniversalQueryType.ANALYTICS_TEMPORAL;
    }
    
    // Rule 4: Correlative Analytics
    if (this.isCorrelativeAnalytics(lowerText, operations)) {
      return UniversalQueryType.ANALYTICS_CORRELATIVE;
    }
    
    // Rule 5: Aggregative Analytics
    if (this.isAggregativeAnalytics(lowerText, operations)) {
      return UniversalQueryType.ANALYTICS_AGGREGATIVE;
    }
    
    // Rule 6: Simple Analytics
    if (this.isSimpleAnalytics(lowerText, operations)) {
      return UniversalQueryType.ANALYTICS_SIMPLE;
    }
    
    // =================================
    // UI OPERATION CLASSIFICATION RULES
    // =================================

    // Rule 7: Formatting Operations
    if (this.isFormattingOperation(lowerText, operations)) {
      return UniversalQueryType.UI_FORMATTING;
    }

    // Rule 9: Basic UI Operations
    if (this.isBasicUIOperation(lowerText, operations)) {
      return UniversalQueryType.UI_BASIC;
    }

    // Rule 10: Cell Operations
    if (this.isCellOperation(lowerText, operations)) {
      return UniversalQueryType.UI_CELL_OPERATIONS;
    }
    
    // =================================
    // VISUALIZATION CLASSIFICATION RULES
    // =================================
    
    // Rule 10: Basic Visualization
    if (this.isBasicVisualization(lowerText, operations)) {
      return UniversalQueryType.VISUALIZATION_BASIC;
    }
    
    // Rule 11: Complex Visualization
    if (this.isComplexVisualization(lowerText, operations)) {
      return UniversalQueryType.VISUALIZATION_COMPLEX;
    }
    
    // =================================
    // MIXED/COMPOUND CLASSIFICATION RULES
    // =================================
    
    // Rule 12: True Compound Operations (rare!)
    if (this.isTrueCompound(lowerText, operations, entities)) {
      return UniversalQueryType.TRUE_COMPOUND;
    }
    
    // Rule 13: Mixed Operations
    if (this.isMixedOperation(lowerText, operations)) {
      return UniversalQueryType.MIXED_UI_ANALYTICS;
    }
    
    // Default: Simple analytics (safe fallback)
    console.log('⚠️ Defaulting to ANALYTICS_SIMPLE for unclear query');
    return UniversalQueryType.ANALYTICS_SIMPLE;
  }

  /**
   * Identify comparative analytics (YOUR USE CASE!)
   */
  private isComparativeAnalytics(text: string, _operations: string[]): boolean {
    // Comparative keywords
    const comparativePatterns = [
      /\b(compare|contrast|difference|between|versus|vs|against)\b/i,
      /\b(higher|lower|greater|less|more|fewer)\b.*\b(than|compared to)\b/i,
      /\b(average|mean).*\b(between|across|for each|by group)\b/i,
    ];
    
    // Statistical operation keywords
    const statisticalOps = _operations.some(op => 
      ['average', 'mean', 'sum', 'count', 'total', 'compare'].includes(op)
    );
    
    const hasComparativePattern = comparativePatterns.some(pattern => pattern.test(text));
    
    if (hasComparativePattern && statisticalOps) {
      console.log('🎯 Detected comparative analytics pattern');
      return true;
    }
    
    return false;
  }

  /**
   * Identify other analytics types
   */
  private isStatisticalAnalytics(text: string, _operations: string[]): boolean {
    void _operations;
    const statPatterns = [
      /\b(standard deviation|std|variance|median|quartile|percentile)\b/i,
      /\b(outliers?|anomal|distribution|normal|bell curve)\b/i,
      /\b(correlation|covariance|regression|r-squared)\b/i
    ];
    return statPatterns.some(pattern => pattern.test(text));
  }
  
  private isTemporalAnalytics(text: string, _operations: string[]): boolean {
    void _operations;
    const temporalPatterns = [
      /\b(trend|over time|time series|seasonal|growth|decline)\b/i,
      /\b(year|month|week|day|quarter).*\b(analysis|pattern)\b/i,
      /\b(forecast|predict|projection)\b/i
    ];
    return temporalPatterns.some(pattern => pattern.test(text));
  }
  
  private isCorrelativeAnalytics(text: string, _operations: string[]): boolean {
    void _operations;
    const correlativePatterns = [
      /\b(correlation|relationship|association|depends|affects)\b/i,
      /\b(related|connected|linked|influence)\b/i
    ];
    return correlativePatterns.some(pattern => pattern.test(text));
  }
  
  private isAggregativeAnalytics(text: string, _operations: string[]): boolean {
    void _operations;
    const aggregatePatterns = [
      /\b(sum|total|count|average|mean).*\b(by|group|category)\b/i,
      /\b(group by|aggregate|summarize)\b/i
    ];
    return aggregatePatterns.some(pattern => pattern.test(text));
  }
  
  private isSimpleAnalytics(text: string, _operations: string[]): boolean {
    void _operations;
    const analyticsPatterns = [
      /\b(analyze|analysis|insight|what|how|why|show me|tell me)\b/i,
      /\b(average|mean|median|sum|count|total|min|max)\b/i,
      /\b(calculate|compute|find|determine)\b/i
    ];
    return analyticsPatterns.some(pattern => pattern.test(text)) && !this.isUIOperation(text);
  }

  /**
   * Identify UI operations
   */
  private isFormattingOperation(text: string, _operations: string[]): boolean {
    void _operations;
    const formatPatterns = [
      /\b(highlight|color|format|bold|italic|underline)\b/i,
      /\b(background|foreground|font|size|style)\b/i,
      /\b(border|merge|alignment|wrap)\b/i
    ];
    return formatPatterns.some(pattern => pattern.test(text));
  }
  
  private isBasicUIOperation(text: string, _operations: string[]): boolean {
    void _operations;
    const uiPatterns = [
      /\b(sort|order|arrange)\b/i,
      /\b(insert|add|delete|remove).*\b(row|column)\b/i,
      /\b(hide|show|freeze|unfreeze)\b/i
    ];
    return uiPatterns.some(pattern => pattern.test(text));
  }
  
  private isCellOperation(text: string, _operations: string[]): boolean {
    void _operations;
    const cellPatterns = [
      /\b(set|clear|edit).*\b(cell|A\d+|[A-Z]\d+)\b/i,
      /\bcell\s+[A-Z]\d+/i
    ];
    return cellPatterns.some(pattern => pattern.test(text));
  }

  private isUIOperation(text: string): boolean {
    return this.isBasicUIOperation(text, []) ||
           this.isFormattingOperation(text, []) ||
           this.isCellOperation(text, []);
  }

  /**
   * Identify visualization operations
   */
  private isBasicVisualization(text: string, _operations: string[]): boolean {
    void _operations;
    const vizPatterns = [
      /\b(chart|graph|plot|visualiz)\b/i,
      /\b(bar|line|pie|scatter|histogram)\b.*\b(chart|graph)\b/i
    ];
    return vizPatterns.some(pattern => pattern.test(text));
  }
  
  private isComplexVisualization(text: string, _operations: string[]): boolean {
    void _operations;
    const complexVizPatterns = [
      /\b(dashboard|multiple charts|several graphs)\b/i,
      /\b(\d+|multiple).*\b(charts?|graphs?|plots?)\b/i
    ];
    return complexVizPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Identify compound and mixed operations
   */
  private isTrueCompound(text: string, _operations: string[], _entities: string[]): boolean {
    void _entities;
    // Look for multiple independent operations with dependencies
    const compoundIndicators = [
      /\b(then|after|next|subsequently|following)\b/i,
      /\b(and then|after that|once complete)\b/i
    ];
    
    const multipleOperations = _operations.length >= 3;
    const hasSequentialIndicators = compoundIndicators.some(pattern => pattern.test(text));
    
    return multipleOperations && hasSequentialIndicators;
  }
  
  private isMixedOperation(text: string, _operations: string[]): boolean {
    const hasUIOperation = this.isUIOperation(text);
    const hasAnalyticsOperation = this.isSimpleAnalytics(text, _operations);
    
    return hasUIOperation && hasAnalyticsOperation;
  }

  /**
   * Helper methods for semantic analysis
   */
  private extractEntities(text: string): string[] {
    // Extract potential data column names, values, etc.
    const entities: string[] = [];
    
    // Common data entities
    const entityPatterns = [
      /\b(column|row|cell|range)\s+([A-Z]\d*|\w+)/gi,
      /\b(price|revenue|sales|profit|cost|amount|value|score|rating|playtime|name|date|status|category|type)\b/gi,
      /\b(single-player|multiplayer|games?|products?|customers?|users?)\b/gi
    ];
    
    entityPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.push(...matches.map(m => m.toLowerCase().trim()));
      }
    });
    
    return [...new Set(entities)]; // Remove duplicates
  }
  
  private identifyOperations(text: string): string[] {
    const operations: string[] = [];
    
    // Operation keywords
    const operationPatterns = [
      /\b(compare|contrast|analyze|calculate|compute|sum|average|mean|count|total|sort|filter|highlight|create|generate|show|display)\b/gi
    ];
    
    operationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        operations.push(...matches.map(m => m.toLowerCase().trim()));
      }
    });
    
    return [...new Set(operations)];
  }
  
  private determineIntent(text: string, _operations: string[]): string {
    if (_operations.includes('compare') || _operations.includes('contrast')) {
      return 'comparative_analysis';
    }
    if (_operations.includes('analyze') || _operations.includes('analysis')) {
      return 'data_analysis';
    }
    if (_operations.includes('sort') || _operations.includes('filter')) {
      return 'data_manipulation';
    }
    if (_operations.includes('highlight') || _operations.includes('format')) {
      return 'formatting';
    }
    return 'general_query';
  }
  
  private assessComplexity(text: string, _operations: string[], _entities: string[]): 'simple' | 'analytical' | 'compound' | 'mixed' {
    void _entities;
    if (_operations.length >= 3 && text.includes('then')) {
      return 'compound';
    }
    if (this.isUIOperation(text) && this.isSimpleAnalytics(text, _operations)) {
      return 'mixed';
    }
    if (_operations.some(op => ['analyze', 'compare', 'calculate', 'correlate'].includes(op))) {
      return 'analytical';
    }
    return 'simple';
  }
  
  private calculateConfidence(intent: string, _operations: string[], _entities: string[]): number {
    let confidence = 0.5;
    
    // Higher confidence for clear operations
    if (_operations.length > 0) confidence += 0.2;
    if (_entities.length > 0) confidence += 0.2;
    
    // Higher confidence for recognized intents
    if (['comparative_analysis', 'data_analysis', 'data_manipulation'].includes(intent)) {
      confidence += 0.3;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Find optimal processor based on query type and capabilities
   */
  private findOptimalProcessor(queryType: UniversalQueryType): ProcessorType {
    // Check each processor's capabilities
    for (const [processor, capabilities] of Object.entries(PROCESSOR_CAPABILITIES)) {
      if (capabilities[queryType] === true) {
        console.log(`✅ Found optimal processor ${processor} for ${queryType}`);
        return processor as ProcessorType;
      }
    }
    
    // Fallback logic
    if (queryType.startsWith('analytics') || queryType.startsWith('visualization')) {
      console.log('📊 Defaulting to DIRECT_BACKEND for analytics/visualization');
      return ProcessorType.DIRECT_BACKEND;
    }
    
    if (queryType.startsWith('ui')) {
      console.log('🖥️ Defaulting to DIRECT_FRONTEND for UI operations');
      return ProcessorType.DIRECT_FRONTEND;
    }
    
    console.log('⚠️ No optimal processor found, using fallback');
    return ProcessorType.FALLBACK_LEGACY;
  }

  /**
   * Create routing decision with confidence and fallbacks
   */
  private createRoutingDecision(
    queryType: UniversalQueryType, 
    processorType: ProcessorType, 
    semantics: SemanticAnalysis
  ): RoutingDecision {
    
    // Determine fallback options
    const fallbackOptions: ProcessorType[] = [];
    
    if (processorType !== ProcessorType.DIRECT_BACKEND) {
      fallbackOptions.push(ProcessorType.DIRECT_BACKEND);
    }
    if (processorType !== ProcessorType.ORCHESTRATED) {
      fallbackOptions.push(ProcessorType.ORCHESTRATED);
    }
    if (processorType !== ProcessorType.FALLBACK_LEGACY) {
      fallbackOptions.push(ProcessorType.FALLBACK_LEGACY);
    }
    
    // Create reasoning
    let reasoning = `Query classified as ${queryType}, optimal processor is ${processorType}`;
    
    if (queryType === UniversalQueryType.ANALYTICS_COMPARATIVE) {
      reasoning += ' (comparative analysis can be handled by backend agent in single operation)';
    }
    
    return {
      queryType,
      processorType,
      confidence: semantics.confidence,
      reasoning,
      fallbackOptions,
      executionParams: {
        timeout: this.getTimeoutForProcessor(processorType),
        retries: processorType === ProcessorType.DIRECT_BACKEND ? 2 : 1
      }
    };
  }

  /**
   * Build complete execution plan
   */
  private buildExecutionPlan(query: string, routing: RoutingDecision, context: QueryContext): ExecutionPlan {
    void context;
    const steps: ExecutionStep[] = [];
    
    // Create execution steps based on processor type
    switch (routing.processorType) {
      case ProcessorType.DIRECT_BACKEND:
        steps.push({
          id: 'backend_analysis',
          type: ProcessorType.DIRECT_BACKEND,
          command: query,
          description: `Direct backend analysis: ${routing.queryType}`,
          dependencies: [],
          timeout: routing.executionParams.timeout || 30000
        });
        break;
        
      case ProcessorType.DIRECT_FRONTEND:
        steps.push({
          id: 'frontend_operation',
          type: ProcessorType.DIRECT_FRONTEND,
          command: query,
          description: `Direct frontend operation: ${routing.queryType}`,
          dependencies: [],
          timeout: routing.executionParams.timeout || 10000
        });
        break;
        
      case ProcessorType.SEQUENTIAL:
        // TODO: Implement sequential step planning
        break;
        
      case ProcessorType.ORCHESTRATED:
        steps.push({
          id: 'orchestrated_compound',
          type: ProcessorType.ORCHESTRATED,
          command: query,
          description: `Orchestrated compound operation: ${routing.queryType}`,
          dependencies: [],
          timeout: routing.executionParams.timeout || 60000
        });
        break;
        
      default:
        steps.push({
          id: 'legacy_fallback',
          type: ProcessorType.FALLBACK_LEGACY,
          command: query,
          description: 'Legacy system fallback',
          dependencies: [],
          timeout: 30000
        });
    }
    
    return {
      routing,
      steps,
      estimatedTime: steps.reduce((total, step) => total + step.timeout, 0),
      riskLevel: this.assessRiskLevel(routing.processorType, routing.confidence)
    };
  }

  /**
   * Utility methods
   */
  private getTimeoutForProcessor(processorType: ProcessorType): number {
    const timeouts = {
      [ProcessorType.DIRECT_BACKEND]: 30000,
      [ProcessorType.DIRECT_FRONTEND]: 10000,
      [ProcessorType.SEQUENTIAL]: 45000,
      [ProcessorType.ORCHESTRATED]: 60000,
      [ProcessorType.FALLBACK_LEGACY]: 30000
    };
    
    return timeouts[processorType] || 30000;
  }
  
  private assessRiskLevel(processorType: ProcessorType, confidence: number): 'low' | 'medium' | 'high' {
    if (confidence >= 0.8 && processorType !== ProcessorType.FALLBACK_LEGACY) {
      return 'low';
    }
    if (confidence >= 0.6) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Legacy fallback plan for compatibility
   */
  private createLegacyFallbackPlan(query: string, context: QueryContext): ExecutionPlan {
    void context;
    console.log('🔄 Creating legacy fallback plan for query:', query);
    
    return {
      routing: {
        queryType: UniversalQueryType.UNKNOWN,
        processorType: ProcessorType.FALLBACK_LEGACY,
        confidence: 0.5,
        reasoning: 'Fallback to existing system due to router error',
        fallbackOptions: [],
        executionParams: { timeout: 30000, retries: 1 }
      },
      steps: [{
        id: 'legacy_system',
        type: ProcessorType.FALLBACK_LEGACY,
        command: query,
        description: 'Process using existing system routing logic',
        dependencies: [],
        timeout: 30000
      }],
      estimatedTime: 30000,
      riskLevel: 'medium'
    };
  }
}

// ================================
// SINGLETON EXPORT
// ================================

export const universalQueryRouter = UniversalQueryRouter.getInstance({
  fallbackToLegacy: true // Enable legacy fallback for safety
});

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Quick routing check for specific query types
 */
export async function shouldRouteDirectlyToBackend(query: string): Promise<boolean> {
  try {
    const plan = await universalQueryRouter.route(query);
    return plan.routing.processorType === ProcessorType.DIRECT_BACKEND;
  } catch {
    return false;
  }
}

/**
 * Check if query needs orchestration (should be rare!)
 */
export async function needsOrchestration(query: string): Promise<boolean> {
  try {
    const plan = await universalQueryRouter.route(query);
    return plan.routing.processorType === ProcessorType.ORCHESTRATED;
  } catch {
    return false;
  }
}