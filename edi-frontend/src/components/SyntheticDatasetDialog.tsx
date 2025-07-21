'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SyntheticDatasetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (specs: SyntheticDatasetSpecs) => Promise<void>;
}

export interface SyntheticDatasetSpecs {
  description: string;
  rows: number;
  columns?: number;
  columnSpecs?: { [key: string]: string };
}

export default function SyntheticDatasetDialog({ 
  isOpen, 
  onClose, 
  onGenerate 
}: SyntheticDatasetDialogProps) {
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState(100);
  const [columns, setColumns] = useState<number | ''>('');
  const [useCustomColumns, setUseCustomColumns] = useState(false);
  const [customColumns, setCustomColumns] = useState<Array<{ name: string; description: string }>>([
    { name: '', description: '' }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (!isGenerating) {
      setDescription('');
      setRows(100);
      setColumns('');
      setUseCustomColumns(false);
      setCustomColumns([{ name: '', description: '' }]);
      setError(null);
      onClose();
    }
  };

  const handleAddColumn = () => {
    setCustomColumns([...customColumns, { name: '', description: '' }]);
  };

  const handleRemoveColumn = (index: number) => {
    if (customColumns.length > 1) {
      setCustomColumns(customColumns.filter((_, i) => i !== index));
    }
  };

  const handleColumnChange = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...customColumns];
    updated[index][field] = value;
    setCustomColumns(updated);
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please provide a description for the dataset');
      return;
    }

    if (rows < 1 || rows > 10000) {
      setError('Number of rows must be between 1 and 10,000');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const specs: SyntheticDatasetSpecs = {
        description: description.trim(),
        rows,
      };

      if (useCustomColumns) {
        const validColumns = customColumns.filter(col => col.name.trim());
        if (validColumns.length === 0) {
          throw new Error('Please specify at least one column when using custom columns');
        }
        
        specs.columnSpecs = {};
        validColumns.forEach(col => {
          specs.columnSpecs![col.name.trim()] = col.description.trim() || 'Generic data';
        });
      } else if (columns && typeof columns === 'number') {
        specs.columns = columns;
      }

      await onGenerate(specs);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate dataset');
    } finally {
      setIsGenerating(false);
    }
  };

  const presetDatasets = [
    {
      name: 'Sales Data',
      description: 'Monthly sales data with products, customers, and revenue',
    },
    {
      name: 'Employee Records',
      description: 'Employee data with names, departments, salaries, and hire dates',
    },
    {
      name: 'Product Inventory',
      description: 'Product catalog with names, categories, prices, and stock levels',
    },
    {
      name: 'Student Grades',
      description: 'Student performance data with names, subjects, and grades',
    },
    {
      name: 'Financial Transactions',
      description: 'Banking transactions with dates, amounts, and categories',
    },
    {
      name: 'Website Analytics',
      description: 'Website traffic data with pages, visitors, and conversion metrics',
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden"
            style={{ backgroundColor: 'rgb(2, 6, 23)' }}
          >
            {/* Header */}
            <div className="border-b border-slate-700/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">AI Synthetic Dataset Generator</h2>
                    <p className="text-sm text-slate-400">Generate realistic sample data using AI</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isGenerating}
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              {/* Welcome Message */}
              <div className="mb-6 p-4 rounded-lg border border-slate-700/50" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-amber-600 rounded-lg mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-2">👋 Hi! I'm your data generation assistant. I can help you:</p>
                    <ul className="text-sm text-slate-400 space-y-1">
                      <li>• Generate realistic sample datasets</li>
                      <li>• Create custom data structures</li>
                      <li>• Produce data with specific patterns</li>
                      <li>• Build test data for development</li>
                      <li>• Generate training datasets</li>
                    </ul>
                    <p className="text-white mt-3">What type of dataset would you like to create?</p>
                  </div>
                </div>
              </div>

              {/* Quick Questions */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-400">💡</span>
                  <span className="text-sm font-medium text-slate-300">Quick Presets:</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presetDatasets.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => setDescription(preset.description)}
                      className="px-3 py-2 text-xs hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:border-blue-500 transition-all duration-200 text-left"
                      style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)' }}
                      disabled={isGenerating}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Area */}
              <div className="space-y-4">
                <div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the dataset you want to generate... (e.g., 'Sales data for a retail company with product names, prices, quantities, customer information')"
                    className="w-full px-4 py-3 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm"
                    rows={3}
                    disabled={isGenerating}
                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
                  />
                </div>

                {/* Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Rows</label>
                    <input
                      type="number"
                      value={rows}
                      onChange={(e) => setRows(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
                      min="1"
                      max="10000"
                      className="w-full px-3 py-2 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      disabled={isGenerating}
                      style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
                    />
                  </div>
                  
                  {!useCustomColumns && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Columns (optional)</label>
                                              <input
                          type="number"
                          value={columns}
                          onChange={(e) => setColumns(e.target.value ? parseInt(e.target.value) : '')}
                          min="1"
                          max="50"
                          placeholder="Auto"
                          className="w-full px-3 py-2 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          disabled={isGenerating}
                          style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
                      />
                    </div>
                  )}
                </div>

                {/* Custom Columns Toggle */}
                <div>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomColumns}
                      onChange={(e) => setUseCustomColumns(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500"
                      disabled={isGenerating}
                    />
                    <span className="text-sm text-slate-300">
                      Specify custom columns
                    </span>
                  </label>
                </div>

                {/* Custom Columns */}
                {useCustomColumns && (
                  <div className="p-4 rounded-lg border border-slate-700" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                    <div className="space-y-3">
                      {customColumns.map((column, index) => (
                        <div key={index} className="flex gap-3 items-start">
                          <input
                            type="text"
                            value={column.name}
                            onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                            placeholder="Column name"
                            className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500"
                            style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
                            disabled={isGenerating}
                          />
                          <input
                            type="text"
                            value={column.description}
                            onChange={(e) => handleColumnChange(index, 'description', e.target.value)}
                            placeholder="Description (e.g., 'Customer email addresses')"
                            className="flex-2 px-3 py-2 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500"
                            style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
                            disabled={isGenerating}
                          />
                          {customColumns.length > 1 && (
                            <button
                              onClick={() => handleRemoveColumn(index)}
                              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                              disabled={isGenerating}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={handleAddColumn}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                        disabled={isGenerating}
                      >
                        + Add Column
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                    {error}
                  </div>
                )}

                {/* Generate Button */}
                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !description.trim()}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Generate Dataset
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-slate-700/50">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>🔒</span>
                  <span>Your data specifications stay secure and private</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
} 