'use client';

import { WorkspaceProvider } from '@/contexts/WorkspaceContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      {children}
    </WorkspaceProvider>
  );
} 