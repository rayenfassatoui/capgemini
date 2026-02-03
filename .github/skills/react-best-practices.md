---
description: React and Next.js performance optimization and best practices
triggers:
  - "*.tsx"
  - "*.jsx"
  - "components/**"
  - "features/**/components/**"
  - keywords: ["react", "component", "hook", "performance"]
priority: 8
version: 1.0.0
last_updated: 2026-02-03
---

# React & Next.js Best Practices

## Overview

This skill provides guidance on React and Next.js development patterns specific to our Feature-Driven Architecture, with emphasis on performance, type safety, and modern best practices.

## When to Use

- Creating new React components
- Optimizing component performance
- Implementing hooks
- Working with Server Components and Client Components
- State management decisions

---

## Core Principles

### 1. Server-First Philosophy

**Default to Server Components**

```typescript
// ✅ GOOD: Server Component (default)
export default async function ProjectsPage() {
  const projects = await getProjects();
  
  return (
    <div>
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

```typescript
// ❌ BAD: Using Client Component unnecessarily
'use client';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  
  useEffect(() => {
    fetch('/api/projects').then(/* ... */);
  }, []);
  
  return <div>{/* ... */}</div>;
}
```

**When to use 'use client'**:
- Browser APIs (localStorage, window, document)
- Event handlers (onClick, onChange)
- React hooks (useState, useEffect, useContext)
- Third-party libraries that require browser environment

### 2. Type Safety

**Always type component props explicitly**

```typescript
// ✅ GOOD: Explicit types
interface ProjectCardProps {
  project: Project;
  onSelect?: (id: string) => void;
  variant?: 'default' | 'compact';
}

export function ProjectCard({ project, onSelect, variant = 'default' }: ProjectCardProps) {
  return <div>{/* ... */}</div>;
}
```

```typescript
// ❌ BAD: No types or any
export function ProjectCard({ project, onSelect }: any) {
  return <div>{/* ... */}</div>;
}
```

### 3. Component Composition

**Prefer composition over prop drilling**

```typescript
// ✅ GOOD: Composition
export function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <ProjectHeader />
      <main>{children}</main>
      <ProjectFooter />
    </div>
  );
}

// Usage
<ProjectLayout>
  <ProjectDetails project={project} />
</ProjectLayout>
```

```typescript
// ❌ BAD: Prop drilling
export function ProjectLayout({ 
  project,
  user,
  settings,
  onUpdate,
  onDelete 
}: Props) {
  return (
    <div>
      <ProjectHeader user={user} settings={settings} />
      <ProjectDetails 
        project={project} 
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
      <ProjectFooter user={user} />
    </div>
  );
}
```

---

## Performance Optimization

### 1. Memoization

**Use React.memo for expensive components**

```typescript
// ✅ GOOD: Memoized component
export const ProjectCard = React.memo(function ProjectCard({ project }: Props) {
  return (
    <Card>
      <h3>{project.name}</h3>
      <p>{project.description}</p>
    </Card>
  );
});

// ✅ GOOD: Custom comparison function
export const ProjectCard = React.memo(
  function ProjectCard({ project }: Props) {
    return <div>{/* ... */}</div>;
  },
  (prevProps, nextProps) => {
    return prevProps.project.id === nextProps.project.id &&
           prevProps.project.updatedAt === nextProps.project.updatedAt;
  }
);
```

**When NOT to use React.memo**:
- Simple components (< 5 lines)
- Components that always receive new props
- Components that rarely re-render

### 2. useMemo and useCallback

```typescript
// ✅ GOOD: Memoize expensive calculations
function ProjectList({ projects, filters }: Props) {
  const filteredProjects = useMemo(() => {
    return projects.filter(p => 
      p.status === filters.status &&
      p.name.toLowerCase().includes(filters.search.toLowerCase())
    );
  }, [projects, filters.status, filters.search]);
  
  return <div>{/* ... */}</div>;
}

// ✅ GOOD: Memoize callbacks passed to child components
function ProjectManager({ projectId }: Props) {
  const handleUpdate = useCallback((data: UpdateData) => {
    updateProject(projectId, data);
  }, [projectId]);
  
  return <ProjectForm onSubmit={handleUpdate} />;
}
```

```typescript
// ❌ BAD: Unnecessary memoization
function SimpleComponent({ name }: Props) {
  const greeting = useMemo(() => `Hello, ${name}!`, [name]); // Overkill
  return <div>{greeting}</div>;
}
```

### 3. Lazy Loading

```typescript
// ✅ GOOD: Lazy load heavy components
const HeavyChart = lazy(() => import('./heavy-chart'));

export function Dashboard() {
  return (
    <Suspense fallback={<Loader />}>
      <HeavyChart data={data} />
    </Suspense>
  );
}

