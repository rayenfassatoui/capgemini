---
description: Vercel deployment patterns and best practices for Next.js applications
triggers:
  - "app/**/*.tsx"
  - "next.config.ts"
  - "vercel.json"
  - keywords: ["vercel", "deployment", "edge", "serverless", "environment"]
priority: 7
version: 1.0.0
last_updated: 2026-02-03
---

# Vercel Deployment Patterns

## Overview

This skill provides guidance on deploying Next.js applications to Vercel, including environment configuration, edge functions, serverless functions, and optimization strategies.

## When to Use

- Deploying to Vercel
- Configuring environment variables
- Using Edge Runtime
- Optimizing serverless functions
- Setting up preview deployments

---

## Core Principles

### 1. Environment Configuration

**Environment Variables**

```typescript
// ✅ GOOD: Use Vercel environment variables
// .env.local (local development)
DATABASE_URL="postgresql://localhost:5432/dev"
NEXT_PUBLIC_API_URL="http://localhost:3000"

// Vercel Dashboard: Production
DATABASE_URL="postgresql://prod.example.com/db"
NEXT_PUBLIC_API_URL="https://api.example.com"
```

**Access in Code**

```typescript
// ✅ GOOD: Server-side only
export async function getProjects() {
  const url = process.env.DATABASE_URL;
  // Safe: only runs on server
}

// ✅ GOOD: Client-side (public)
export function ApiClient() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  // Exposed to browser
}

// ❌ BAD: Exposing secrets
const apiKey = process.env.API_SECRET; // Will be undefined on client
```

### 2. Vercel Configuration

**vercel.json**

```json
{
  "buildCommand": "bun run build",
  "devCommand": "bun dev",
  "installCommand": "bun install",
  "framework": "nextjs",
  "outputDirectory": ".next",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_API_URL": "https://api.example.com"
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=60, stale-while-revalidate=30"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/old-route",
      "destination": "/new-route",
      "permanent": true
    }
  ],
  "rewrites": [
    {
      "source": "/api/proxy/:path*",
      "destination": "https://external-api.com/:path*"
    }
  ]
}
```

---

## Edge Runtime vs Serverless

### When to Use Edge Runtime

```typescript
// ✅ GOOD: Edge Runtime for fast, global responses
export const runtime = 'edge';

export async function GET(request: Request) {
  // Runs close to users worldwide
  // Limited to Edge-compatible APIs
  const data = await fetch('https://api.example.com/data');
  return Response.json(data);
}
```

**Use Edge Runtime for**:
- Simple API routes with minimal computation
- Geolocation-based responses
- A/B testing
- Authentication middleware
- Fast, global responses

**Limitations**:
- No Node.js APIs (fs, child_process, etc.)
- No native modules
- 4MB request/response limit
- 30s timeout

### When to Use Serverless (Default)

```typescript
// ✅ GOOD: Serverless for complex operations
export default async function ProjectsPage() {
  // Full Node.js runtime
  const projects = await db.query.projects.findMany();
  return <div>{/* ... */}</div>;
}
```

**Use Serverless for**:
- Database queries
- File system operations
- Complex business logic
- Third-party SDK integration
- Heavy computation

---

## Performance Optimization

### 1. Caching Strategies

**Page Caching**

```typescript
// ✅ GOOD: Static generation
export default async function HomePage() {
  // Generated at build time
  return <div>Static Content</div>;
}

// ✅ GOOD: Incremental Static Regeneration
export const revalidate = 60; // Revalidate every 60 seconds

export default async function ProductsPage() {
  const products = await getProducts();
  return <ProductList products={products} />;
}

// ✅ GOOD: On-demand revalidation
import { revalidatePath } from 'next/cache';

export async function createProductAction(data: FormData) {
  await createProduct(data);
  revalidatePath('/products'); // Revalidate on mutation
}
```

**API Route Caching**

```typescript
// ✅ GOOD: Cache API responses
export async function GET() {
  const data = await fetchData();
  
  return Response.json(data, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
    },
  });
}
```

### 2. Image Optimization

```typescript
// ✅ GOOD: Use Next.js Image component
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority // Load immediately for above-fold images
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>

// ✅ GOOD: Remote images
<Image
  src="https://example.com/image.jpg"
  alt="Remote"
  width={800}
  height={600}
  unoptimized={false} // Enable optimization
/>
```

**next.config.ts Configuration**

```typescript
const config: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        pathname: '/images/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};
```

### 3. Bundle Optimization

```typescript
// ✅ GOOD: Dynamic imports for heavy components
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('./heavy-chart'), {
  loading: () => <Loader />,
  ssr: false, // Disable SSR if component uses browser APIs
});

export function Dashboard() {
  return (
    <div>
      <HeavyChart data={data} />
    </div>
  );
}

// ✅ GOOD: Code splitting with route groups
// app/(admin)/dashboard/page.tsx - Admin-specific code
// app/(public)/page.tsx - Public-facing code
```

---

## Environment-Specific Code

### Preview Deployments

