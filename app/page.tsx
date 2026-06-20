'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  IconArrowRight,
  IconBrain,
  IconBriefcase,
  IconChartBar,
  IconChecklist,
  IconClock,
  IconDatabaseSearch,
  IconFileAnalytics,
  IconLock,
  IconMessageChatbot,
  IconRoute,
  IconShieldCheck,
  IconSparkles,
  IconUsers,
} from '@tabler/icons-react';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const ROLE_PATHS = [
  {
    role: 'TA',
    title: 'Screen and match faster',
    description:
      'Upload CVs, structure job requirements, and let the agent explain the strongest fits with traceable evidence.',
    icon: IconDatabaseSearch,
  },
  {
    role: 'Manager',
    title: 'Interview with context',
    description:
      'Review shortlisted candidates, interview kits, scorecards, and rationale without switching tools.',
    icon: IconChecklist,
  },
  {
    role: 'HR',
    title: 'Keep decisions auditable',
    description:
      'Follow every stage from screening to onboarding with consistent reports and role-based access.',
    icon: IconShieldCheck,
  },
];

const PLATFORM_CAPABILITIES = [
  {
    title: 'Context-aware agent',
    description:
      'A floating assistant for quick page-level questions plus a full workspace for deeper analysis.',
    icon: IconMessageChatbot,
  },
  {
    title: 'CV intelligence',
    description:
      'Extract skills, experience, and candidate signals, then match them against job requirements.',
    icon: IconFileAnalytics,
  },
  {
    title: 'Pipeline visibility',
    description:
      'See stage health, interview workload, candidate movement, and bottlenecks in one command center.',
    icon: IconRoute,
  },
  {
    title: 'Governed access',
    description:
      'Role-based dashboards keep TA, managers, HR, and admins focused on the right decisions.',
    icon: IconLock,
  },
];