// ✅ GOOD: Lazy load route components
const ProjectDetails = lazy(() => import('@/features/projects/components/project-details'));
```

---

## Hooks Best Practices

### 1. Custom Hooks

**Extract reusable logic into custom hooks**

```typescript
// ✅ GOOD: Custom hook
function useProjectForm(projectId?: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { register, handleSubmit, formState: { errors } } = useForm<ProjectSchema>({
    resolver: zodResolver(projectSchema),
  });
  
  const onSubmit = useCallback(async (data: ProjectSchema) => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (projectId) {
        await updateProject(projectId, data);
      } else {
        await createProject(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);
  
  return {
    register,
    handleSubmit: handleSubmit(onSubmit),
    isLoading,
    error,
    fieldErrors: errors,
  };
}

// Usage
function CreateProjectForm() {
  const { register, handleSubmit, isLoading, error } = useProjectForm();
  
  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  );
}
```

### 2. Hook Dependencies

```typescript
// ✅ GOOD: Complete and correct dependencies
useEffect(() => {
  if (projectId) {
    fetchProject(projectId).then(setProject);
  }
}, [projectId]); // All external values used inside

// ❌ BAD: Missing dependencies
useEffect(() => {
  if (projectId) {
    fetchProject(projectId).then(setProject);
  }
}, []); // projectId is missing!

// ❌ BAD: Unnecessary dependencies
useEffect(() => {
  console.log('Component mounted');
}, [someValue]); // someValue is not used
```

### 3. useEffect Cleanup

```typescript
// ✅ GOOD: Always cleanup side effects
useEffect(() => {
  const controller = new AbortController();
  
  fetch(`/api/projects/${id}`, { signal: controller.signal })
    .then(res => res.json())
    .then(setProject)
    .catch(err => {
      if (err.name !== 'AbortError') {
        console.error(err);
      }
    });
  
  return () => controller.abort();
}, [id]);

// ✅ GOOD: Cleanup subscriptions
useEffect(() => {
  const subscription = observable.subscribe(value => {
    setState(value);
  });
  
  return () => subscription.unsubscribe();
}, []);
```

---

## State Management

### 1. Local State

```typescript
// ✅ GOOD: Use local state for UI-only state
function DropdownMenu() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      {isOpen && <MenuItems />}
    </div>
  );
}
```

### 2. URL State

```typescript
// ✅ GOOD: Use URL for shareable state
'use client';

import { useSearchParams, useRouter } from 'next/navigation';

function ProjectFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const status = searchParams.get('status') ?? 'all';
  
  const setStatus = (newStatus: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('status', newStatus);
    router.push(`?${params.toString()}`);
  };
  
  return <FilterSelect value={status} onChange={setStatus} />;
}
```

### 3. Server State (React Query)

```typescript
// ✅ GOOD: Use React Query for server data
export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => fetchProject(id),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!id,
  });
}

// Usage
function ProjectDetails({ id }: Props) {
  const { data: project, isLoading, error } = useProject(id);
  
  if (isLoading) return <Loader />;
  if (error) return <ErrorMessage error={error} />;
  if (!project) return <NotFound />;
  
  return <div>{project.name}</div>;
}
```

---

## Component Patterns

### 1. Compound Components

```typescript
// ✅ GOOD: Compound component pattern
export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="card-header">{children}</div>;
};

Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
};

Card.Footer = function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="card-footer">{children}</div>;
};

// Usage
<Card>
  <Card.Header>
    <h2>Title</h2>
  </Card.Header>
  <Card.Body>
    <p>Content</p>
  </Card.Body>
  <Card.Footer>
    <button>Action</button>
  </Card.Footer>
</Card>
```

### 2. Render Props

```typescript
// ✅ GOOD: Render props for flexible rendering
interface DataFetcherProps<T> {
  url: string;
  children: (data: T | null, isLoading: boolean, error: Error | null) => React.ReactNode;
}

function DataFetcher<T>({ url, children }: DataFetcherProps<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [url]);
  
  return <>{children(data, isLoading, error)}</>;
}

// Usage
<DataFetcher<Project> url="/api/projects/123">
  {(project, isLoading, error) => {
    if (isLoading) return <Loader />;
    if (error) return <Error error={error} />;
    return <ProjectCard project={project} />;
  }}
</DataFetcher>
```

---

## Error Handling

### 1. Error Boundaries

```typescript
// ✅ GOOD: Error boundary for graceful error handling
'use client';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    
    return this.props.children;
  }
}

// Usage
<ErrorBoundary fallback={<ErrorMessage />}>
  <ProjectDetails id={id} />
</ErrorBoundary>
```

---

## Testing Considerations

### 1. Testable Components

```typescript
// ✅ GOOD: Easy to test
export function ProjectCard({ project, onSelect }: Props) {
  return (
    <div data-testid="project-card">
      <h3>{project.name}</h3>
      <button onClick={() => onSelect(project.id)}>Select</button>
    </div>
  );
}

// Test
test('calls onSelect when button clicked', () => {
  const onSelect = vi.fn();
  render(<ProjectCard project={mockProject} onSelect={onSelect} />);
  
  fireEvent.click(screen.getByRole('button'));
  
  expect(onSelect).toHaveBeenCalledWith(mockProject.id);
});
```

---

## Anti-Patterns to Avoid

❌ **Large Components**: Break down components > 200 lines
❌ **Prop Drilling**: Use composition or context instead
❌ **Inline Function Definitions**: Extract to named functions or useCallback
❌ **Overuse of useEffect**: Consider if you really need it
❌ **Mutating State**: Always create new objects/arrays
❌ **Index as Key**: Use stable, unique identifiers
❌ **Unnecessary Client Components**: Default to Server Components

---

## References

- [React Documentation](https://react.dev/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [React Query](https://tanstack.com/query/latest)
- [React Hook Form](https://react-hook-form.com/)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
