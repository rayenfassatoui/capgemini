# Feature-Driven Architecture Guide

## Overview

This project follows a **Feature-Driven (Vertical Slice) Architecture** where code is organized by business feature rather than technical layer.

## Why Feature-Driven?

Traditional layered architecture organizes code by technical type:
```
❌ BAD (Layered)
/controllers
/services
/models
/views
```

Feature-driven organizes by business capability:
```
✅ GOOD (Feature-Driven)
/features
  /projects
  /auth
  /dashboard
```

### Benefits
1. **Better Cohesion**: Related code lives together
2. **Easier to Navigate**: Find everything about "projects" in one place
3. **Scalable**: Add features without touching existing ones
4. **Testable**: Each feature is independently testable
5. **Team-Friendly**: Teams can own entire features

## Project Structure

```
project-root/
├── app/                          # Next.js App Router (ROUTING ONLY)
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   ├── projects/                # Project routes
│   │   ├── page.tsx            # List projects (uses features/projects)
│   │   ├── new/
│   │   │   └── page.tsx        # Create project (uses features/projects)
│   │   └── [id]/
│   │       └── page.tsx        # Project details (uses features/projects)
│   └── api/                     # API routes (thin wrappers)
│       └── projects/
│           ├── route.ts         # GET /api/projects
│           └── [id]/
│               └── route.ts     # GET /api/projects/:id
│
├── features/                     # CORE BUSINESS LOGIC (Vertical Slices)
│   ├── projects/                # Everything about projects
│   │   ├── types.ts            # Project types
│   │   ├── schemas.ts          # Zod validation
│   │   ├── services.ts         # Business logic + DB (SOURCE OF TRUTH)
│   │   ├── actions.ts          # Server Actions (thin wrappers)
│   │   ├── queries.ts          # React Query hooks
│   │   ├── components/         # Project-specific UI
│   │   │   ├── project-card.tsx
│   │   │   └── create-project-form.tsx
│   │   ├── __tests__/          # Feature tests
│   │   │   ├── services.test.ts
│   │   │   ├── schemas.test.ts
│   │   │   └── components/
│   │   │       └── project-card.test.tsx
│   │   ├── index.ts            # Public API
│   │   └── README.md           # Feature documentation
│   │
│   ├── auth/                    # Everything about authentication
│   │   ├── services.ts
│   │   ├── actions.ts
│   │   ├── components/
│   │   └── __tests__/
│   │
│   └── dashboard/               # Everything about dashboard
│       ├── services.ts
│       ├── queries.ts
│       ├── components/
│       └── __tests__/
│
├── components/                   # SHARED COMPONENTS
│   ├── ui/                      # Generic primitives (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── shared/                  # Reusable app components
│       ├── header.tsx
│       ├── footer.tsx
│       └── icons.tsx
│
├── lib/                         # SHARED UTILITIES
│   ├── db.ts                   # Database client
│   ├── auth.ts                 # Auth utilities
│   ├── utils.ts                # Helper functions
│   └── config.ts               # App configuration
│
├── db/                          # DATABASE LAYER
│   ├── schema.ts               # Drizzle schema
│   └── migrations/             # Database migrations
│
├── types/                       # SHARED TYPES
│   └── index.ts                # Global TypeScript types
│
└── public/                      # STATIC ASSETS
    └── ...
```

## Layer Rules

### 1. App Router (`app/`)
**Purpose**: Routing and page orchestration ONLY

**Allowed**:
- Rendering pages
- Setting metadata
- Calling feature services or actions
- Passing data to components

**Forbidden**:
- Direct database imports
- Business logic
- Complex computations
- Data transformations

**Example** (✅ Good):
```typescript
// app/projects/page.tsx
import { getUserProjects } from '@/features/projects';
import { ProjectCard } from '@/features/projects';

export default async function ProjectsPage() {
  const projects = await getUserProjects('user-123');
  
  return (
    <div>
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

**Example** (❌ Bad):
```typescript
// app/projects/page.tsx
import { db } from '@/lib/db'; // ❌ No direct DB imports

