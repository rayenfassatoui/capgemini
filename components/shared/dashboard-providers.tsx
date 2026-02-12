'use client';

import type { ReactNode } from 'react';
import { UploadProvider } from '@/features/recruitment/components/upload-provider';
import { UploadProgressWidget } from '@/features/recruitment/components/upload-progress-widget';

export function DashboardProviders({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      {children}
      <UploadProgressWidget />
    </UploadProvider>
  );
}
