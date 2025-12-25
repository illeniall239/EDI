/**
 * Universal Query Router Test Suite
 * 
 * Comprehensive tests to validate that the Universal Query Router correctly
 * identifies query types and routes them to optimal processors.
 * 
 * This ensures your specific problem (analytical queries being over-decomposed)
 * and all similar routing issues are resolved universally.
 */

import { universalQueryRouter, ProcessorType, UniversalQueryType } from './universalQueryRouter';

// ================================
// TEST DATA AND EXPECTED RESULTS
// ================================

interface TestCase {
  query: string;
  expectedQueryType: UniversalQueryType;
  expectedProcessor: ProcessorType;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

const TEST_CASES: TestCase[] = [
  // ========================================
  // HIGH PRIORITY: Your specific use case and similar analytics
  // ========================================
  {
    query: "Compare average playtime between single-player and multiplayer games",
    expectedQueryType: UniversalQueryType.ANALYTICS_COMPARATIVE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "YOUR CASE: Comparative analysis should go directly to backend, not be decomposed",
    priority: 'high'
  },
  {
    query: "What's the difference in sales between Q1 and Q2?",
    expectedQueryType: UniversalQueryType.ANALYTICS_COMPARATIVE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Comparative analysis with temporal elements",
    priority: 'high'
  },
  {
    query: "Compare revenue between product categories",
    expectedQueryType: UniversalQueryType.ANALYTICS_COMPARATIVE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Simple comparative analysis",
    priority: 'high'
  },
  {
    query: "Show me the correlation between price and sales volume",
    expectedQueryType: UniversalQueryType.ANALYTICS_CORRELATIVE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Correlative analysis should be direct backend",
    priority: 'high'
  },
  {
    query: "Calculate the standard deviation of customer ratings",
    expectedQueryType: UniversalQueryType.ANALYTICS_STATISTICAL,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Statistical analysis should be direct backend",
    priority: 'high'
  },
  
  // ========================================
  // MEDIUM PRIORITY: Other analytics types
  // ========================================
  {
    query: "What are the sales trends over the last 12 months?",
    expectedQueryType: UniversalQueryType.ANALYTICS_TEMPORAL,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Temporal analysis should be direct backend",
    priority: 'medium'
  },
  {
    query: "Sum revenue by product category",
    expectedQueryType: UniversalQueryType.ANALYTICS_AGGREGATIVE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Aggregative analysis should be direct backend",
    priority: 'medium'
  },
  {
    query: "What's the average order value?",
    expectedQueryType: UniversalQueryType.ANALYTICS_SIMPLE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Simple analytics should be direct backend",
    priority: 'medium'
  },
  {
    query: "Analyze customer satisfaction scores",
    expectedQueryType: UniversalQueryType.ANALYTICS_SIMPLE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "General analysis should be direct backend",
    priority: 'medium'
  },
  
  // ========================================
  // UI OPERATIONS: Should go to frontend
  // ========================================
  {
    query: "Sort column A descending",
    expectedQueryType: UniversalQueryType.UI_BASIC,
    expectedProcessor: ProcessorType.DIRECT_FRONTEND,
    description: "Basic UI operation should go to frontend",
    priority: 'medium'
  },
  {
    query: "Highlight duplicates in column B",
    expectedQueryType: UniversalQueryType.UI_FORMATTING,
    expectedProcessor: ProcessorType.DIRECT_FRONTEND,
    description: "Formatting operation should go to frontend",
    priority: 'medium'
  },
  {
    query: "Filter status equals complete",
    expectedQueryType: UniversalQueryType.UI_FILTERING,
    expectedProcessor: ProcessorType.DIRECT_FRONTEND,
    description: "Filtering UI operation should go to frontend",
    priority: 'medium'
  },
  {
    query: "Set cell A1 to 100",
    expectedQueryType: UniversalQueryType.UI_CELL_OPERATIONS,
    expectedProcessor: ProcessorType.DIRECT_FRONTEND,
    description: "Cell operation should go to frontend",
    priority: 'medium'
  },
  
  // ========================================
  // VISUALIZATION: Should be direct backend
  // ========================================
  {
    query: "Create a bar chart of sales by month",
    expectedQueryType: UniversalQueryType.VISUALIZATION_BASIC,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Basic visualization should go to backend",
    priority: 'medium'
  },
  
  // ========================================
  // TRUE COMPOUND: Should be orchestrated (RARE)
  // ========================================
  {
    query: "Analyze Q1 performance, then create a forecast for Q2, and finally update the budget spreadsheet",
    expectedQueryType: UniversalQueryType.TRUE_COMPOUND,
    expectedProcessor: ProcessorType.ORCHESTRATED,
    description: "Genuine compound operation needs orchestration",
    priority: 'low'
  },
  
  // ========================================
  // MIXED OPERATIONS: Should be sequential
  // ========================================
  {
    query: "Sort by revenue descending and then analyze top 10 customers",
    expectedQueryType: UniversalQueryType.MIXED_UI_ANALYTICS,
    expectedProcessor: ProcessorType.SEQUENTIAL,
    description: "Mixed UI + analytics should be sequential",
    priority: 'low'
  },
  
  // ========================================
  // EDGE CASES AND POTENTIAL MISCLASSIFICATIONS
  // ========================================
  {
    query: "Show me detailed insights about our top performing products",
    expectedQueryType: UniversalQueryType.ANALYTICS_SIMPLE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Complex-sounding but single analytical operation",
    priority: 'high'
  },
  {
    query: "I need a comprehensive analysis of customer behavior patterns",
    expectedQueryType: UniversalQueryType.ANALYTICS_SIMPLE,
    expectedProcessor: ProcessorType.DIRECT_BACKEND,
    description: "Should not be over-decomposed despite complex wording",
    priority: 'high'
  }
];

// ================================
// TEST EXECUTION FUNCTIONS
// ================================

interface TestResult {
  query: string;
  expected: {
    queryType: UniversalQueryType;
    processor: ProcessorType;
  };
  actual: {
    queryType: UniversalQueryType;
    processor: ProcessorType;
    confidence: number;
    reasoning: string;
  };
  passed: boolean;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Run all test cases and return results
 */
export async function runUniversalQueryRouterTests(): Promise<{
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    highPriorityPassed: number;
    highPriorityFailed: number;
  };
}> {
  console.log('🧪 Starting Universal Query Router Test Suite...');
  
  const results: TestResult[] = [];
  
  for (const testCase of TEST_CASES) {
    console.log(`\n🔍 Testing: ${testCase.query}`);
    
    try {
      const executionPlan = await universalQueryRouter.route(testCase.query, {
        workspaceId: 'test',
        currentData: []
      });
      
      const routing = executionPlan.routing;
      
      const passed = routing.queryType === testCase.expectedQueryType && 
                     routing.processorType === testCase.expectedProcessor;
      
      const result: TestResult = {
        query: testCase.query,
        expected: {
          queryType: testCase.expectedQueryType,
          processor: testCase.expectedProcessor
        },
        actual: {
          queryType: routing.queryType,
          processor: routing.processorType,
          confidence: routing.confidence,
          reasoning: routing.reasoning
        },
        passed,
        description: testCase.description,
        priority: testCase.priority
      };
      
      results.push(result);
      
      console.log(`${passed ? '✅' : '❌'} ${testCase.description}`);
      if (!passed) {
        console.log(`   Expected: ${testCase.expectedQueryType} → ${testCase.expectedProcessor}`);
        console.log(`   Got: ${routing.queryType} → ${routing.processorType}`);
        console.log(`   Reasoning: ${routing.reasoning}`);
      }
      
    } catch (error) {
      console.error(`❌ Test failed with error: ${error}`);
      
      results.push({
        query: testCase.query,
        expected: {
          queryType: testCase.expectedQueryType,
          processor: testCase.expectedProcessor
        },
        actual: {
          queryType: UniversalQueryType.UNKNOWN,
          processor: ProcessorType.FALLBACK_LEGACY,
          confidence: 0,
          reasoning: `Error: ${error}`
        },
        passed: false,
        description: testCase.description,
        priority: testCase.priority
      });
    }
  }
  
  // Calculate summary
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  
  const highPriorityResults = results.filter(r => r.priority === 'high');
  const highPriorityPassed = highPriorityResults.filter(r => r.passed).length;
  const highPriorityFailed = highPriorityResults.length - highPriorityPassed;
  
  const summary = {
    total,
    passed,
    failed,
    highPriorityPassed,
    highPriorityFailed
  };
  
  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${total}`);
  console.log(`   Passed: ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`   Failed: ${failed} (${((failed/total)*100).toFixed(1)}%)`);
  console.log(`   High Priority Passed: ${highPriorityPassed}/${highPriorityResults.length}`);
  
