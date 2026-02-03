---
description: Better Auth authentication and authorization patterns
triggers:
  - "lib/auth.ts"
  - "features/**/auth/**"
  - "app/api/auth/**"
  - keywords: ["auth", "authentication", "authorization", "session", "login", "signup"]
priority: 9
version: 1.0.0
last_updated: 2026-02-03
---

# Better Auth Authentication Patterns

## Overview

Better Auth is a framework-agnostic TypeScript authentication library with comprehensive features including email/password, social providers, 2FA, and more. This skill provides guidance on integrating Better Auth with Next.js and Feature-Driven Architecture.

## When to Use

- Setting up authentication system
- Implementing login/signup flows
- Managing user sessions
- Social authentication (OAuth)
- Two-factor authentication
- Role-based access control
- Organization management

---

## Core Features

- 📧 Email & Password authentication
- 🔐 Social Sign-On (Google, GitHub, etc.)
- 🔑 Two-Factor Authentication
- 👥 Organization & Access Control
- 🔄 Session Management
- 🚦 Built-in Rate Limiting
- 📊 Automatic Database Management
- 🧩 Plugin Ecosystem

---

## Installation

```bash
# Install Better Auth
bun add better-auth

# Client package (for React)
bun add better-auth
```

---

## Setup

### 1. Environment Variables

```bash
# .env.local
BETTER_AUTH_SECRET="your-secret-key-min-32-chars" # openssl rand -base64 32
BETTER_AUTH_URL="http://localhost:3000"

# Social Providers (optional)
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### 2. Create Auth Instance

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/lib/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg', // or "mysql", "sqlite"
  }),
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  
  rateLimit: {
    enabled: true,
    window: 60, // 1 minute
    max: 10, // 10 requests per window
  },
});
```

### 3. Database Schema

```bash
# Generate schema/migrations
npx @better-auth/cli generate

# Or migrate directly
npx @better-auth/cli migrate
```

Better Auth automatically creates these tables:
- `user` - User accounts
- `session` - Active sessions
- `account` - OAuth accounts
- `verification` - Email verification tokens

### 4. API Route Handler

```typescript
// app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { POST, GET } = toNextJsHandler(auth);
```

### 5. Client Setup

```typescript
// lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
});

// Export specific methods
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  user,
} = authClient;
```

---

## Usage Patterns

### 1. Sign Up Form

```typescript
// features/auth/components/signup-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      await authClient.signUp.email({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        name: formData.get('name') as string,
      });

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          disabled={isLoading}
        />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          disabled={isLoading}
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Creating account...' : 'Sign Up'}
      </Button>
    </form>
  );
}
```

### 2. Sign In Form

```typescript
// features/auth/components/signin-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconBrandGithub, IconBrandGoogle } from '@tabler/icons-react';

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      await authClient.signIn.email({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
      });

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: 'github' | 'google') => {
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: '/dashboard',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            disabled={isLoading}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-gray-500">Or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn('github')}
        >
          <IconBrandGithub className="mr-2 h-4 w-4" />
          GitHub
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignIn('google')}
        >
          <IconBrandGoogle className="mr-2 h-4 w-4" />
          Google
        </Button>
      </div>
    </div>
  );
}
```

### 3. Session Management

```typescript
// features/auth/components/user-menu.tsx
'use client';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/');
  };

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      <span>Welcome, {session.user.name || session.user.email}</span>
      <Button onClick={handleSignOut} variant="outline">
        Sign Out
      </Button>
    </div>
  );
}
```

---

## Server-Side Authentication

### 1. Protect Server Components

```typescript
// app/dashboard/page.tsx
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {session.user.name}!</p>
    </div>
  );
}
```

### 2. Server Actions with Auth

```typescript
// features/projects/actions.ts
'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { createProject } from './services';

export async function createProjectAction(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const project = await createProject({
      name: formData.get('name') as string,
      description: formData.get('description') as string,
    }, session.user.id);

    return { success: true, project };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create project',
    };
  }
}
```

### 3. API Route Protection

