'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { IconLoader } from '@tabler/icons-react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError, data } = await authClient.signIn.email({
      email,
      password,
    });

    if (authError) {
      setError(authError.message ?? 'Sign in failed');
      setLoading(false);
      return;
    }

    // Redirect to role-specific dashboard
    const role = (data?.user as Record<string, unknown>)?.role as string | undefined;
    const roleHome: Record<string, string> = {
      ta: '/ta/dashboard',
      manager: '/manager/dashboard',
      hr: '/hr/dashboard',
      admin: '/admin',
    };
    const destination = roleHome[role ?? 'ta'] ?? '/ta/dashboard';
    router.push(destination);
    router.refresh();
  }

  return (
    <Card className="border-gray-200 dark:border-gray-800">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
          Sign in to your account
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <FieldContent>
                <Input
                  type="email"
                  placeholder="you@capgemini.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Password</FieldLabel>
              <FieldContent>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  minLength={8}
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          {error && <FieldError>{error}</FieldError>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <IconLoader className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Sign In
          </Button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            No account?{' '}
            <Link
              href="/sign-up"
              className="font-medium text-gray-900 underline underline-offset-4 hover:text-gray-700 dark:text-white dark:hover:text-gray-300"
            >
              Create one
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
