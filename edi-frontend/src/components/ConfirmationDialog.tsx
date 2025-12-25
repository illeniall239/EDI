'use client';

import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive';
}

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'default'
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };


  return createPortal(
    <div 
      className="fixed bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden z-[9999]"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    >
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              confirmVariant === 'destructive' 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-primary/10 text-primary'
            }`}>
              {confirmVariant === 'destructive' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {confirmVariant === 'destructive' 
                  ? 'This action cannot be undone' 
                  : 'Please confirm your choice'
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent text-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="bg-muted/20 rounded-lg p-4 mb-6">
          <p className="text-foreground leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent text-secondary-foreground hover:text-accent-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 shadow-sm ${
              confirmVariant === 'destructive' 
                ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground focus:ring-destructive/20 shadow-destructive/20' 
                : 'bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary/20 shadow-primary/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}