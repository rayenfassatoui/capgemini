'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { IconLogout } from '@tabler/icons-react';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      onClick={handleSignOut}
    >
      <IconLogout className="h-4 w-4" />
      Sign Out
    </Button>
  );
}