const METRICS = [
  { label: 'Recruitment roles', value: '4', detail: 'TA, Manager, HR, Admin' },
  { label: 'Core workflows', value: '6', detail: 'CVs, jobs, matching, interviews, analytics, onboarding' },
  { label: 'Agent modes', value: '2', detail: 'Floating copilot and full workspace' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/75 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Talent Intelligence home">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconSparkles className="size-5" />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight">Talent Intelligence</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Capgemini Recruitment OS
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="hidden sm:block">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/sign-in">
              <Button className="rounded-full px-5 shadow-lg shadow-primary/20">
                Access Platform
                <IconArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative flex min-h-screen items-center overflow-hidden pt-24">
          <div className="absolute inset-0 -z-10 bg-mesh opacity-80" />
          <div className="absolute left-1/2 top-1/4 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute bottom-0 right-0 -z-10 size-[28rem] rounded-full bg-chart-2/10 blur-3xl" />

          <div className="container mx-auto grid items-center gap-12 px-6 py-20 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)]">
            <motion.div
              initial="initial"
              animate="animate"
              variants={staggerContainer}
              className="max-w-4xl"
            >
              <motion.div variants={fadeInUp}>
                <Badge variant="secondary" className="mb-7 rounded-full px-4 py-1.5 text-sm">
                  <IconBrain className="mr-2 size-4 text-primary" />
                  Internal AI recruitment platform
                </Badge>
              </motion.div>

              <motion.h1
                variants={fadeInUp}
                className="text-5xl font-black leading-[0.98] tracking-tight md:text-7xl lg:text-8xl"
              >
                A governed command center for every hiring decision.
              </motion.h1>

              <motion.p
                variants={fadeInUp}
                className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl"
              >
                Talent Intelligence connects CV analysis, job requirements,
                interviews, analytics, and an auditable AI agent inside one
                role-based recruitment operating system.
              </motion.p>

              <motion.div variants={fadeInUp} className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link href="/sign-in" className="w-full sm:w-auto">
                  <Button size="lg" className="h-13 w-full rounded-full px-7 text-base shadow-xl shadow-primary/20">
                    Sign in to workspace
                    <IconArrowRight className="ml-2 size-5" />
                  </Button>
                </Link>
                <Link href="/agent" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="h-13 w-full rounded-full px-7 text-base bg-background/60 backdrop-blur">
                    Open AI Agent
                  </Button>
                </Link>
              </motion.div>

              <motion.div variants={fadeInUp} className="mt-12 grid gap-3 sm:grid-cols-3">
                {METRICS.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-border/60 bg-card/65 p-4 backdrop-blur-xl">
                    <div className="text-3xl font-black tracking-tight text-primary">{metric.value}</div>
                    <div className="mt-1 text-sm font-semibold">{metric.label}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.75, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-2xl" />
              <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur-xl">
                <div className="flex h-12 items-center gap-2 border-b border-border/60 px-5">
                  <span className="size-3 rounded-full bg-red-400/80" />
                  <span className="size-3 rounded-full bg-amber-400/80" />
                  <span className="size-3 rounded-full bg-emerald-400/80" />
                  <div className="ml-4 h-5 flex-1 rounded-full bg-background/70" />
                </div>

                <div className="grid gap-5 p-5 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <IconUsers className="size-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">TA workspace</p>
                        <p className="text-xs text-muted-foreground">Live pipeline</p>
                      </div>
                    </div>
                    {['CV Pool', 'Job Requirements', 'Calendar', 'AI Agent'].map((item, index) => (
                      <div
                        key={item}
                        className={`rounded-xl px-3 py-2 text-sm ${index === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'}`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        { label: 'Candidates', value: '128', icon: IconUsers },
                        { label: 'Open jobs', value: '18', icon: IconBriefcase },
                        { label: 'Interviews', value: '7', icon: IconClock },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className="rounded-2xl border border-border/60 bg-background/60 p-4">
                            <Icon className="mb-5 size-5 text-primary" />
                            <div className="text-2xl font-black">{item.value}</div>
                            <div className="text-xs text-muted-foreground">{item.label}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">Agent recommendation</p>
                          <p className="text-xs text-muted-foreground">Evidence-backed shortlist</p>
                        </div>
                        <Badge variant="secondary">Auditable</Badge>
                      </div>
                      <div className="flex flex-col gap-3">
                        {['Match CVs to latest job', 'Generate interview kit', 'Explain pipeline risk'].map((task) => (
                          <div key={task} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/70 px-3 py-2">
                            <span className="size-2 rounded-full bg-primary" />
                            <span className="text-sm font-medium">{task}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="h-28 rounded-2xl border border-border/60 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary),transparent_86%),transparent)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <IconChartBar className="size-4 text-primary" />
                        Pipeline health signal
                      </div>
                      <div className="mt-5 flex items-end gap-2">
                        {[42, 70, 54, 88, 64, 92].map((height, index) => (
                          <span
                            key={`${height}-${index}`}
                            className="w-full rounded-t-lg bg-primary/70"
                            style={{ height }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-border/50 bg-muted/25 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Role-based by design</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
                Every team sees the same truth, not the same screen.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                The platform keeps sensitive recruitment data governed while
                giving each role the workflows they actually need.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {ROLE_PATHS.map((path) => {
                const Icon = path.icon;
                return (
                  <Card key={path.role} className="border-border/70 bg-card/70 backdrop-blur-xl">
                    <CardHeader>
                      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="size-6" />
                      </div>
                      <Badge variant="outline" className="w-fit rounded-full">{path.role}</Badge>
                      <CardTitle className="pt-2 text-2xl">{path.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-7 text-muted-foreground">
                      {path.description}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="container mx-auto px-6">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div className="sticky top-24">
                <Badge variant="secondary" className="mb-5 rounded-full px-4 py-1.5">
                  Operating model
                </Badge>
                <h2 className="text-3xl font-black tracking-tight md:text-5xl">
                  Hybrid AI where it matters.
                </h2>
                <p className="mt-5 text-lg leading-8 text-muted-foreground">
                  Quick contextual questions stay in the floating assistant.
                  Deep work moves to the full Agent workspace where tables,
                  downloads, and reasoning traces have room.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {PLATFORM_CAPABILITIES.map((capability) => {
                  const Icon = capability.icon;
                  return (
                    <Card key={capability.title} className="group border-border/70 bg-card/70 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                      <CardHeader>
                        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="size-5" />
                        </div>
                        <CardTitle>{capability.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm leading-7 text-muted-foreground">
                        {capability.description}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="container mx-auto overflow-hidden rounded-[2rem] border border-border/70 bg-card/75 p-8 text-center shadow-2xl shadow-primary/5 backdrop-blur-xl md:p-14">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IconSparkles className="size-7" />
            </div>
            <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-black tracking-tight md:text-5xl">
              Start from the secure workspace, then let the agent follow the workflow.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Sign in with your assigned role to access the recruitment command
              center, candidate data, interview flows, and AI workspace.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/sign-in" className="w-full sm:w-auto">
                <Button size="lg" className="h-13 w-full rounded-full px-8">
                  Access platform
                  <IconArrowRight className="ml-2 size-5" />
                </Button>
              </Link>
              <Link href="/agent" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="h-13 w-full rounded-full px-8">
                  View agent workspace
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-10">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <IconSparkles className="size-4 text-primary" />
            Talent Intelligence
          </div>
          <p>Capgemini Engineering recruitment operating system.</p>
        </div>
      </footer>
    </div>
  );
}
