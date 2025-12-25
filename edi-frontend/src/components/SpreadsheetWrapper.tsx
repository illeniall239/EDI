/**
 * SpreadsheetWrapper Component
 * 
 * Wrapper component that switches between Luckysheet and Univer
 * based on feature flag during migration period
 */

'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { getSpreadsheetEngine, SPREADSHEET_ENGINE } from '@/config/spreadsheetConfig';
import dynamic from 'next/dynamic';

// Lazy load spreadsheet components
const NativeSpreadsheet = lazy(() => import('./NativeSpreadsheet'));

// Dynamically import UniveralSpreadsheet with SSR disabled
const UniversalSpreadsheet = dynamic(() => import('./UniversalSpreadsheet'), {
  ssr: false,
  loading: () => <SpreadsheetLoadingFallback />,
});

interface SpreadsheetWrapperProps {
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
  hideSidebar?: boolean;
  initialSheets?: any[];
  onAdapterReady?: (adapter: any) => void; // For Univer adapter persistence
}

/**
 * Loading fallback component
 */
function SpreadsheetLoadingFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-lg text-foreground font-medium">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Main wrapper component
 */
export default function SpreadsheetWrapper(props: SpreadsheetWrapperProps) {
  const [engine, setEngine] = useState<string>(SPREADSHEET_ENGINE.LUCKYSHEET);
  const [mounted, setMounted] = useState(false);

  // Only determine engine on client side to avoid hydration mismatch
  useEffect(() => {
    setEngine(getSpreadsheetEngine());
    setMounted(true);
  }, []);

  // Show loading until mounted to avoid hydration issues
  if (!mounted) {
    return <SpreadsheetLoadingFallback />;
  }

  console.log(`📊 [SpreadsheetWrapper] Using engine: ${engine}`);

  return (
    <Suspense fallback={<SpreadsheetLoadingFallback />}>
      {engine === SPREADSHEET_ENGINE.UNIVER ? (
        <UniversalSpreadsheet {...props} />
      ) : (
        <NativeSpreadsheet {...props} />
      )}
    </Suspense>
  );
}

/**
 * Export engine info for debugging
 */
export { getSpreadsheetEngine, SPREADSHEET_ENGINE };

