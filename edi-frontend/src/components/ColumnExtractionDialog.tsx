'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, Search, Filter, Database, Check, Square } from 'lucide-react';
import { API_BASE_URL } from '@/config';

interface ColumnInfo {
  name: string;
  type: string;
  non_null_count: number;
  total_count: number;
  unique_count: number;
  sample_values: string[];
  completeness_percentage: number;
  data_category: string;
}

interface ColumnExtractionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExtract: (selectedColumns: string[], sheetName?: string) => void;
}

export default function ColumnExtractionDialog({
  isOpen,
  onClose,
  onExtract
}: ColumnExtractionDialogProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [sheetName, setSheetName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dialogPos, setDialogPos] = useState<{left: number, top: number} | null>(null);
  const [dragOffset, setDragOffset] = useState<{x: number, y: number}>({x: 0, y: 0});
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch available columns when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchColumns();
    }
  }, [isOpen]);

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
  }, [isDragging, dragOffset]);

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

  const fetchColumns = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/columns`);
      const data = await response.json();
      
      if (data.success) {
        setColumns(data.columns);
      } else {
        setError(data.error || 'Failed to load columns');
      }
    } catch (err) {
      console.error('Error fetching columns:', err);
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  // Filter columns based on search and category
  const filteredColumns = columns.filter(col => {
    const matchesSearch = col.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || col.data_category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories for filter
  const categories = ['All', ...Array.from(new Set(columns.map(col => col.data_category)))];

  const handleColumnToggle = (columnName: string) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(columnName)) {
      newSelected.delete(columnName);
    } else {
      newSelected.add(columnName);
    }
    setSelectedColumns(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedColumns.size === filteredColumns.length) {
      setSelectedColumns(new Set());
    } else {
      setSelectedColumns(new Set(filteredColumns.map(col => col.name)));
    }
  };

  const handleExtract = () => {
    if (selectedColumns.size === 0) {
      setError('Please select at least one column to extract');
      return;
    }

    onExtract(Array.from(selectedColumns), sheetName || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
      <div 
        ref={modalRef}
        className="fixed w-full max-w-4xl rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[90vh] bg-card z-[9999]"
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
                <h2 className="text-lg font-semibold text-foreground">Extract Columns</h2>
                <p className="text-sm text-muted-foreground">Select columns to extract into a new sheet</p>
              </div>
            </div>
            <button
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-2 rounded-lg hover:bg-accent text-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {error && (
            <div className="bg-red-900/20 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-foreground">Loading columns...</p>
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="mb-6 space-y-4">
                {/* Search and Filter */}
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search columns..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-foreground placeholder-muted-foreground"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="pl-10 pr-8 py-2 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary appearance-none text-foreground"
                    >
                      {categories.map(category => (
                        <option key={category} value={category} className="bg-input text-foreground">{category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sheet Name */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    New Sheet Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter custom sheet name..."
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-foreground placeholder-muted-foreground"
                  />
                </div>

                {/* Select All */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    {selectedColumns.size === filteredColumns.length ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {selectedColumns.size === filteredColumns.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-sm text-muted-foreground font-medium">
                    {selectedColumns.size} of {filteredColumns.length} columns selected
                  </span>
                </div>
              </div>

              {/* Columns List */}
              <div className="max-h-96 overflow-y-auto border border-border rounded-lg bg-muted/20">
                {filteredColumns.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No columns found matching your criteria
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredColumns.map((column) => (
                      <div
                        key={column.name}
                        className="p-4 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleColumnToggle(column.name)}
                            className="flex-shrink-0 mt-1"
                          >
                            {selectedColumns.has(column.name) ? (
                              <div className="w-5 h-5 bg-primary border-2 border-primary rounded flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 border-2 border-border rounded hover:border-primary transition-colors"></div>
                            )}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-foreground truncate">
                                {column.name}
                              </h3>
                              <span className="px-2 py-1 text-xs rounded-full bg-muted/50 text-foreground border border-border">
                                {column.data_category}
                              </span>
                            </div>
                            
                            <div className="text-sm text-muted-foreground space-y-1">
                              <div className="flex items-center gap-4">
                                <span>Type: {column.type}</span>
                                <span>Completeness: {column.completeness_percentage}%</span>
                                <span>Unique: {column.unique_count}</span>
                              </div>
                              
                              {column.sample_values.length > 0 && (
                                <div>
                                  <span className="font-medium">Sample values: </span>
                                  <span className="text-muted-foreground">
                                    {column.sample_values.join(', ')}
                                    {column.unique_count > 3 && '...'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-muted/10">
          <div className="text-sm text-muted-foreground">
            {columns.length > 0 && (
              <>Total: {columns.length} columns, {selectedColumns.size} selected</>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExtract}
              disabled={selectedColumns.size === 0 || loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Extract Selected
            </button>
          </div>
        </div>
      </div>
  );
} 