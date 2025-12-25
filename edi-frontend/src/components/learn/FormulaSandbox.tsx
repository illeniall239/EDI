'use client';

import React, { useState, useEffect } from 'react';
import { useLearnMode } from '@/contexts/LearnModeContext';
import { Play, Info, Lightbulb, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react';

interface FormulaSandboxProps {
  concept: string;
  sampleData: any[];
  onFormulaTest: (formula: string) => void;
}

const SAMPLE_DATASETS = {
  'basic_functions': [
    { Name: 'Alice', Age: 28, Salary: 50000, Department: 'Sales' },
    { Name: 'Bob', Age: 34, Salary: 75000, Department: 'Engineering' },
    { Name: 'Carol', Age: 29, Salary: 60000, Department: 'Marketing' },
    { Name: 'David', Age: 41, Salary: 90000, Department: 'Engineering' },
    { Name: 'Eve', Age: 25, Salary: 45000, Department: 'Sales' }
  ],
  'vlookup': [
    { Product_ID: 'P001', Product_Name: 'Laptop', Category: 'Electronics', Price: 999.99 },
    { Product_ID: 'P002', Product_Name: 'Chair', Category: 'Furniture', Price: 149.99 },
    { Product_ID: 'P003', Product_Name: 'Book', Category: 'Education', Price: 29.99 },
    { Product_ID: 'P004', Product_Name: 'Phone', Category: 'Electronics', Price: 599.99 }
  ]
};

const CONCEPT_EXPLANATIONS = {
  'basic_functions': {
    title: 'Basic Functions',
    description: 'Essential spreadsheet functions for calculations and data analysis.',
    functions: [
      {
        name: 'SUM',
        syntax: '=SUM(range)',
        description: 'Adds up all numbers in a range of cells',
        example: '=SUM(C2:C6)',
        expectedResult: '320000'
      },
      {
        name: 'AVERAGE',
        syntax: '=AVERAGE(range)',
        description: 'Calculates the average of numbers in a range',
        example: '=AVERAGE(B2:B6)',
        expectedResult: '31.4'
      },
      {
        name: 'COUNT',
        syntax: '=COUNT(range)',
        description: 'Counts the number of cells containing numbers',
        example: '=COUNT(B2:B6)',
        expectedResult: '5'
      }
    ]
  },
  'vlookup': {
    title: 'VLOOKUP Function',
    description: 'Look up data in a table and return corresponding values.',
    functions: [
      {
        name: 'VLOOKUP',
        syntax: '=VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
        description: 'Searches for a value and returns a corresponding value from another column',
        example: '=VLOOKUP("P002", A2:D5, 2, FALSE)',
        expectedResult: 'Chair'
      }
    ]
  }
};

export default function FormulaSandbox({ concept, sampleData, onFormulaTest }: FormulaSandboxProps) {
  const [formula, setFormula] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const { tutorResponse } = useLearnMode();

  const conceptData = CONCEPT_EXPLANATIONS[concept as keyof typeof CONCEPT_EXPLANATIONS];
  const dataset = SAMPLE_DATASETS[concept as keyof typeof SAMPLE_DATASETS] || sampleData;

  useEffect(() => {
    // Reset when concept changes
    setFormula('');
    setResult(null);
    setError(null);
  }, [concept]);

  const evaluateFormula = async () => {
    if (!formula.trim()) return;

    setIsEvaluating(true);
    setError(null);
    setResult(null);

    try {
      // Ask the tutor for guidance first (Socratic mode)
      // Keep local simulation as immediate feedback while backend scaffolding matures
      await new Promise(resolve => setTimeout(resolve, 300));

      let evaluatedResult = '';

      // Basic SUM evaluation
      if (formula.toUpperCase().includes('SUM(C2:C6)') && concept === 'basic_functions') {
        const sum = dataset.reduce((acc: number, row: any) => acc + (row.Salary || 0), 0);
        evaluatedResult = sum.toString();
      }
      // Basic AVERAGE evaluation
      else if (formula.toUpperCase().includes('AVERAGE(B2:B6)') && concept === 'basic_functions') {
        const ages = dataset.map((row: any) => row.Age || 0);
        const avg = ages.reduce((a: number, b: number) => a + b, 0) / ages.length;
        evaluatedResult = avg.toString();
      }
      // Basic COUNT evaluation
      else if (formula.toUpperCase().includes('COUNT(B2:B6)') && concept === 'basic_functions') {
        evaluatedResult = dataset.length.toString();
      }
      // VLOOKUP evaluation
      else if (formula.toUpperCase().includes('VLOOKUP') && concept === 'vlookup') {
        // Simple VLOOKUP simulation for P002
        if (formula.includes('P002')) {
          const product = dataset.find((row: any) => row.Product_ID === 'P002') as any;
          evaluatedResult = product ? product.Product_Name : '#N/A';
        } else {
          evaluatedResult = '#N/A';
        }
      }
      else {
        throw new Error('Formula not recognized in this sandbox. Try using the suggested examples.');
      }

      setResult(evaluatedResult);
      onFormulaTest(formula);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid formula');
    } finally {
      setIsEvaluating(false);
    }
  };

  const loadExample = (exampleFormula: string) => {
    setFormula(exampleFormula);
    setResult(null);
    setError(null);
  };

  const clearSandbox = () => {
    setFormula('');
    setResult(null);
    setError(null);
  };

  if (!conceptData) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Sandbox not available for this concept yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Play className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Formula Sandbox</h2>
        </div>
        <p className="text-gray-600">{conceptData.description}</p>
        {tutorResponse && (
          <div className="mt-3 p-3 rounded-md bg-blue-50 border border-blue-200">
            <div className="text-blue-900 text-sm font-medium mb-1">Tutor Guidance</div>
            <div className="text-blue-800 text-sm">{tutorResponse.response}</div>
            {tutorResponse.guidingQuestions && tutorResponse.guidingQuestions.length > 0 && (
              <ul className="mt-2 text-blue-800 text-sm list-disc list-inside space-y-1">
                {tutorResponse.guidingQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex">
        {/* Data Preview */}
        <div className="w-1/3 border-r border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Sample Data</h3>
          <div className="bg-gray-50 rounded-lg p-4 overflow-auto max-h-80">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left p-2 bg-gray-200 font-medium">Row</th>
                  {dataset.length > 0 && Object.keys(dataset[0]).map(key => (
                    <th key={key} className="text-left p-2 bg-gray-200 font-medium">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="p-2 text-gray-500">{index + 2}</td>
                    {Object.values(row).map((value, cellIndex) => (
                      <td key={cellIndex} className="p-2">{String(value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Formula Input and Results */}
        <div className="flex-1 p-6">
          <div className="space-y-6">
            {/* Formula Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-900">
                  Enter Formula
                </label>
                <button
                  onClick={clearSandbox}
                  className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              </div>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="=SUM(C2:C6)"
                  onKeyDown={(e) => e.key === 'Enter' && evaluateFormula()}
                />
                <button
                  onClick={evaluateFormula}
                  disabled={!formula.trim() || isEvaluating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Play className="w-4 h-4" />
                  <span>{isEvaluating ? 'Testing...' : 'Test'}</span>
                </button>
              </div>
            </div>

            {/* Result Display */}
            {(result || error) && (
              <div className="p-4 rounded-lg border">
                {error ? (
                  <div className="flex items-center space-x-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <div>
                      <div className="font-medium">Error</div>
                      <div className="text-sm">{error}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <div>
                      <div className="font-medium">Result</div>
                      <div className="text-lg font-mono">{result}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Function Examples */}
            <div>
              <h3 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                <span>Try These Examples</span>
              </h3>
              <div className="space-y-3">
                {conceptData.functions.map((func, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{func.name}</h4>
                      <button
                        onClick={() => loadExample(func.example)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        Try It
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{func.description}</p>
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-gray-500">Example:</span>
                      <code className="bg-gray-200 px-2 py-1 rounded font-mono">{func.example}</code>
                      <span className="text-gray-500">→</span>
                      <code className="bg-green-100 text-green-700 px-2 py-1 rounded font-mono">{func.expectedResult}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start space-x-2">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Tips</h4>
                  <ul className="text-sm text-blue-700 mt-1 space-y-1">
                    <li>• All formulas must start with the = sign</li>
                    <li>• Use cell ranges like A2:A6 to reference multiple cells</li>
                    <li>• Press Enter or click Test to evaluate your formula</li>
                    <li>• Try the example formulas to get started</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}