import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconRocket, IconCode, IconDatabase, IconBrandReact } from '@tabler/icons-react';

export default function Page() {
  const features = [
    {
      icon: IconRocket,
      title: 'Feature-Driven',
      description: 'Vertical slice architecture for scalable, maintainable code',
    },
    {
      icon: IconCode,
      title: 'Type-Safe',
      description: 'Full TypeScript with Zod validation and strict mode',
    },
    {
      icon: IconDatabase,
      title: 'Modern Stack',
      description: 'Next.js 16, Drizzle ORM, PostgreSQL, and Better-auth',
    },
    {
      icon: IconBrandReact,
      title: 'Beautiful UI',
      description: 'shadcn/ui components with intentional minimalism',
    },
  ];

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient opacity-10" />
        
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-serif text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-7xl">
              <span className="text-gradient">Capgemini</span> Project
            </h1>
            
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400">
              A modern, feature-driven architecture built with Next.js 16, TypeScript, and best practices.
              Scalable, maintainable, and elegant.
            </p>
            
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/recruitment">
                <Button className="rounded-full px-8">
                  Open Dashboard
                </Button>
              </Link>
              
              <Link href="/sign-up">
                <Button variant="outline" className="rounded-full px-8">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Built with Modern Standards
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Every decision is intentional. Every component is purpose-driven.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="group relative overflow-hidden rounded-xl border border-gray-200 p-6 transition-all hover:border-gray-300 hover:shadow-lg dark:border-gray-800 dark:hover:border-gray-700"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900">
                  <Icon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                </div>
                
                <h3 className="mb-2 font-sans text-lg font-semibold text-gray-900 dark:text-white">
                  {feature.title}
                </h3>
                
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
                
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient opacity-0 transition-opacity group-hover:opacity-100" />
              </Card>
            );
          })}
        </div>
      </section>

      {/* Architecture Section */}
      <section className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              Feature-Driven Architecture
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Code organized by business capability, not technical layer.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-3xl">
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    Vertical Slices
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Each feature is self-contained with its own services, actions, and components.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    Clear Boundaries
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Strict layer separation ensures maintainability and testability.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    Type Safety
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    No any types. Zod validation for runtime safety. TypeScript strict mode.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}