```typescript
// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserProjects } from '@/features/projects/services';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const projects = await getUserProjects(session.user.id);
    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

---

## Middleware Protection

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/signup');
  const isProtectedPage = request.nextUrl.pathname.startsWith('/dashboard');

  // Redirect authenticated users away from auth pages
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Redirect unauthenticated users to login
  if (!session && isProtectedPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
```

---

## Advanced Features

### 1. Two-Factor Authentication

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';

export const auth = betterAuth({
  // ... other config
  plugins: [
    twoFactor({
      issuer: 'Your App Name',
    }),
  ],
});
```

```typescript
// Client usage
import { authClient } from '@/lib/auth-client';

// Enable 2FA
await authClient.twoFactor.enable({
  password: 'user-password',
});

// Verify 2FA code
await authClient.signIn.email({
  email: 'user@example.com',
  password: 'password',
  twoFactorCode: '123456',
});
```

### 2. Organization Management

```typescript
// lib/auth.ts
import { organization } from 'better-auth/plugins';

export const auth = betterAuth({
  // ... other config
  plugins: [
    organization(),
  ],
});
```

```typescript
// Create organization
await authClient.organization.create({
  name: 'My Organization',
  slug: 'my-org',
});

// Invite member
await authClient.organization.inviteMember({
  organizationId: 'org-id',
  email: 'member@example.com',
  role: 'member',
});
```

### 3. Role-Based Access Control

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  // ... other config
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
      },
    },
  },
});
```

```typescript
// Check role in server component
const session = await auth.api.getSession({ headers: await headers() });

if (session?.user.role !== 'admin') {
  return <div>Access denied</div>;
}
```

---

## Service Layer Integration

```typescript
// features/auth/services.ts
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getCurrentUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  
  if (!session) {
    return null;
  }

  return session.user;
}

export async function getUserById(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user;
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; email?: string }
) {
  const [updated] = await db
    .update(users)
    .set(data)
    .where(eq(users.id, userId))
    .returning();

  return updated;
}
```

---

## Best Practices

### DO:
- ✅ Use environment variables for secrets
- ✅ Enable email verification in production
- ✅ Implement rate limiting
- ✅ Use HTTPS in production
- ✅ Validate user input
- ✅ Hash passwords (Better Auth does this automatically)
- ✅ Implement CSRF protection (built-in)
- ✅ Use secure session cookies
- ✅ Handle authentication errors gracefully
- ✅ Test authentication flows thoroughly

### DON'T:
- ❌ Store passwords in plain text
- ❌ Expose user credentials in logs
- ❌ Skip email verification
- ❌ Use weak secrets
- ❌ Forget to implement rate limiting
- ❌ Expose internal error details to users
- ❌ Use HTTP in production
- ❌ Trust client-side authentication alone

---

## Error Handling

```typescript
// features/auth/utils/error-handler.ts
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Invalid credentials')) {
      return 'Invalid email or password';
    }
    if (error.message.includes('User already exists')) {
      return 'An account with this email already exists';
    }
    if (error.message.includes('Rate limit')) {
      return 'Too many attempts. Please try again later';
    }
    return error.message;
  }
  return 'An unexpected error occurred';
}
```

---

## Testing

```typescript
// tests/auth.test.ts
import { expect, test } from 'vitest';
import { authClient } from '@/lib/auth-client';

test('sign up creates new user', async () => {
  const result = await authClient.signUp.email({
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
  });

  expect(result.user).toBeDefined();
  expect(result.user.email).toBe('test@example.com');
});
```

---

## Checklist

Before deploying authentication:

- [ ] BETTER_AUTH_SECRET configured (min 32 chars)
- [ ] BETTER_AUTH_URL set correctly
- [ ] Database tables created
- [ ] Email verification enabled (production)
- [ ] Rate limiting configured
- [ ] Social providers set up (if using)
- [ ] HTTPS enforced (production)
- [ ] Session expiration configured
- [ ] Error handling implemented
- [ ] Middleware protection in place
- [ ] Password requirements enforced
- [ ] CSRF protection enabled (automatic)

---

## References

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Better Auth Examples](https://github.com/better-auth/better-auth/tree/main/examples)
- [Better Auth Plugins](https://www.better-auth.com/docs/plugins)
- [Better Auth API Reference](https://www.better-auth.com/docs/api-reference)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
