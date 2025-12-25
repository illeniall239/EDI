'use client';

/**
 * NativeSpreadsheet.tsx - DEPRECATED
 *
 * This component was the Luckysheet-based spreadsheet implementation.
 * It has been replaced by UniversalSpreadsheet which uses Univer.
 *
 * DO NOT USE THIS COMPONENT.
 *
 * Migration: Use <UniversalSpreadsheet /> instead.
 */

import React from 'react';

interface NativeSpreadsheetProps {
  data?: Array<any>;
  onCommand?: (command: string) => Promise<any>;
  onDataUpdate?: (newData: Array<any>) => void;
  onFileUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearData?: () => void;
  isDataEmpty?: boolean;
  filename?: string;
  isFromSavedWorkspace?: boolean;
  mode?: 'work' | 'learn';
  disableFormulaErrorUI?: boolean;
  learnChatMinimal?: boolean;
}

const NativeSpreadsheet: React.FC<NativeSpreadsheetProps> = () => {
  console.error('⚠️ NativeSpreadsheet component is deprecated and should not be used');
  console.error('⚠️ Please use UniversalSpreadsheet instead');

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-center p-8">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold mb-4">Component Deprecated</h1>
        <p className="text-gray-400 mb-2">NativeSpreadsheet (Luckysheet) is no longer supported.</p>
        <p className="text-gray-400">Please use UniversalSpreadsheet (Univer) instead.</p>
      </div>
    </div>
  );
};

export default NativeSpreadsheet;
