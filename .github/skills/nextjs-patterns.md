---
description: Next.js App Router patterns for Feature-Driven Architecture
triggers:
  - "app/**/*.tsx"
  - "features/**/*.ts"
  - "features/**/actions.ts"
  - "features/**/services.ts"
  - keywords: ["server action", "app router", "route", "metadata"]
priority: 9
version: 1.0.0
last_updated: 2026-02-03
---

# Next.js App Router Patterns

## Overview

This skill defines patterns and best practices for using Next.js App Router within our Feature-Driven Architecture. It emphasizes the separation of routing concerns from business logic.

## Core Principle

**App Router is for ROUTING ONLY. Business logic belongs in features/.**

---

## App Router Structure

### Directory Organization

```
app/
├── layout.tsx                 # Root layout
├── page.tsx                   # Home page
├── loading.tsx                # Root loading state
├── error.tsx                  # Root error boundary
├── not-found.tsx              # 404 page
├── globals.css                # Global styles
│
├── (auth)/                    # Route group (no URL segment)
│   ├── login/
│   │   └── page.tsx
│   └── register/
│       └── page.tsx
│
├── projects/
│   ├── page.tsx               # List: /projects
│   ├── loading.tsx            # Loading state
│   ├── error.tsx              # Error boundary
│   ├── new/
│   │   └── page.tsx           # Create: /projects/new
│   └── [id]/
│       ├── page.tsx           # Details: /projects/:id
│       ├── edit/
│       │   └── page.tsx       # Edit: /projects/:id/edit
│       └── layout.tsx         # Nested layout
│
└── api/
    └── projects/
        ├── route.ts           # GET /api/projects
        └── [id]/
            └── route.ts       # GET /api/projects/:id
```

---

## Page Patterns

### 1. Server Component Pages (Default)

```typescript
// ✅ GOOD: Server Component for data fetching
import { getUserProjects } from '@/features/projects';
import { ProjectCard } from '@/features/projects';
import { getCurrentUser } from '@/lib/auth';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/login');
  }
  
  const projects = await getUserProjects(user.id);
  
  return (
    <div className="mx-auto max-w-7xl px-6 py-24">
      <h1 className="text-4xl font-bold">My Projects</h1>
      
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
```

### 2. Client Component Pages

```typescript
// ✅ GOOD: Client Component when needed
'use client';

import { useProject } from '@/features/projects';
import { useParams } from 'next/navigation';

export default function ProjectDetailsPage() {
  const params = useParams();
  const { data: project, isLoading } = useProject(params.id as string);
  
  if (isLoading) return <Loader />;
  if (!project) return <NotFound />;
  
  return <ProjectDetails project={project} />;
}
```

### 3. Hybrid Pattern (Recommended)

```typescript
// ✅ BEST: Server Component wrapper with Client Component for interactivity
import { getProjectById } from '@/features/projects';
import { ProjectDetailsClient } from '@/features/projects/components/project-details-client';

export default async function ProjectPage({ params }: Props) {
  const project = await getProjectById(params.id);
  
  if (!project) {
    notFound();
  }
  
  return <ProjectDetailsClient project={project} />;
}
```

---

## Metadata

### Static Metadata

```typescript
// ✅ GOOD: Static metadata
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Manage your projects',
};

export default function ProjectsPage() {
  return <div>...</div>;
}
```

### Dynamic Metadata

```typescript
// ✅ GOOD: Dynamic metadata based on data
import type { Metadata } from 'next';
import { getProjectById } from '@/features/projects';

type Props = {
  params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getProjectById(params.id);
  
  if (!project) {
    return {
      title: 'Project Not Found',
    };
  }
  
  return {
    title: `${project.name} - Projects`,
    description: project.description ?? undefined,
    openGraph: {
      title: project.name,
      description: project.description ?? undefined,
      type: 'website',
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const project = await getProjectById(params.id);
  
  if (!project) {
    notFound();
  }
  
  return <div>{project.name}</div>;
}
```

---

## Loading States

### Page-Level Loading

```typescript
// app/projects/loading.tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-24">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
```

### Suspense Boundaries

```typescript
// ✅ GOOD: Granular loading with Suspense
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      
      <Suspense fallback={<ProjectsSkeleton />}>
        <RecentProjects />
      </Suspense>
    </div>
  );
}

async function Stats() {
  const stats = await getStats();
  return <StatsDisplay stats={stats} />;
}

async function RecentProjects() {
  const projects = await getRecentProjects();
  return <ProjectList projects={projects} />;
}
```

---

## Error Handling

### Error Boundaries

```typescript
// app/projects/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Project page error:', error);
  }, [error]);
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-2xl font-bold">Something went wrong</h2>
      <p className="mt-2 text-gray-600">{error.message}</p>
      
      <Button onClick={reset} className="mt-4 rounded-full">
        Try Again
      </Button>
    </div>
  );
}
```

### Not Found Pages

```typescript
// app/projects/[id]/not-found.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-2xl font-bold">Project Not Found</h2>
      <p className="mt-2 text-gray-600">
        The project you're looking for doesn't exist.
      </p>
      
      <Link href="/projects">
        <Button className="mt-4 rounded-full">
          Back to Projects
        </Button>
      </Link>
    </div>
  );
}
```

