'use client';

import React, { useState, useRef, useEffect } from 'react';
import { BarChart3, FileText, File, ChevronDown, Upload, Database, Download, ChevronRight, Trash2, Settings, Columns3, Calculator, Menu, Edit, Table, FileSpreadsheet, Zap } from 'lucide-react';
import UserProfile from './UserProfile';
import ConfirmationDialog from './ConfirmationDialog';
import { isUniverEnabled, toggleSpreadsheetEngine } from '@/config/spreadsheetConfig';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface SpreadsheetNavbarProps {
  // User Profile & Workspace
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  onWorkspaceChange: (workspace: Workspace) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  
  // Data Operations
  onFileUpload?: (files: FileList) => void;
  onGenerateDataset: () => void;
  onGenerateQualityReport: () => void;
  onGenerateReport: () => void;
  onExtractColumns: () => void;
  onClearData?: () => void;
  onExportCSV?: () => void;
  onExportExcel?: () => void;
  data: any[];
  isGeneratingReport: boolean;
  
  // Tools
  onShowFormulaAssistant: () => void;
  
  // States for dialogs
  setShowSyntheticDatasetDialog: (show: boolean) => void;
  setShowColumnExtraction: (show: boolean) => void;
  // Mode determines which controls are visible
  mode?: 'work' | 'learn';
}

