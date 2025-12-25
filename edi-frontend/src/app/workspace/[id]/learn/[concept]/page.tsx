'use client';

import dynamic from 'next/dynamic';

// These imports are unused but kept for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _LearnSheet = dynamic(() => import('@/components/SpreadsheetWrapper'), { ssr: false });

export default function ConceptDetailPage() {
  if (typeof window !== 'undefined') {
    const parts = window.location.pathname.split('/');
    const workspaceId = parts[2] || '';
    window.location.replace(`/workspace/${workspaceId}`);
  }
  return null;
}