export default async function ProjectsPage() {
  const projects = await db.query.projects.findMany(); // ❌ No DB calls
  
  return <div>...</div>;
}
```

### 2. Features (`features/[feature-name]/`)
**Purpose**: Complete business capability in one place

**Required Files**:
- `types.ts`: TypeScript interfaces
- `schemas.ts`: Zod validation schemas
- `services.ts`: Business logic + database operations (SOURCE OF TRUTH)
- `actions.ts`: Server Actions for mutations
- `queries.ts`: React Query hooks (optional)
- `components/`: Feature-specific UI
- `__tests__/`: Tests for this feature
- `index.ts`: Public API exports
- `README.md`: Feature documentation

**Allowed**:
- Business logic
- Database operations
- Data validation
- Feature-specific components
- Importing from `lib/`, `db/`, `components/ui/`

**Forbidden**:
- Importing from other features' internals
- Importing from `app/`

**Example Structure**:
```typescript
// features/projects/services.ts (SOURCE OF TRUTH)
export async function createProject(data: unknown, userId: string) {
  const validated = createProjectSchema.parse(data);
  const slug = generateSlug(validated.name);
  
  const [project] = await db.insert(projects).values({
    ...validated,
    slug,
    ownerId: userId,
  }).returning();
  
  return project;
}

// features/projects/actions.ts (Thin wrapper)
'use server';

export async function createProjectAction(data: CreateProjectSchema) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  
  const project = await createProject(data, user.id);
  
  revalidatePath('/projects');
  redirect(`/projects/${project.id}`);
}
```

### 3. Components (`components/`)

#### ui/ (Generic Primitives)
**Purpose**: Reusable, generic UI components (shadcn/ui)

**Allowed**:
- Pure visual components
- No business logic
- No feature-specific knowledge

**Examples**: Button, Card, Input, Dialog, Dropdown

#### shared/ (Shared App Components)
**Purpose**: Reusable components used across features

**Allowed**:
- Layout components (Header, Footer)
- Navigation components
- Generic patterns (ErrorBoundary, LoadingState)

**Forbidden**:
- Feature-specific logic
- Direct database access

### 4. Lib (`lib/`)
**Purpose**: Shared utilities and configurations

**Contains**:
- Database client setup
- Authentication helpers
- Utility functions
- Configuration

**Forbidden**:
- Feature-specific logic
- Component definitions

### 5. Database (`db/`)
**Purpose**: Database schema and migrations

**Contains**:
- Drizzle schema definitions
- Database migrations
- Type exports

## Data Flow

### Server-Side (Default)
```
User Request
    ↓
App Router Page (app/)
    ↓
Feature Service (features/*/services.ts)
    ↓
Database (lib/db.ts)
    ↓
Return Data
    ↓
Render Component
```

### Client-Side (When Needed)
```
User Interaction
    ↓
Client Component
    ↓
React Query Hook (features/*/queries.ts)
    ↓
API Route (app/api/)
    ↓
Feature Service (features/*/services.ts)
    ↓
Database
    ↓
Return Data
```

### Mutations (Server Actions)
```
Form Submit
    ↓
Client Component
    ↓
Server Action (features/*/actions.ts)
    ↓
