---
description: Neon serverless PostgreSQL database integration patterns
triggers:
  - "db/**"
  - "lib/db.ts"
  - "drizzle.config.ts"
  - keywords: ["neon", "database", "postgresql", "serverless", "connection"]
priority: 9
version: 1.0.0
last_updated: 2026-02-03
---

# Neon PostgreSQL Database Patterns

## Overview

Neon is a serverless PostgreSQL database designed for modern applications. This skill provides guidance on integrating Neon with Next.js, Drizzle ORM, and serverless/edge environments.

## When to Use

- Setting up database connections
- Configuring Drizzle ORM with Neon
- Working with serverless functions
- Using Edge Runtime
- Managing connection pooling
- Database migrations

---

## Core Principles

### 1. Serverless-First Architecture

**Neon is optimized for serverless environments with:**
- Automatic connection pooling
- Instant cold starts
- Serverless driver for Edge Runtime
- HTTP-based connections (no TCP)

### 2. Connection Types

```typescript
// ✅ GOOD: Use @neondatabase/serverless for HTTP connections
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// ✅ GOOD: Use with Drizzle ORM
import { drizzle } from 'drizzle-orm/neon-http';

export const db = drizzle(sql);
```

---

## Installation

### Install Dependencies

```bash
# Core packages
bun add @neondatabase/serverless drizzle-orm

# Development tools
bun add -d drizzle-kit
```

---

## Configuration

### 1. Environment Variables

```bash
# .env.local
DATABASE_URL="postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Optional: Separate pooler connection for serverless
DATABASE_URL_POOLER="postgresql://user:password@ep-xxx-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

**Connection String Structure:**
```
postgresql://[user]:[password]@[endpoint]-pooler.neon.tech/[database]?sslmode=require
```

**Key Points:**
- Always use `-pooler` suffix for serverless connections
- Use `sslmode=require` for secure connections
- Store in `.env.local` (never commit to git)

### 2. Database Client Setup

```typescript
// lib/db.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

// Create SQL client
const sql = neon(process.env.DATABASE_URL!);

// Create Drizzle instance
export const db = drizzle(sql, { schema });
```

### 3. Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

## Usage Patterns

### 1. Server Components (Recommended)

```typescript
// app/projects/page.tsx
import { db } from '@/lib/db';
import { projects } from '@/db/schema';

export default async function ProjectsPage() {
  // Direct database query in Server Component
  const allProjects = await db.query.projects.findMany({
    orderBy: (projects, { desc }) => [desc(projects.createdAt)],
  });

  return (
    <div>
      {allProjects.map((project) => (
        <div key={project.id}>{project.name}</div>
      ))}
    </div>
  );
}
```

### 2. Server Actions

```typescript
// features/projects/actions.ts
'use server';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { revalidatePath } from 'next/cache';

export async function createProjectAction(formData: FormData) {
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;

  try {
    const [project] = await db
      .insert(projects)
      .values({
        name,
        description,
        createdAt: new Date(),
      })
      .returning();

    revalidatePath('/projects');

    return { success: true, project };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create project',
    };
  }
}
```

### 3. API Routes (Serverless Functions)

```typescript
// app/api/projects/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';

export async function GET() {
  try {
    const allProjects = await db.query.projects.findMany();
    return NextResponse.json(allProjects);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const [project] = await db
      .insert(projects)
      .values(body)
      .returning();

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
```

### 4. Edge Runtime

```typescript
// app/api/projects/route.ts
import { neon } from '@neondatabase/serverless';

export const runtime = 'edge';

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  
  const projects = await sql`
    SELECT * FROM projects
    ORDER BY created_at DESC
  `;

  return Response.json(projects);
}
```

**Important:** Edge Runtime requires the Neon serverless driver with HTTP connections.

---

## Service Layer Pattern (Feature-Driven Architecture)

```typescript
// features/projects/services.ts
import { db } from '@/lib/db';
import { projects, type Project } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function getAllProjects(): Promise<Project[]> {
  return await db.query.projects.findMany({
    orderBy: [desc(projects.createdAt)],
  });
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  return await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });
}

export async function createProject(
  data: { name: string; description?: string },
  userId: string
): Promise<Project> {
  const [project] = await db
    .insert(projects)
    .values({
      ...data,
      ownerId: userId,
      createdAt: new Date(),
    })
    .returning();

  return project;
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, 'name' | 'description'>>
): Promise<Project | undefined> {
  const [updated] = await db
    .update(projects)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}
```

---

## Schema Management

### 1. Define Schema

```typescript
// db/schema.ts
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
```

### 2. Generate Migrations

```bash
# Generate migration SQL
bun run drizzle-kit generate

# Apply migrations directly to Neon
bun run drizzle-kit push
```

### 3. Introspect Existing Database

```bash
# Pull schema from existing Neon database
bun run drizzle-kit introspect
```

---

## Connection Pooling

### Serverless Best Practices

```typescript
// ✅ GOOD: Use Neon's built-in connection pooling
import { neon } from '@neondatabase/serverless';

// Each invocation creates a new connection
// Neon handles pooling automatically
const sql = neon(process.env.DATABASE_URL!);

// ❌ BAD: Don't create persistent connections in serverless
let globalConnection: any;

export function getDb() {
  if (!globalConnection) {
    globalConnection = createConnection(); // Will exhaust connections
  }
  return globalConnection;
}
```

### Connection Configuration

```typescript
// lib/db.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Configure with options
const sql = neon(process.env.DATABASE_URL!, {
  fetchOptions: {
    cache: 'no-store', // Disable caching for real-time data
  },
});