```typescript
// ✅ GOOD: Detect environment
const isProduction = process.env.VERCEL_ENV === 'production';
const isPreview = process.env.VERCEL_ENV === 'preview';
const isDevelopment = process.env.VERCEL_ENV === 'development';

if (isPreview) {
  // Use preview database
  // Enable debug logging
  // Show development features
}

// ✅ GOOD: Preview-specific configuration
export default async function middleware(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'preview') {
    // Bypass authentication for E2E tests
    return NextResponse.next();
  }
  
  // Normal authentication flow
  return await authenticateRequest(request);
}
```

### Branch-Specific Environment Variables

```bash
# Production
DATABASE_URL="postgresql://prod.example.com/db"

# Preview (all branches)
DATABASE_URL="postgresql://preview.example.com/db"

# Development (local)
DATABASE_URL="postgresql://localhost:5432/dev"
```

---

## Deployment Strategies

### 1. Git Integration

```bash
# ✅ GOOD: Automatic deployments
main branch → Production deployment
feature/* branches → Preview deployments
pull requests → Preview deployments with unique URLs
```

### 2. Deployment Hooks

```typescript
// scripts/pre-deploy.ts
import { exec } from 'child_process';

async function preDeploy() {
  // Run database migrations
  await exec('bun run db:push');
  
  // Generate types
  await exec('bun run db:generate');
  
  // Validate environment
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
}

preDeploy();
```

**package.json**

```json
{
  "scripts": {
    "build": "next build",
    "vercel-build": "bun run db:push && next build"
  }
}
```

### 3. Rollback Strategy

```typescript
// ✅ GOOD: Feature flags for safe rollouts
import { unstable_flag as flag } from '@vercel/flags/next';

export async function getNewFeature() {
  const isEnabled = await flag('new-feature');
  
  if (isEnabled) {
    return <NewFeature />;
  }
  
  return <OldFeature />;
}
```

---

## Monitoring & Observability

### 1. Web Vitals

```typescript
// app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
```

### 2. Custom Logging

```typescript
// ✅ GOOD: Structured logging for Vercel
export async function GET() {
  console.log(JSON.stringify({
    level: 'info',
    message: 'API request received',
    timestamp: new Date().toISOString(),
    metadata: {
      endpoint: '/api/projects',
      method: 'GET',
    },
  }));
  
  return Response.json({ success: true });
}
```

### 3. Error Tracking

```typescript
// ✅ GOOD: Error boundary with logging
'use client';

import { useEffect } from 'react';

export default function Error({ error }: { error: Error }) {
  useEffect(() => {
    // Log to error tracking service
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      console.error('Application error:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }
  }, [error]);
  
  return <ErrorDisplay error={error} />;
}
```

---

## Security Best Practices

### 1. Environment Variables

```typescript
// ✅ GOOD: Validate required variables
function validateEnv() {
  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'NEXT_PUBLIC_API_URL',
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

// Call in middleware or layout
validateEnv();
```

### 2. CORS Configuration

```typescript
// app/api/*/route.ts
export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  const headers = new Headers();
  
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  
  return Response.json({ data }, { headers });
}
```

### 3. Rate Limiting

```typescript
// ✅ GOOD: Edge middleware for rate limiting
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

export async function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  
  if (!success) {
    return new Response('Too Many Requests', { status: 429 });
  }
  
  return NextResponse.next();
}
```

---

## Database Connection Management

### 1. Connection Pooling

```typescript
// ✅ GOOD: Use connection pooler on Vercel
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!, {
  poolSize: 10, // Vercel serverless functions
});

// For Drizzle
import { drizzle } from 'drizzle-orm/neon-http';

export const db = drizzle(sql);
```

### 2. Serverless-Specific Considerations

```typescript
// ✅ GOOD: Keep connections short-lived
export async function getProjects() {
  // Open connection
  const projects = await db.query.projects.findMany();
  
  // Connection automatically closes after function execution
  return projects;
}

// ❌ BAD: Long-lived connections
let globalDb: any;

export async function getProjects() {
  if (!globalDb) {
    globalDb = createConnection(); // Will exhaust pool
  }
  return globalDb.query('SELECT * FROM projects');
}
```

---

## Testing Preview Deployments

### 1. Preview URL Structure

```typescript
// ✅ GOOD: Generate preview URLs
const previewUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

// Use in tests
describe('Preview deployment', () => {
  it('should have correct configuration', async () => {
    const response = await fetch(`${previewUrl}/api/health`);
    expect(response.status).toBe(200);
  });
});
```

### 2. E2E Testing

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000',
  },
  webServer: !process.env.VERCEL_URL ? {
    command: 'bun dev',
    port: 3000,
  } : undefined,
});
```

---

## Checklist

Before deploying to Vercel:

- [ ] All environment variables configured in Vercel dashboard
- [ ] Database connection string uses connection pooler
- [ ] Images configured with remote patterns
- [ ] Build succeeds locally (`bun run build`)
- [ ] No secrets in client-side code
- [ ] Edge runtime used appropriately
- [ ] Caching strategies implemented
- [ ] Error boundaries in place
- [ ] Analytics and monitoring configured
- [ ] Preview deployment tested
- [ ] Domain configured (if production)

---

## References

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Edge Runtime](https://vercel.com/docs/functions/edge-functions)
- [Environment Variables](https://vercel.com/docs/projects/environment-variables)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
