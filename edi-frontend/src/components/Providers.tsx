'use client';

import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LearnModeProvider } from '@/contexts/LearnModeContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <LearnModeProvider>
          {children}
        </LearnModeProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
} 