Feature Service (features/*/services.ts)
    ↓
Database
    ↓
Revalidate Cache
    ↓
Redirect/Return
```

## Testing Strategy

### Feature Tests
Each feature has its own `__tests__/` directory:

```typescript
features/projects/__tests__/
├── services.test.ts        # Test business logic
├── schemas.test.ts         # Test validation
├── actions.test.ts         # Test Server Actions
└── components/             # Test UI components
    ├── project-card.test.tsx
    └── create-project-form.test.tsx
```

### Test Scope
- **Service Tests**: Business logic, database operations, authorization
- **Schema Tests**: Validation rules, constraints
- **Action Tests**: Auth checks, cache revalidation, error handling
- **Component Tests**: Rendering, interactions, accessibility

### Test Commands
```bash
bun test                           # Run all tests
bun test features/projects         # Test specific feature
bun test --watch                   # Watch mode
bun test --coverage                # Coverage report
```

## Creating a New Feature

### Step-by-Step Guide

1. **Create Feature Directory**
```bash
mkdir -p features/my-feature/{components,__tests__/components}
```

2. **Create Core Files**
```bash
touch features/my-feature/{types.ts,schemas.ts,services.ts,actions.ts,index.ts,README.md}
```

3. **Define Types** (`types.ts`)
```typescript
export interface MyEntity {
  id: string;
  name: string;
  createdAt: Date;
}
```

4. **Create Schemas** (`schemas.ts`)
```typescript
import { z } from 'zod';

export const createMyEntitySchema = z.object({
  name: z.string().min(3).max(100),
});

export type CreateMyEntitySchema = z.infer<typeof createMyEntitySchema>;
```

5. **Implement Services** (`services.ts`)
```typescript
import { db } from '@/lib/db';
import { createMyEntitySchema } from './schemas';

export async function createMyEntity(data: unknown) {
  const validated = createMyEntitySchema.parse(data);
  
  const [entity] = await db.insert(myEntities)
    .values(validated)
    .returning();
  
  return entity;
}
```

6. **Add Server Actions** (`actions.ts`)
```typescript
'use server';

import { createMyEntity } from './services';

export async function createMyEntityAction(data: CreateMyEntitySchema) {
  try {
    const entity = await createMyEntity(data);
    revalidatePath('/my-entities');
    return { success: true, data: entity };
  } catch (error) {
    return { success: false, error: 'Failed to create' };
  }
}
```

7. **Create Components** (`components/`)
```typescript
// components/my-entity-card.tsx
export function MyEntityCard({ entity }: Props) {
  return <Card>{entity.name}</Card>;
}
```

8. **Write Tests** (`__tests__/`)
```typescript
// __tests__/services.test.ts
describe('MyEntity Services', () => {
  it('should create entity', async () => {
    const result = await createMyEntity({ name: 'Test' });
    expect(result.name).toBe('Test');
  });
});
```

9. **Export Public API** (`index.ts`)
```typescript
export * from './types';
export * from './schemas';
export * from './services';
export * from './actions';
export * from './components';
```

10. **Use in App Router**
```typescript
// app/my-entities/page.tsx
import { MyEntityCard } from '@/features/my-feature';
```

## Best Practices

### ✅ Do
- Keep features independent and self-contained
- Put ALL business logic in `services.ts`
- Validate inputs with Zod schemas
- Use TypeScript strict mode (no `any`)
- Write tests for each layer
- Use Server Components by default
- Follow naming conventions
- Document complex logic

### ❌ Don't
- Import from other features' internal files
- Put business logic in App Router
- Put business logic in UI components
- Use `any` type
- Skip validation
- Create god services (keep them focused)
- Mix concerns between layers

## Migration from Layered Architecture

If you have existing layered code:

1. **Identify Features**: Group related endpoints/controllers
2. **Create Feature Directory**: `features/[feature-name]`
3. **Move Models → types.ts**: Convert to TypeScript interfaces
4. **Move Business Logic → services.ts**: Extract from controllers
5. **Move Views → components/**: Feature-specific UI
6. **Add Validation → schemas.ts**: Use Zod
7. **Create Actions → actions.ts**: Wrap services
8. **Write Tests → __tests__/**: Comprehensive coverage
9. **Update Routes**: Use feature exports

## Common Patterns

### Pattern 1: CRUD Operations
```typescript
// services.ts
export async function createEntity(data: unknown) { }
export async function getEntity(id: string) { }
export async function updateEntity(id: string, data: unknown) { }
export async function deleteEntity(id: string) { }
```

### Pattern 2: Authorization
```typescript
// services.ts
export async function updateEntity(id: string, data: unknown, userId: string) {
  const entity = await getEntity(id);
  
  if (entity.ownerId !== userId) {
    throw new UnauthorizedError();
  }
  
  // Update logic
}
```

### Pattern 3: Complex Queries
```typescript
// services.ts
export async function getEntitiesWithRelations(filters: Filters) {
  return db.query.entities.findMany({
    where: buildWhereClause(filters),
    with: {
      relations: true,
    },
  });
}
```

### Pattern 4: Transactions
```typescript
// services.ts
export async function complexOperation(data: unknown) {
  return db.transaction(async (tx) => {
    const entity = await tx.insert(entities).values(data).returning();
    await tx.insert(relatedEntities).values({ entityId: entity.id });
    return entity;
  });
}
```

## Troubleshooting

### Issue: Circular Dependencies
**Solution**: Check imports. Features should not import from other features.

### Issue: Duplicate Logic
**Solution**: Extract to `lib/` if truly shared, or keep in feature if specific.

### Issue: Where to Put Shared Types?
**Solution**: 
- Feature-specific types → `features/[feature]/types.ts`
- Truly shared types → `types/index.ts`

### Issue: Component Belongs to Multiple Features
**Solution**: Move to `components/shared/` if truly generic, or duplicate if feature-specific logic differs.

## Resources

- [Feature-Driven Architecture](https://github.com/feature-driven-architecture)
- [Vertical Slice Architecture](https://jimmybogard.com/vertical-slice-architecture/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Zod Validation](https://zod.dev/)

---

**Remember**: Each feature is a complete, self-contained vertical slice of your application. Keep them independent, testable, and cohesive.
