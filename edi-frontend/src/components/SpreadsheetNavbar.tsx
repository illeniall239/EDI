'use client';

import React, { useState, useRef, useEffect } from 'react';
import { File, ChevronDown, Download, ChevronRight, Trash2, Edit, Table, FileSpreadsheet } from 'lucide-react';
import ConfirmationDialog from './ConfirmationDialog';

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
  onClearData?: () => void;
  onExportCSV?: () => void;
  onExportExcel?: () => void;
  data: any[];
  
  // Tools
  
  // States for dialogs
  // Mode determines which controls are visible
}

export default function SpreadsheetNavbar({
  currentWorkspace,
  workspaces,
  onWorkspaceChange,
  onRenameWorkspace,
  onDeleteWorkspace,
  onClearData,
  onExportCSV,
  onExportExcel,
  data,
}: SpreadsheetNavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fileDropdownOpen, setFileDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);


  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileDropdownRef = useRef<HTMLDivElement>(null);
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
              {/* File Menu. Everything in it -- export, clear -- needs data,
                 so with an empty sheet the button would open an empty box. */}
              {data.length > 0 && (
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
                      {/* Export submenu */}
                      {data.length > 0 && (
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

                      {onClearData && data.length > 0 && (
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
              )}
            </div>

          </div>

          {/* Right section - Workspace Selector and User Profile */}
          <div className="flex items-center space-x-4">

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

          </div>
        </div>

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