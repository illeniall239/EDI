'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Trash2, Edit, Download, Plus, LayoutGrid } from 'lucide-react';
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
  onCreateWorkspace: () => void;
  onShowAllWorkbooks: () => void;
  
  // Data Operations
  onClearData?: () => void;
  onExportCSV?: () => void;
  /** Demo mode: one sample dataset, no persistence, nothing to switch to. */
  demo?: boolean;
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
  onCreateWorkspace,
  onShowAllWorkbooks,
  onClearData,
  onExportCSV,
  demo = false,
  data,
}: SpreadsheetNavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  // Deleting a workbook takes its data and chats with it, so it asks first.
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);


  const dropdownRef = useRef<HTMLDivElement>(null);
  

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is inside the Univer spreadsheet container
      const univerContainer = document.getElementById('univer-container');
      const isClickInsideSpreadsheet = univerContainer && univerContainer.contains(target);

      // Close the menu if clicking inside the spreadsheet
      if (isClickInsideSpreadsheet) {
        setDropdownOpen(false);
        return;
      }

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
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
          {/* Left section - Logo */}
          <div className="flex-shrink-0">
            <span className="text-[17px] font-semibold tracking-tight text-white">
              EDI<span style={{ color: 'var(--edi-signal)' }}>.ai</span>
            </span>
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
                  {/* What you can do to the workbook that is open. Nothing here
                     means anything on an empty sheet, so it only appears with
                     data in it. */}
                  {data.length > 0 && (
                    <div className="pb-2 mb-1 border-b border-border">
                      {onExportCSV && (
                        <button
                          onClick={() => {
                            onExportCSV();
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                        >
                          <Download className="w-4 h-4" />
                          Download as CSV
                        </button>
                      )}
                      {onClearData && !demo && (
                        <button
                          onClick={() => {
                            setShowClearDataConfirm(true);
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-destructive text-sm text-popover-foreground hover:text-destructive-foreground"
                        >
                          <Trash2 className="w-4 h-4" />
                          Clear data
                        </button>
                      )}
                    </div>
                  )}

                  {/* Empty until the summaries land, and an empty padded box
                     reads as a rendering fault rather than as a loading list.
                     A demo has exactly one workbook and never persists it, so
                     there is nothing to list there either. */}
                  {workspaces.length > 0 && !demo && (
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
                                onClick={() => {
                                  setPendingDelete(workspace);
                                  setDropdownOpen(false);
                                }}
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
                  )}

                  {!demo && (
                  <div className={`${workspaces.length > 0 ? 'border-t border-border pt-2 mt-1' : ''}`}>
                    <button
                      onClick={() => {
                        onCreateWorkspace();
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                    >
                      <Plus className="w-4 h-4" />
                      New workbook
                    </button>
                    <button
                      onClick={() => {
                        onShowAllWorkbooks();
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm text-popover-foreground hover:text-accent-foreground"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      All workbooks
                    </button>
                  </div>
                  )}
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

      <ConfirmationDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDeleteWorkspace(pendingDelete.id);
          setPendingDelete(null);
        }}
        title="Delete this workbook?"
        message={`"${pendingDelete?.name ?? ''}" and its data and chats will be deleted. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="destructive"
      />
    </nav>
  );
}