export default function SpreadsheetNavbar({
  currentWorkspace,
  workspaces,
  onWorkspaceChange,
  onRenameWorkspace,
  onDeleteWorkspace,
  onFileUpload,
  onGenerateDataset: _onGenerateDataset,
  onGenerateQualityReport,
  onGenerateReport,
  onExtractColumns: _onExtractColumns,
  onClearData,
  onExportCSV,
  onExportExcel,
  data,
  isGeneratingReport,
  onShowFormulaAssistant,
  setShowSyntheticDatasetDialog,
  setShowColumnExtraction,
  mode = 'work'
}: SpreadsheetNavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fileDropdownOpen, setFileDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);

  void _onGenerateDataset;
  void _onExtractColumns;

  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileDropdownRef = useRef<HTMLDivElement>(null);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is inside the Univer spreadsheet container
      const univerContainer = document.getElementById('univer-container');
      const isClickInsideSpreadsheet = univerContainer && univerContainer.contains(target);

      // Close all dropdowns if clicking inside spreadsheet
      if (isClickInsideSpreadsheet) {
        setDropdownOpen(false);
        setFileDropdownOpen(false);
        setToolsDropdownOpen(false);
        setExportDropdownOpen(false);
        return;
      }

      // Otherwise, close dropdowns when clicking outside their refs
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (fileDropdownRef.current && !fileDropdownRef.current.contains(target)) {
        setFileDropdownOpen(false);
      }
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(target)) {
        setToolsDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(target)) {
        setExportDropdownOpen(false);
      }
    };

    // Use capture phase (true) to catch events BEFORE Univer's internal handlers stop propagation
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const handleSave = async (id: string, newName: string) => {
    if (!newName.trim() || newName === currentWorkspace?.name) {
      setEditingId(null);
      setEditValue('');
      return;
    }

    setEditLoading(true);
    try {
      await onRenameWorkspace(id, newName.trim());
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error renaming workspace:', error);
    } finally {
      setEditLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleSave(id, editValue);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  };


  return (
    <nav className="w-full bg-background/95 backdrop-blur-sm border-b border-border fixed top-0 left-0 z-50">
      <div className="max-w-full px-8">
        <div className="flex justify-between items-center h-12">
          {/* Left section - Logo and Navigation */}
          <div className="flex items-center space-x-6">
            {/* Logo */}
            <div className="flex-shrink-0">
              <span className="text-xl font-bold text-white font-pixelify">EDI.ai</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              {/* File Menu */}
              <div className="relative" ref={fileDropdownRef}>
                <button
                  onClick={() => setFileDropdownOpen(!fileDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-all text-sm text-white hover:text-white"
                >
                  <File className="w-4 h-4" />
                  File
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {fileDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-popover backdrop-blur-sm rounded-lg shadow-xl border border-border py-2 z-50">
                    {onFileUpload && mode === 'work' && (
                      <label className="flex items-center gap-3 px-4 py-2 hover:bg-accent cursor-pointer text-sm text-popover-foreground hover:text-accent-foreground">
                        <Upload className="w-4 h-4" />
                        Upload Data
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          multiple
                          onChange={(e) => e.target.files && onFileUpload(e.target.files)}
                          className="hidden"
                        />
                      </label>
                    )}
                    
                    <button
                      onClick={() => {
                        setShowSyntheticDatasetDialog(true);
                        setFileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                    >
                      <Database className="w-4 h-4" />
                      {mode === 'learn' ? 'Load Practice Dataset' : 'Generate Dataset'}
                    </button>

                    {/* Export submenu */}
                    {data.length > 0 && mode === 'work' && (
                      <div className="relative" ref={exportDropdownRef}>
                        <button
                          onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                        >
                          <div className="flex items-center gap-3">
                            <Download className="w-4 h-4" />
                            Export File
                          </div>
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        {exportDropdownOpen && (
                          <div className="absolute left-full top-0 ml-1 w-44 bg-popover backdrop-blur-sm rounded-lg shadow-xl border border-border py-2 z-50">
                            {onExportCSV && (
                              <button
                                onClick={() => {
                                  onExportCSV();
                                  setExportDropdownOpen(false);
                                  setFileDropdownOpen(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                              >
                                <Table className="w-4 h-4" />
                                Export as CSV
                              </button>
                            )}
                            {onExportExcel && (
                              <button
                                onClick={() => {
                                  onExportExcel();
                                  setExportDropdownOpen(false);
                                  setFileDropdownOpen(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                              >
                                <FileSpreadsheet className="w-4 h-4" />
                                Export as Excel
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {onClearData && data.length > 0 && mode === 'work' && (
                      <button
                        onClick={() => {
                          setShowClearDataConfirm(true);
                          setFileDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-destructive text-sm text-popover-foreground hover:text-destructive-foreground"
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear Data
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tools Menu */}
              <div className="relative" ref={toolsDropdownRef}>
                <button
                  onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-all text-sm text-white hover:text-white"
                >
                  <Settings className="w-4 h-4" />
                  Tools
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {toolsDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-popover backdrop-blur-sm rounded-lg shadow-xl border border-border py-2 z-50">
                    {mode === 'work' && (
                    <button
                      onClick={() => {
                        onGenerateQualityReport();
                        setToolsDropdownOpen(false);
                      }}
                      disabled={isGeneratingReport}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground disabled:opacity-50"
                    >
                      {isGeneratingReport ? (
                        <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <BarChart3 className="w-4 h-4" />
                      )}
                      {isGeneratingReport ? 'Analyzing...' : 'Quality Report'}
                    </button>)}

                    {mode === 'work' && (
                    <button
                      onClick={() => {
                        onGenerateReport();
                        setToolsDropdownOpen(false);
                      }}
                      disabled={isGeneratingReport}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground disabled:opacity-50"
                    >
                      {isGeneratingReport ? (
                        <div className="w-4 h-4 border border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      {isGeneratingReport ? 'Generating...' : 'Insight Report (PDF)'}
                    </button>)}

                    {data.length > 0 && mode === 'work' && (
                      <button
                        onClick={() => {
                          setShowColumnExtraction(true);
                          setToolsDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                      >
                        <Columns3 className="w-4 h-4" />
                        Extract Columns
                      </button>
                    )}

                    <button
                      onClick={() => {
                        onShowFormulaAssistant();
                        setToolsDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                    >
                      <Calculator className="w-4 h-4" />
                      {mode === 'learn' ? 'Get Hint' : 'Formula Assistant'}
                    </button>


                  </div>
                )}
              </div>



            </div>

            {/* Mobile hamburger menu */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md hover:bg-white/10 transition-colors"
              >
                <Menu className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Right section - Workspace Selector and User Profile */}
          <div className="flex items-center space-x-4">

            {/* Spreadsheet Engine Toggle */}
            <button
              onClick={toggleSpreadsheetEngine}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 transition-colors text-sm text-white hover:text-white"
              title={isUniverEnabled() ? "Switch to Luckysheet" : "Switch to Univer (Beta)"}
            >
              <Zap className={`w-4 h-4 ${isUniverEnabled() ? 'text-yellow-400' : 'text-gray-400'}`} />
              <span className="font-medium">{isUniverEnabled() ? 'Univer' : 'Luckysheet'}</span>
            </button>

            {/* Workspace Selector */}
            <div className="hidden sm:block relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-sm text-white hover:text-white max-w-48"
              >
                <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                <span className="truncate font-medium">
                  {currentWorkspace?.name || 'No Workspace'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-popover backdrop-blur-sm rounded-lg shadow-xl border border-border py-2 z-50 max-h-80 overflow-y-auto">
                  <div className="py-2">
                    {workspaces.map((workspace) => (
                      <div key={workspace.id} className="group">
                        {editingId === workspace.id ? (
                          <div className="px-3 py-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyPress(e, workspace.id)}
                              onBlur={() => handleSave(workspace.id, editValue)}
                              className="w-full px-2 py-1 bg-card border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary"
                              autoFocus
                              disabled={editLoading}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-between px-3 py-2 hover:bg-accent">
                            <button
                              onClick={() => {
                                onWorkspaceChange(workspace);
                                setDropdownOpen(false);
                              }}
                              className="flex items-center gap-2 flex-1 text-left"
                            >
                              <div className={`w-2 h-2 rounded-full ${currentWorkspace?.id === workspace.id ? 'bg-primary' : 'bg-muted-foreground'}`}></div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white truncate">{workspace.name}</div>
                                {workspace.description && (
                                  <div className="text-xs text-muted-foreground truncate">{workspace.description}</div>
                                )}
                              </div>
                            </button>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingId(workspace.id);
                                  setEditValue(workspace.name);
                                }}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground"
                                title="Rename"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => onDeleteWorkspace(workspace.id)}
                                className="p-1 rounded hover:bg-destructive text-muted-foreground hover:text-destructive-foreground"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>


            {/* User Profile */}
            <UserProfile variant="floating" dropdownDirection="down" />
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border py-3 space-y-2">

            {/* Mobile File Operations */}
            <div className="px-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">File</h3>
              <div className="space-y-1">
                {onFileUpload && (
                  <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md bg-card hover:bg-primary cursor-pointer text-xs text-card-foreground hover:text-primary-foreground">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Data
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      multiple
                      onChange={(e) => e.target.files && onFileUpload(e.target.files)}
                      className="hidden"
                    />
                  </label>
                )}
                
                <button
                  onClick={() => {
                    setShowSyntheticDatasetDialog(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md bg-card hover:bg-primary text-xs text-card-foreground hover:text-primary-foreground"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Generate Dataset
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Clear Data Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showClearDataConfirm}
        onClose={() => setShowClearDataConfirm(false)}
        onConfirm={() => onClearData && onClearData()}
        title="Clear All Data?"
        message="Are you sure you want to clear all data? This action cannot be undone."
        confirmText="Clear Data"
        cancelText="Cancel"
        confirmVariant="destructive"
      />
    </nav>
  );
}