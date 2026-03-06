import type { ReactNode } from 'react';
import { CapgeminiLogo } from '@/components/shared/icons';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      {/* Visual Side (Hidden on Mobile) */}
      <div className="relative hidden h-full flex-col bg-zinc-900 p-10 text-white lg:flex dark:border-r dark:border-zinc-800">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="absolute inset-0 opacity-20 mix-blend-overlay" 
             style={{ 
               backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')",
               backgroundSize: 'cover',
               backgroundPosition: 'center'
             }} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />
        
        <div className="relative z-20 flex items-center gap-2 text-lg font-medium">
          <CapgeminiLogo className="h-8 w-auto text-white" />
          <span className="font-semibold tracking-tight">Talent Intelligence</span>
        </div>
        
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg font-medium leading-relaxed">
              &ldquo;Transforming recruitment with the power of artificial intelligence. Streamlining talent acquisition for the future of work.&rdquo;
            </p>
            <footer className="text-sm text-zinc-400">Capgemini Engineering</footer>
          </blockquote>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-zinc-950">
        <div className="w-full max-w-[400px] space-y-6">
          <div className="flex flex-col items-center gap-2 lg:hidden">
            <CapgeminiLogo className="h-10 w-auto" />
            <p className="text-xs font-medium tracking-widest text-gray-500 uppercase dark:text-gray-400">
              Talent Intelligence
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
