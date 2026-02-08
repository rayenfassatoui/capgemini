import type { ReactNode } from 'react';
import { CapgeminiLogo } from '@/components/shared/icons';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <CapgeminiLogo className="h-10 w-auto" />
          <p className="text-xs font-medium tracking-widest text-gray-500 uppercase dark:text-gray-400">
            Talent Intelligence
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
