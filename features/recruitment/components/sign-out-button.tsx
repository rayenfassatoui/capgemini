'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { IconLogout } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface SignOutButtonProps {
  isCollapsed?: boolean;
}

export function SignOutButton({ isCollapsed = false }: SignOutButtonProps = {}) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size={isCollapsed ? "icon" : "sm"}
      className={cn(
        "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
        isCollapsed ? "justify-center h-9 w-9" : "w-full justify-start gap-2"
      )}
      onClick={handleSignOut}
    >
      <IconLogout className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span>Sign Out</span>}
    </Button>
  );
}
