# Projects Feature

This feature handles all project-related functionality following the Feature-Driven Architecture pattern.

## Structure

```
features/projects/
├── types.ts              # TypeScript interfaces and types
├── schemas.ts            # Zod validation schemas
├── services.ts           # Business logic and database operations (SOURCE OF TRUTH)
├── actions.ts            # Next.js Server Actions (thin wrappers)
├── queries.ts            # React Query hooks for client-side data fetching
├── components/           # Feature-specific UI components
│   ├── project-card.tsx
│   ├── create-project-form.tsx
│   └── index.ts
├── __tests__/            # Feature tests
│   ├── services.test.ts
│   ├── schemas.test.ts
│   └── components/
│       └── project-card.test.tsx
├── index.ts              # Public API exports
└── README.md             # This file
```

## Layer Responsibilities

### services.ts (Core Business Logic)
- **Purpose**: Source of truth for all business logic
- **Contains**: Database operations, validation, business rules
- **Dependencies**: Can import from `lib/`, `db/`, own `schemas.ts`, `types.ts`
- **Used By**: `actions.ts`, API routes

Example:
```typescript
export async function createProject(data: unknown, userId: string): Promise<Project> {
  const validated = createProjectSchema.parse(data);
  const slug = generateSlug(validated.name);
  
  const [project] = await db.insert(projects).values({
    ...validated,
    slug,
    ownerId: userId,
  }).returning();
  
  return project;
}
```

### actions.ts (Server Actions)
- **Purpose**: Thin wrappers around services for use in forms
- **Contains**: Auth checks, cache revalidation, redirects
- **Dependencies**: Imports from `services.ts`, `lib/auth`
- **Used By**: Client components (forms)

Example:
```typescript
'use server';

export async function createProjectAction(data: CreateProjectSchema) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  
  const project = await createProject(data, user.id);
  
  revalidatePath('/projects');
  redirect(`/projects/${project.id}`);
}
```

### queries.ts (Client-Side Data Fetching)
- **Purpose**: React Query hooks for client-side caching
- **Contains**: Query keys, fetch functions, mutations
- **Dependencies**: API routes (not services directly)
- **Used By**: Client components

Example:
```typescript
'use client';

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => fetchProject(id),
  });
}
```

### components/ (Feature UI)
- **Purpose**: UI components specific to this feature
- **Contains**: Feature-specific React components
- **Dependencies**: Can import from `components/ui/`, `types.ts`, `actions.ts`, `queries.ts`
- **Used By**: App Router pages

### schemas.ts (Validation)
- **Purpose**: Runtime validation with Zod
- **Contains**: Zod schemas and inferred types
- **Dependencies**: Only Zod
- **Used By**: `services.ts`, forms

## Testing Strategy

### Service Tests (`__tests__/services.test.ts`)
- Test business logic
- Mock database calls
- Test error handling
- Test edge cases
- Test authorization logic

### Schema Tests (`__tests__/schemas.test.ts`)
- Test validation rules
- Test required/optional fields
- Test min/max constraints
- Test default values

### Component Tests (`__tests__/components/*.test.tsx`)
- Test rendering
- Test user interactions
- Test accessibility
- Test loading/error states

## Usage Examples

### Creating a Project (Server Component)
```typescript
// app/projects/new/page.tsx
import { CreateProjectForm } from '@/features/projects';

export default function NewProjectPage() {
  return (
    <div>
      <h1>Create New Project</h1>
      <CreateProjectForm />
    </div>
  );
}
```

### Displaying Projects (Server Component)
```typescript
// app/projects/page.tsx
import { getUserProjects } from '@/features/projects';
import { ProjectCard } from '@/features/projects';
import { getCurrentUser } from '@/lib/auth';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const projects = await getUserProjects(user.id);
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

### Using Client-Side Queries (Client Component)
```typescript
'use client';

import { useProject } from '@/features/projects';

export function ProjectDetails({ id }: { id: string }) {
  const { data: project, isLoading, error } = useProject(id);
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading project</div>;
  
  return <div>{project.name}</div>;
}
```

## Architecture Boundaries

### ✅ Allowed
- Services can import from `lib/`, `db/`, own `schemas.ts`, `types.ts`
- Actions can import from `services.ts`, `lib/auth`
- Components can import from `components/ui/`, own `types.ts`, `actions.ts`, `queries.ts`
- Tests can import anything from their feature

### ❌ Forbidden
- App Router importing services directly (use actions instead)
- Features importing from other features' internals
- Services importing from `actions.ts` or `queries.ts`
- Components importing database client directly
- Putting business logic in `components/ui/`

## Testing Commands

```bash
# Run all tests
bun test

# Run tests for this feature only
bun test features/projects

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

## Adding New Functionality

1. **Add types** to `types.ts`
2. **Add validation** to `schemas.ts`
3. **Add business logic** to `services.ts`
4. **Add Server Action** to `actions.ts` (if needed)
5. **Add React Query hook** to `queries.ts` (if needed)
6. **Add component** to `components/` (if needed)
7. **Add tests** to `__tests__/`
8. **Export** from `index.ts` (if public API)

## Key Principles

1. **services.ts is the Source of Truth**: All business logic goes here
2. **Type Safety**: No `any`, use Zod for runtime validation
3. **Single Responsibility**: Each file has one clear purpose
4. **Testability**: All logic is easily testable
5. **Isolation**: Features are self-contained vertical slices
