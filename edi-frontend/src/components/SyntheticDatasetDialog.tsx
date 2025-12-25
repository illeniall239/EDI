'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Database, X, Info, Hand, Lightbulb, ChevronUp, ChevronDown, Trash2, Play, Lock } from 'lucide-react';

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
  
  // Input validation states
  const [rowsInput, setRowsInput] = useState('100');
  const [columnsInput, setColumnsInput] = useState('');
  const [inputErrors, setInputErrors] = useState<{ rows?: string; columns?: string }>({});

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dialogPos, setDialogPos] = useState<{left: number, top: number} | null>(null);
  const [dragOffset, setDragOffset] = useState<{x: number, y: number}>({x: 0, y: 0});
  const modalRef = useRef<HTMLDivElement>(null);

  // Sync input states with actual values
  useEffect(() => {
    setRowsInput(rows.toString());
  }, [rows]);

  useEffect(() => {
    setColumnsInput(typeof columns === 'number' ? columns.toString() : '');
  }, [columns]);

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!modalRef.current) return;
    
    const rect = modalRef.current.getBoundingClientRect();
    const offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setDragOffset(offset);
    setIsDragging(true);
    
    if (!dialogPos) {
      setDialogPos({
        left: rect.left,
        top: rect.top
      });
    }
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const newLeft = e.clientX - dragOffset.x;
    const newTop = e.clientY - dragOffset.y;
    
    // Keep modal within viewport bounds
    const maxLeft = window.innerWidth - 400;
    const maxTop = window.innerHeight - 300;
    
    const boundedPos = {
      left: Math.max(0, Math.min(newLeft, maxLeft)),
      top: Math.max(0, Math.min(newTop, maxTop))
    };
    
    setDialogPos(boundedPos);
  }, [dragOffset, isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle drag event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', handleDragEnd);
    } else {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDrag, handleDragEnd]);

  const handleClose = () => {
    if (!isGenerating) {
      setDescription('');
      setRows(100);
      setColumns('');
      setUseCustomColumns(false);
      setCustomColumns([{ name: '', description: '' }]);
      setError(null);
      setRowsInput('100');
      setColumnsInput('');
      setInputErrors({});
      setDialogPos(null); // Reset dialog position to center on next open
      onClose();
    }
  };

  // Input validation functions
  const validateAndSetRows = (inputValue: string) => {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setInputErrors(prev => ({ ...prev, rows: undefined }));
      return;
    }
    
    const value = parseInt(trimmed);
    if (isNaN(value)) {
      setInputErrors(prev => ({ ...prev, rows: 'Please enter a valid number' }));
    } else if (value === 0) {
      setInputErrors(prev => ({ ...prev, rows: "Can't generate 0 rows" }));
    } else if (value < 1) {
      setInputErrors(prev => ({ ...prev, rows: 'Rows must be at least 1' }));
    } else if (value > 10000) {
      setInputErrors(prev => ({ ...prev, rows: 'Maximum 10,000 rows allowed' }));
    } else {
      setRows(value);
      setInputErrors(prev => ({ ...prev, rows: undefined }));
    }
  };

  const validateAndSetColumns = (inputValue: string) => {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setColumns('');
      setInputErrors(prev => ({ ...prev, columns: undefined }));
      return;
    }
    
    const value = parseInt(trimmed);
    if (isNaN(value)) {
      setInputErrors(prev => ({ ...prev, columns: 'Please enter a valid number' }));
    } else if (value === 0) {
      setInputErrors(prev => ({ ...prev, columns: "Can't generate 0 columns" }));
    } else if (value < 1) {
      setInputErrors(prev => ({ ...prev, columns: 'Columns must be at least 1' }));
    } else if (value > 100) {
      setInputErrors(prev => ({ ...prev, columns: 'Maximum 100 columns allowed' }));
    } else {
      setColumns(value);
      setInputErrors(prev => ({ ...prev, columns: undefined }));
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
    // Clear previous error
    setError(null);
    
    // Validate all fields before generation
    if (!description.trim()) {
      setError('Please provide a description for the dataset');
      return;
    }
    
    // Validate rows input
    if (inputErrors.rows) {
      setError('Please fix the rows field error before generating');
      return;
    }
    if (rows < 1) {
      setError("Can't generate 0 rows");
      return;
    }
    if (rows > 10000) {
      setError('Maximum 10,000 rows allowed');
      return;
    }
    
    // Validate columns input (if provided)
    if (inputErrors.columns) {
      setError('Please fix the columns field error before generating');
      return;
    }
    if (typeof columns === 'number' && columns < 1) {
      setError("Can't generate 0 columns");
      return;
    }
    
    setIsGenerating(true);

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
    <>
      {isOpen && (
          <div
            ref={modalRef}
            className="fixed w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden bg-card z-[9999]"
            style={{
              top: dialogPos?.top && dialogPos.top < window.innerHeight - 500 ? dialogPos.top : '50%',
              left: dialogPos?.left && dialogPos.left < window.innerWidth - 500 ? dialogPos.left : '50%',
              transform: dialogPos ? 'none' : 'translate(-50%, -50%)',
              cursor: isDragging ? 'grabbing' : 'default',
            }}
          >
            {/* Header */}
            <div 
              className="border-b border-border p-4"
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              onMouseDown={handleDragStart}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">AI Synthetic Dataset Generator</h2>
                    <p className="text-sm text-muted-foreground">Generate realistic sample data using AI</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={isGenerating}
                  className="p-2 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              {/* Welcome Message */}
              <div className="mb-6 p-4 rounded-lg border border-border bg-muted/50">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-primary/10 text-primary rounded-lg mt-0.5">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium mb-2 flex items-center gap-2">
                      <Hand className="w-4 h-4" />
                      Hi! I&apos;m your data generation assistant. I can help you:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Generate realistic sample datasets</li>
                      <li>• Create custom data structures</li>
                      <li>• Produce data with specific patterns</li>
                      <li>• Build test data for development</li>
                      <li>• Generate training datasets</li>
                    </ul>
                    <p className="text-foreground mt-3">What type of dataset would you like to create?</p>
                  </div>
                </div>
              </div>

              {/* Quick Questions */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Quick Presets:</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presetDatasets.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => setDescription(preset.description)}
                      className="px-3 py-2 text-xs hover:bg-primary text-foreground hover:text-primary-foreground rounded-lg border border-border hover:border-primary transition-all duration-200 text-left bg-muted/30"
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
                    className="w-full px-4 py-3 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none text-sm bg-input"
                    rows={3}
                    disabled={isGenerating}
                  />
                </div>

                {/* Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-foreground mb-2">Rows</label>
                    <div className="relative flex">
                      <input
                        type="text"
                        value={rowsInput}
                        onChange={(e) => {
                          setRowsInput(e.target.value);
                          setInputErrors(prev => ({ ...prev, rows: undefined }));
                        }}
                        onBlur={(e) => validateAndSetRows(e.target.value)}
                        className={`flex-1 px-3 py-2 border rounded-l-lg text-foreground text-sm focus:outline-none focus:ring-1 bg-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          inputErrors.rows 
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                            : 'border-border focus:border-primary focus:ring-primary'
                        }`}
                        disabled={isGenerating}
                      />
                      <div className="flex flex-col border-y border-r border-border rounded-r-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const newValue = Math.min(10000, rows + 1);
                            setRows(newValue);
                            setRowsInput(newValue.toString());
                            setInputErrors(prev => ({ ...prev, rows: undefined }));
                          }}
                          disabled={isGenerating || rows >= 10000}
                          className="px-2 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b border-border"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newValue = Math.max(1, rows - 1);
                            setRows(newValue);
                            setRowsInput(newValue.toString());
                            setInputErrors(prev => ({ ...prev, rows: undefined }));
                          }}
                          disabled={isGenerating || rows <= 1}
                          className="px-2 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {inputErrors.rows && (
                      <p className="mt-1 text-xs text-red-500">{inputErrors.rows}</p>
                    )}
                  </div>
                  
                  {!useCustomColumns && (
                    <div>
                      <label className="block text-sm text-foreground mb-2">Columns (optional)</label>
                      <div className="relative flex">
                        <input
                          type="text"
                          value={columnsInput}
                          onChange={(e) => {
                            setColumnsInput(e.target.value);
                            setInputErrors(prev => ({ ...prev, columns: undefined }));
                          }}
                          onBlur={(e) => validateAndSetColumns(e.target.value)}
                          placeholder="Auto"
                          className={`flex-1 px-3 py-2 border rounded-l-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-1 bg-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            inputErrors.columns 
                              ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                              : 'border-border focus:border-primary focus:ring-primary'
                          }`}
                          disabled={isGenerating}
                        />
                        <div className="flex flex-col border-y border-r border-border rounded-r-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = typeof columns === 'number' ? Math.min(100, columns + 1) : 1;
                              setColumns(newValue);
                              setColumnsInput(newValue.toString());
                              setInputErrors(prev => ({ ...prev, columns: undefined }));
                            }}
                            disabled={isGenerating || (typeof columns === 'number' && columns >= 100)}
                            className="px-2 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b border-border"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof columns === 'number') {
                                const newValue = Math.max(1, columns - 1);
                                setColumns(newValue);
                                setColumnsInput(newValue.toString());
                              } else {
                                setColumns('');
                                setColumnsInput('');
                              }
                              setInputErrors(prev => ({ ...prev, columns: undefined }));
                            }}
                            disabled={isGenerating || (typeof columns === 'number' && columns <= 1)}
                            className="px-2 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {inputErrors.columns && (
                        <p className="mt-1 text-xs text-red-500">{inputErrors.columns}</p>
                      )}
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
                      className="w-4 h-4 text-primary bg-input border-border rounded focus:ring-primary accent-primary"
                      disabled={isGenerating}
                    />
                    <span className="text-sm text-foreground">
                      Specify custom columns
                    </span>
                  </label>
                </div>

                {/* Custom Columns */}
                {useCustomColumns && (
                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-3">
                      {customColumns.map((column, index) => (
                        <div key={index} className="flex gap-3 items-start">
                          <input
                            type="text"
                            value={column.name}
                            onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                            placeholder="Column name"
                            className="flex-1 px-3 py-2 border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary bg-input"
                            disabled={isGenerating}
                          />
                          <input
                            type="text"
                            value={column.description}
                            onChange={(e) => handleColumnChange(index, 'description', e.target.value)}
                            placeholder="Description (e.g., 'Customer email addresses')"
                            className="flex-2 px-3 py-2 border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary bg-input"
                            disabled={isGenerating}
                          />
                          {customColumns.length > 1 && (
                            <button
                              onClick={() => handleRemoveColumn(index)}
                              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                              disabled={isGenerating}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={handleAddColumn}
                        className="text-sm text-primary hover:text-primary/80 transition-colors"
                        disabled={isGenerating}
                      >
                        + Add Column
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="p-3 bg-destructive/20 border border-destructive rounded-lg text-destructive text-sm">
                    {error}
                  </div>
                )}

                {/* Generate Button */}
                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !description.trim()}
                    className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Generate Dataset
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  <span>Your data specifications stay secure and private</span>
                </div>
              </div>
            </div>
          </div>
      )}
    </>
  );
} 