---

## Layouts

### Root Layout

```typescript
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Capgemini Project',
    template: '%s | Capgemini',
  },
  description: 'Feature-driven architecture with Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
```

### Nested Layouts

```typescript
// app/projects/[id]/layout.tsx
import { getProjectById } from '@/features/projects';
import { ProjectNav } from '@/features/projects/components/project-nav';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const project = await getProjectById(params.id);
  
  if (!project) {
    notFound();
  }
  
  return (
    <div>
      <ProjectNav project={project} />
      <main>{children}</main>
    </div>
  );
}
```

---

## Data Fetching

### Server Component Data Fetching

```typescript
// ✅ GOOD: Direct service calls in Server Components
import { getUserProjects } from '@/features/projects';

export default async function ProjectsPage() {
  // This runs on the server
  const projects = await getUserProjects('user-123');
  
  return (
    <div>
      {projects.map((project) => (
        <div key={project.id}>{project.name}</div>
      ))}
    </div>
  );
}
```

### Parallel Data Fetching

```typescript
// ✅ GOOD: Parallel requests
export default async function DashboardPage() {
  // These run in parallel
  const [user, projects, stats] = await Promise.all([
    getCurrentUser(),
    getUserProjects('user-123'),
    getStats(),
  ]);
  
  return (
    <div>
      <UserProfile user={user} />
      <ProjectList projects={projects} />
      <StatsDisplay stats={stats} />
    </div>
  );
}
```

### Sequential Data Fetching (When Needed)

```typescript
// ✅ GOOD: Sequential when dependencies exist
export default async function ProjectPage({ params }: Props) {
  const project = await getProjectById(params.id);
  
  if (!project) {
    notFound();
  }
  
  // This depends on project.ownerId
  const owner = await getUserById(project.ownerId);
  
  return (
    <div>
      <ProjectDetails project={project} owner={owner} />
    </div>
  );
}
```

---

## Server Actions

### Form Actions

```typescript
// features/projects/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createProject } from './services';

export async function createProjectAction(formData: FormData) {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  
  try {
    const project = await createProject({
      name: formData.get('name') as string,
      description: formData.get('description') as string,
    }, user.id);
    
    revalidatePath('/projects');
    redirect(`/projects/${project.id}`);
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create project' 
    };
  }
}
```

### Using Server Actions

```typescript
// ✅ GOOD: Server Action in Client Component
'use client';

import { useTransition } from 'react';
import { createProjectAction } from '@/features/projects';

export function CreateProjectForm() {
  const [isPending, startTransition] = useTransition();
  
  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      const result = await createProjectAction(formData);
      
      if (!result.success) {
        alert(result.error);
      }
    });
  };
  
  return (
    <form action={handleSubmit}>
      <input name="name" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
```

---

## API Routes

### GET Route

```typescript
// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserProjects } from '@/features/projects';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const projects = await getUserProjects(user.id);
    
    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

### Dynamic Route

```typescript
// app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getProjectById } from '@/features/projects';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await getProjectById(params.id);
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

---

## Route Groups

### Authentication Routes

```typescript
// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}

// app/(auth)/login/page.tsx
import { LoginForm } from '@/features/auth';

export default function LoginPage() {
  return <LoginForm />;
}
```

---

## Navigation

### Link Component

```typescript
// ✅ GOOD: Using Next.js Link
import Link from 'next/link';

<Link 
  href="/projects/new"
  className="text-blue-600 hover:text-blue-700"
>
  Create Project
</Link>

// With dynamic routes
<Link href={`/projects/${project.id}`}>
  {project.name}
</Link>
```

### Programmatic Navigation

```typescript
// ✅ GOOD: useRouter for client-side navigation
'use client';

import { useRouter } from 'next/navigation';

export function ProjectCard({ project }: Props) {
  const router = useRouter();
  
  const handleClick = () => {
    router.push(`/projects/${project.id}`);
  };
  
  return (
    <div onClick={handleClick}>
      {project.name}
    </div>
  );
}
```

---

## Anti-Patterns to Avoid

❌ **Business Logic in App Router**: Keep app/ for routing only
❌ **Direct DB Imports**: Never import db in app/ pages
❌ **Client Components for Everything**: Default to Server Components
❌ **Nested Route Handlers**: Keep API routes flat
❌ **Missing Error Boundaries**: Every route should have error.tsx
❌ **No Loading States**: Always provide loading.tsx
❌ **Hardcoded Redirects**: Use next/navigation functions

---

## Checklist

Before considering a page complete:

- [ ] Uses Server Components when possible
- [ ] Has loading.tsx for loading states
- [ ] Has error.tsx for error handling
- [ ] Includes proper metadata
- [ ] Business logic is in features/
- [ ] No direct DB imports in app/
- [ ] Proper TypeScript types
- [ ] Handles authentication
- [ ] Handles not-found cases
- [ ] Uses Server Actions for mutations

---

## References

- [Next.js App Router](https://nextjs.org/docs/app)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