export const db = drizzle(sql);
```

---

## Performance Optimization

### 1. Query Optimization

```typescript
// ✅ GOOD: Efficient query with specific columns
const projects = await db
  .select({
    id: projects.id,
    name: projects.name,
    ownerName: users.name,
  })
  .from(projects)
  .leftJoin(users, eq(projects.ownerId, users.id))
  .where(eq(projects.ownerId, userId))
  .limit(10);

// ❌ BAD: Fetching all columns unnecessarily
const projects = await db
  .select()
  .from(projects)
  .leftJoin(users, eq(projects.ownerId, users.id));
```

### 2. Batch Operations

```typescript
// ✅ GOOD: Batch insert
const newProjects = [
  { name: 'Project 1', ownerId: userId },
  { name: 'Project 2', ownerId: userId },
  { name: 'Project 3', ownerId: userId },
];

await db.insert(projects).values(newProjects);

// ✅ GOOD: Batch update with transaction
await db.transaction(async (tx) => {
  for (const project of projectsToUpdate) {
    await tx
      .update(projects)
      .set({ name: project.name })
      .where(eq(projects.id, project.id));
  }
});
```

### 3. Caching Strategies

```typescript
// ✅ GOOD: Cache with Next.js
import { unstable_cache } from 'next/cache';

export const getCachedProjects = unstable_cache(
  async () => {
    return await db.query.projects.findMany();
  },
  ['projects-list'],
  {
    revalidate: 60, // Revalidate every 60 seconds
    tags: ['projects'],
  }
);

// Revalidate on mutation
import { revalidateTag } from 'next/cache';

export async function createProject(data: NewProject) {
  const project = await db.insert(projects).values(data).returning();
  
  revalidateTag('projects');
  
  return project;
}
```

---

## Error Handling

### Database Errors

```typescript
// features/projects/services.ts
import { db } from '@/lib/db';
import { projects } from '@/db/schema';

export async function createProject(data: NewProject) {
  try {
    const [project] = await db
      .insert(projects)
      .values(data)
      .returning();
    
    return { success: true, data: project };
  } catch (error) {
    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return { success: false, error: 'Project with this name already exists' };
    }
    
    // Handle foreign key violations
    if (error instanceof Error && error.message.includes('foreign key constraint')) {
      return { success: false, error: 'Invalid user reference' };
    }
    
    console.error('Database error:', error);
    return { success: false, error: 'Failed to create project' };
  }
}
```

---

## Transactions

### Using Drizzle Transactions

```typescript
// ✅ GOOD: Atomic operations with transaction
import { db } from '@/lib/db';
import { users, projects } from '@/db/schema';

export async function createUserWithProject(
  userData: NewUser,
  projectData: Omit<NewProject, 'ownerId'>
) {
  return await db.transaction(async (tx) => {
    // Create user
    const [user] = await tx
      .insert(users)
      .values(userData)
      .returning();

    // Create project for user
    const [project] = await tx
      .insert(projects)
      .values({
        ...projectData,
        ownerId: user.id,
      })
      .returning();

    return { user, project };
  });
}
```

---

## Testing

### Mock Database for Tests

```typescript
// tests/db-mock.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@/db/schema';

export function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  
  // Run migrations
  // ... migration logic
  
  return db;
}
```

---

## Deployment

### Environment Setup

```bash
# Production
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.neon.tech/neondb?sslmode=require"

# Preview/Staging
DATABASE_URL="postgresql://user:password@ep-yyy-pooler.neon.tech/neondb?sslmode=require"

# Development (local)
DATABASE_URL="postgresql://localhost:5432/dev"
```

### Vercel Deployment

```json
// vercel.json
{
  "env": {
    "DATABASE_URL": "@database-url-production"
  },
  "build": {
    "env": {
      "DATABASE_URL": "@database-url-production"
    }
  }
}
```

---

## Best Practices

### DO:
- ✅ Use `-pooler` endpoint for serverless functions
- ✅ Keep queries in service layer (features/*/services.ts)
- ✅ Use transactions for multi-step operations
- ✅ Add indexes for frequently queried columns
- ✅ Use prepared statements to prevent SQL injection
- ✅ Close connections in long-running processes
- ✅ Use Drizzle's type-safe queries
- ✅ Cache frequently accessed data

### DON'T:
- ❌ Store connection in global variables (serverless)
- ❌ Put database queries directly in components
- ❌ Expose raw SQL queries to client
- ❌ Forget to handle database errors
- ❌ Use SELECT * in production
- ❌ Skip migrations
- ❌ Hard-code credentials

---

## Troubleshooting

### Connection Issues

```typescript
// ✅ GOOD: Verify connection
import { neon } from '@neondatabase/serverless';

async function testConnection() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`SELECT version()`;
    console.log('Database connected:', result[0].version);
  } catch (error) {
    console.error('Connection failed:', error);
  }
}
```

### Common Errors

1. **"connection timeout"**: Use `-pooler` endpoint
2. **"too many connections"**: Connection pooling not configured
3. **"SSL required"**: Add `?sslmode=require` to connection string
4. **"relation does not exist"**: Run migrations

---

## Checklist

Before deploying with Neon:

- [ ] DATABASE_URL uses `-pooler` endpoint
- [ ] SSL mode configured (`sslmode=require`)
- [ ] Migrations applied to database
- [ ] Database credentials stored securely
- [ ] Error handling implemented
- [ ] Queries optimized (indexes, limits)
- [ ] Service layer pattern followed
- [ ] Transactions used for multi-step operations
- [ ] Connection pooling configured
- [ ] Type safety verified with Drizzle

---

## References

- [Neon Documentation](https://neon.tech/docs)
- [Neon + Next.js Guide](https://neon.tech/docs/guides/nextjs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Neon Serverless Driver](https://github.com/neondatabase/serverless)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
