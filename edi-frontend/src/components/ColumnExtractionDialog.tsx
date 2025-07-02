'use client';

import React, { useState, useEffect } from 'react';
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

  // Fetch available columns when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchColumns();
    }
  }, [isOpen]);

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden text-gray-900" style={{color: '#111827', backgroundColor: '#ffffff'}}>
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Extract Columns</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading columns...</p>
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="mb-6 space-y-4">
                {/* Search and Filter */}
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search columns..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white text-gray-900"
                    >
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sheet Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Sheet Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter custom sheet name..."
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                  />
                </div>

                {/* Select All */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors font-medium"
                  >
                    {selectedColumns.size === filteredColumns.length ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {selectedColumns.size === filteredColumns.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-sm text-gray-600 font-medium">
                    {selectedColumns.size} of {filteredColumns.length} columns selected
                  </span>
                </div>
              </div>

              {/* Columns List */}
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredColumns.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No columns found matching your criteria
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredColumns.map((column) => (
                      <div
                        key={column.name}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleColumnToggle(column.name)}
                            className="flex-shrink-0 mt-1"
                          >
                            {selectedColumns.has(column.name) ? (
                              <div className="w-5 h-5 bg-blue-600 border-2 border-blue-600 rounded flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 border-2 border-gray-300 rounded hover:border-blue-400 transition-colors"></div>
                            )}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900 truncate">
                                {column.name}
                              </h3>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                column.data_category === 'Text' ? 'bg-green-100 text-green-800' :
                                column.data_category === 'Numeric' ? 'bg-blue-100 text-blue-800' :
                                column.data_category === 'Date/Time' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {column.data_category}
                              </span>
                            </div>
                            
                            <div className="text-sm text-gray-600 space-y-1">
                              <div className="flex items-center gap-4">
                                <span>Type: {column.type}</span>
                                <span>Completeness: {column.completeness_percentage}%</span>
                                <span>Unique: {column.unique_count}</span>
                              </div>
                              
                              {column.sample_values.length > 0 && (
                                <div>
                                  <span className="font-medium">Sample values: </span>
                                  <span className="text-gray-500">
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
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {columns.length > 0 && (
              <>Total: {columns.length} columns, {selectedColumns.size} selected</>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExtract}
              disabled={selectedColumns.size === 0 || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Extract Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 