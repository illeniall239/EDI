/**
 * Query Router Test Component
 * 
 * A simple component to test the Universal Query Router in the browser
 * and verify that your specific routing issue is resolved.
 */

'use client';

import React, { useState } from 'react';
import { universalQueryRouter, ProcessorType, UniversalQueryType } from '@/services/universalQueryRouter';
import { testYourSpecificCase, runUniversalQueryRouterTests } from '@/services/universalQueryRouter.test';

interface RoutingResult {
  query: string;
  queryType: UniversalQueryType;
  processorType: ProcessorType;
  confidence: number;
  reasoning: string;
  success: boolean;
  timestamp: number;
}

export default function QueryRouterTest() {
  const [testQuery, setTestQuery] = useState("Compare average playtime between single-player and multiplayer games");
  const [results, setResults] = useState<RoutingResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testSummary, setTestSummary] = useState<any>(null);

  const testSingleQuery = async (query: string) => {
    setIsRunning(true);
    
    try {
      const executionPlan = await universalQueryRouter.route(query, {
        workspaceId: 'test',
        currentData: []
      });
      
      const routing = executionPlan.routing;
      
      const result: RoutingResult = {
        query,
        queryType: routing.queryType,
        processorType: routing.processorType,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
        success: true,
        timestamp: Date.now()
      };
      
      setResults(prev => [result, ...prev]);
      
    } catch (error) {
      const result: RoutingResult = {
        query,
        queryType: UniversalQueryType.UNKNOWN,
        processorType: ProcessorType.FALLBACK_LEGACY,
        confidence: 0,
        reasoning: `Error: ${error}`,
        success: false,
        timestamp: Date.now()
      };
      
      setResults(prev => [result, ...prev]);
    }
    
    setIsRunning(false);
  };

  const runFullTestSuite = async () => {
    setIsRunning(true);
    
    try {
      const { results: testResults, summary } = await runUniversalQueryRouterTests();
      setTestSummary(summary);
      
      // Convert test results to routing results for display
      const routingResults: RoutingResult[] = testResults.map(test => ({
        query: test.query,
        queryType: test.actual.queryType,
        processorType: test.actual.processor,
        confidence: test.actual.confidence,
        reasoning: test.actual.reasoning,
        success: test.passed,
        timestamp: Date.now()
      }));
      
      setResults(routingResults);
      
    } catch (error) {
      console.error('Test suite failed:', error);
    }
    
    setIsRunning(false);
  };

  const testYourCase = async () => {
    setIsRunning(true);
    
    try {
      const success = await testYourSpecificCase();
      console.log('Your case test result:', success);
    } catch (error) {
      console.error('Your case test failed:', error);
    }
    
    setIsRunning(false);
    
    // Also add the query to results
    await testSingleQuery("Compare average playtime between single-player and multiplayer games");
  };

  const getProcessorColor = (processor: ProcessorType): string => {
    switch (processor) {
      case ProcessorType.DIRECT_BACKEND: return 'bg-green-100 text-green-800';
      case ProcessorType.DIRECT_FRONTEND: return 'bg-blue-100 text-blue-800';
      case ProcessorType.ORCHESTRATED: return 'bg-yellow-100 text-yellow-800';
      case ProcessorType.SEQUENTIAL: return 'bg-purple-100 text-purple-800';
      case ProcessorType.FALLBACK_LEGACY: return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getQueryTypeColor = (queryType: UniversalQueryType): string => {
    if (queryType.startsWith('analytics')) return 'bg-white/10 text-white';
    if (queryType.startsWith('ui')) return 'bg-sky-100 text-sky-800';
    if (queryType.startsWith('visualization')) return 'bg-violet-100 text-violet-800';
    return 'bg-slate-100 text-slate-800';
  };

  const predefinedQueries = [
    "Compare average playtime between single-player and multiplayer games", // Your case
    "What's the correlation between price and sales volume?",
    "Calculate the standard deviation of customer ratings",
    "Show me sales trends over the last 12 months",
    "Sum revenue by product category",
    "Sort column A descending",
    "Highlight duplicates in column B",
    "Filter status equals complete",
    "Create a bar chart of sales by month",
    "Analyze Q1 performance, then create forecast for Q2, then update budget",
    "Sort by revenue descending and then analyze top 10 customers"
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Universal Query Router Test</h1>
        <p className="text-gray-600">
          Test the Universal Query Router to verify that analytical queries like 
          &quot;Compare average playtime...&quot; go directly to the backend agent instead of being over-decomposed.
        </p>
      </div>

      {/* Test Controls */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-xl font-semibold mb-4">Test Controls</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <button
            onClick={testYourCase}
            disabled={isRunning}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {isRunning ? 'Testing...' : 'Test Your Specific Case'}
          </button>
          
          <button
            onClick={runFullTestSuite}
            disabled={isRunning}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Full Test Suite'}
          </button>
          
          <button
            onClick={() => setResults([])}
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
          >
            Clear Results
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Enter your query to test..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => testSingleQuery(testQuery)}
            disabled={isRunning}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {isRunning ? 'Testing...' : 'Test Query'}
          </button>
        </div>
      </div>

      {/* Predefined Queries */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-xl font-semibold mb-4">Quick Test Queries</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {predefinedQueries.map((query, index) => (
            <button
              key={index}
              onClick={() => testSingleQuery(query)}
              disabled={isRunning}
              className="text-left p-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border disabled:opacity-50"
              title={query}
            >
              {query.length > 40 ? query.substring(0, 40) + '...' : query}
            </button>
          ))}
        </div>
      </div>

      {/* Test Summary */}
      {testSummary && (
        <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Suite Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-blue-50 rounded">
              <div className="text-2xl font-bold text-blue-600">{testSummary.total}</div>
              <div className="text-sm text-blue-800">Total Tests</div>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <div className="text-2xl font-bold text-green-600">{testSummary.passed}</div>
              <div className="text-sm text-green-800">Passed</div>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <div className="text-2xl font-bold text-red-600">{testSummary.failed}</div>
              <div className="text-sm text-red-800">Failed</div>
            </div>
            <div className="p-3 bg-yellow-50 rounded">
              <div className="text-2xl font-bold text-yellow-600">
                {testSummary.highPriorityPassed}/{testSummary.highPriorityPassed + testSummary.highPriorityFailed}
              </div>
              <div className="text-sm text-yellow-800">High Priority</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold mb-4">Test Results ({results.length})</h2>
        
        {results.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No tests run yet. Try one of the test buttons above.</p>
        ) : (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${
                  result.success ? 'border-l-green-500 bg-green-50' : 'border-l-red-500 bg-red-50'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <h3 className="font-medium text-gray-900 mb-2 md:mb-0">
                    {result.query}
                  </h3>
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <span className="text-green-600 text-sm font-medium">✅ CORRECT</span>
                    ) : (
                      <span className="text-red-600 text-sm font-medium">❌ INCORRECT</span>
                    )}
                    <span className="text-xs text-gray-500">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Query Type</span>
                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getQueryTypeColor(result.queryType)}`}>
                      {result.queryType}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Processor</span>
                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getProcessorColor(result.processorType)}`}>
                      {result.processorType}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Confidence</span>
                    <div className="text-sm font-medium">
                      {(result.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reasoning</span>
                  <p className="text-sm text-gray-700 mt-1">{result.reasoning}</p>
                </div>

                {/* Special note for your case */}
                {result.query.includes("Compare average playtime") && (
                  <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-sm font-medium text-blue-800">
                      🎯 This is your specific case! 
                      {result.processorType === ProcessorType.DIRECT_BACKEND ? (
                        <span className="text-green-600"> ✅ It will now go directly to the backend agent instead of being over-decomposed!</span>
                      ) : (
                        <span className="text-red-600"> ❌ Still being routed incorrectly - needs adjustment.</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-3">Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Processor Types</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded ${getProcessorColor(ProcessorType.DIRECT_BACKEND)}`}>DIRECT_BACKEND</span>
                <span>→ Best for analytics (YOUR GOAL)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded ${getProcessorColor(ProcessorType.DIRECT_FRONTEND)}`}>DIRECT_FRONTEND</span>
                <span>→ Best for UI operations</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded ${getProcessorColor(ProcessorType.ORCHESTRATED)}`}>ORCHESTRATED</span>
                <span>→ Only for true compound queries</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Success Criteria</h4>
            <div className="space-y-1 text-xs">
              <div>✅ Analytics queries → DIRECT_BACKEND</div>
              <div>✅ UI operations → DIRECT_FRONTEND</div>
              <div>✅ True compound → ORCHESTRATED</div>
              <div>❌ Analytics → ORCHESTRATED (over-decomposition)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}