  return { results, summary };
}

/**
 * Run tests for your specific use case only
 */
export async function testYourSpecificCase(): Promise<boolean> {
  console.log('🎯 Testing your specific use case...');
  
  const testQuery = "Compare average playtime between single-player and multiplayer games";
  
  try {
    const executionPlan = await universalQueryRouter.route(testQuery, {
      workspaceId: 'test',
      currentData: []
    });
    
    const routing = executionPlan.routing;
    
    const isCorrect = routing.queryType === UniversalQueryType.ANALYTICS_COMPARATIVE && 
                     routing.processorType === ProcessorType.DIRECT_BACKEND;
    
    console.log(`Query: ${testQuery}`);
    console.log(`Expected: ANALYTICS_COMPARATIVE → DIRECT_BACKEND`);
    console.log(`Got: ${routing.queryType} → ${routing.processorType}`);
    console.log(`Reasoning: ${routing.reasoning}`);
    console.log(`Confidence: ${routing.confidence}`);
    
    if (isCorrect) {
      console.log('✅ YOUR CASE WORKS! Query will go directly to backend agent');
      console.log('🎉 No more unnecessary decomposition into multiple steps');
    } else {
      console.log('❌ YOUR CASE FAILED! Query routing needs adjustment');
    }
    
    return isCorrect;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

/**
 * Interactive test runner for development
 */
export async function interactiveTest(query: string): Promise<void> {
  console.log(`\n🔍 Interactive Test: "${query}"`);
  
  try {
    const executionPlan = await universalQueryRouter.route(query, {
      workspaceId: 'test',
      currentData: []
    });
    
    const routing = executionPlan.routing;
    
    console.log('📊 Results:');
    console.log(`   Query Type: ${routing.queryType}`);
    console.log(`   Processor: ${routing.processorType}`);
    console.log(`   Confidence: ${routing.confidence}`);
    console.log(`   Reasoning: ${routing.reasoning}`);
    console.log(`   Risk Level: ${executionPlan.riskLevel}`);
    console.log(`   Fallback Options: ${routing.fallbackOptions.join(', ')}`);
    
    // Interpretation
    if (routing.processorType === ProcessorType.DIRECT_BACKEND) {
      console.log('✅ Will go directly to AgentServices (optimal for analytics)');
    } else if (routing.processorType === ProcessorType.DIRECT_FRONTEND) {
      console.log('✅ Will go directly to SpreadsheetProcessor (optimal for UI ops)');
    } else if (routing.processorType === ProcessorType.ORCHESTRATED) {
      console.log('⚠️ Will be orchestrated (only use for genuine compound queries)');
    } else {
      console.log('🔄 Will use fallback/legacy routing');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// ================================
// DEVELOPMENT UTILITIES
// ================================

/**
 * Test specific query types to validate classification logic
 */
export const testQueries = {
  // Your specific case
  yourCase: "Compare average playtime between single-player and multiplayer games",
  
  // Other analytics that should be direct
  analyticsComparative: [
    "Compare revenue between Q1 and Q2",
    "What's the difference in sales between product A and B?",
    "Show me higher vs lower performing regions"
  ],
  
  analyticsSimple: [
    "What's the average customer age?",
    "Calculate total revenue",
    "Show me top 10 customers"
  ],
  
  // UI operations that should be direct frontend
  uiOperations: [
    "Sort column A ascending",
    "Highlight cells greater than 100",
    "Filter status = complete",
    "Set A1 to 500"
  ],
  
  // True compound (should be rare)
  trueCompound: [
    "Analyze sales data, create a report, and email it to the team",
    "Update inventory, then forecast demand, then adjust pricing"
  ],
  
  // Edge cases that might be misclassified
  edgeCases: [
    "I need comprehensive analytics on customer behavior",
    "Give me detailed insights about our performance",
    "Show me everything about our top products"
  ]
};

/**
 * Run development tests
 */
export async function runDevTests(): Promise<void> {
  console.log('🛠️ Running Development Tests...');
  
  // Test your case first
  console.log('\n=== YOUR SPECIFIC CASE ===');
  await interactiveTest(testQueries.yourCase);
  
  // Test other analytics
  console.log('\n=== OTHER ANALYTICS ===');
  for (const query of testQueries.analyticsComparative) {
    await interactiveTest(query);
  }
  
  // Test UI operations
  console.log('\n=== UI OPERATIONS ===');
  for (const query of testQueries.uiOperations) {
    await interactiveTest(query);
  }
  
  // Test edge cases
  console.log('\n=== EDGE CASES ===');
  for (const query of testQueries.edgeCases) {
    await interactiveTest(query);
  }
}

// Make functions available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testUniversalQueryRouter = {
    runTests: runUniversalQueryRouterTests,
    testYourCase: testYourSpecificCase,
    interactive: interactiveTest,
    dev: runDevTests,
    queries: testQueries
  };
}