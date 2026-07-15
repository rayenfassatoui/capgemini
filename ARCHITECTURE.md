# Architecture

## Design Philosophy

**Feature-Driven Architecture (Vertical Slices)**: Business logic is grouped by domain, not by technical type. Each feature owns its actions, services, schemas, types, and components.

## Folder Structure

```
app/                                    # Next.js App Router — ROUTING ONLY
├── (auth)/                             # Auth pages (sign-in, sign-up redirects to sign-in)
├── (dashboard)/                        # Protected dashboard routes
│   ├── agent/                          # Full AI agent workspace
│   ├── ta/                             # Talent Acquisition views
│   │   ├── dashboard/                  # TA dashboard
│   │   ├── cv-pool/                    # CV upload & management
│   │   ├── jobs/                       # Job postings & matching
│   │   │   └── [id]/                   # Job detail + candidates
│   │   ├── calendar/                   # Interview calendar
│   │   └── statistique/               # TA analytics only
│   ├── manager/                        # Hiring Manager views
│   │   ├── dashboard/
│   │   └── candidates/[id]/
│   ├── hr/                             # HR views
│   │   ├── dashboard/
│   │   ├── candidates/[id]/
│   │   └── export/                     # CSV/Excel exports
│   └── admin/                          # Admin panel
│       ├── dashboard/
│       ├── settings/                   # User management
│       ├── analytics/                  # System analytics
│       ├── activity/                   # Activity log
│       ├── emails/                     # Email log
│       └── onboarding/                # Onboarding tracker
├── api/
│   ├── auth/[...all]/                  # Better-auth handler
│   └── chat/statistics/               # AI Agent SSE endpoint
└── layout.tsx

features/recruitment/                   # Core business logic (Vertical Slice)
├── actions.ts                          # Server Actions (thin wrappers)
├── schemas.ts                          # Zod validation schemas
├── types.ts                            # TypeScript types & enums
├── services/                           # Business logic + DB (SOURCE OF TRUTH)
│   ├── index.ts                        # Barrel export
│   ├── ai.ts                           # NVIDIA Build API client + model routing
│   ├── ai-features.ts                  # AI-powered features (debrief, compare, predict)
│   ├── chat.ts                         # Chat context builder + conversation CRUD
│   ├── cv-pool.ts                      # CV upload, parse, list, search
│   ├── cv-matching.ts                  # Keyword + semantic matching
│   ├── embeddings.ts                   # NVIDIA embedding generation + storage
│   ├── candidates.ts                   # Candidate CRUD + stage management
│   ├── jobs.ts                         # Job CRUD + templates
│   ├── interviews.ts                   # Interview scheduling + reports
│   ├── screening.ts                    # AI screening generation
│   ├── duplicate-detection.ts          # CV deduplication
│   ├── statistics.ts                   # Dashboard stats + insights
│   ├── email.ts                        # Email sending (Nodemailer)
│   ├── export.ts                       # CSV/Excel export generation
│   ├── notifications.ts               # In-app notifications
│   ├── activity-log.ts                # Audit trail
│   ├── onboarding.ts                  # Post-hire onboarding checklists
│   └── agent-tools/                    # AI Agent tool registry
│       ├── index.ts                    # Central registry + RBAC + executor
│       ├── types.ts                    # Tool interfaces (AgentToolDefinition, etc.)
│       ├── schemas.ts                  # Zod validation for tool arguments
│       ├── utils.ts                    # Shared helpers (sanitize, truncate, resolveId)
│       ├── cv-pool.ts                  # CV tools (list, get, delete, upload, search)
│       ├── jobs.ts                     # Job tools (create, list, close, templates)
│       ├── candidates.ts              # Candidate tools (assign, stage, notes)
│       ├── matching.ts                 # Matching tools (keyword, semantic, bulk assign)
│       ├── interviews.ts              # Interview tools (schedule, report, calendar)
│       ├── communication.ts           # Email tools (invite, rejection, export)
│       ├── ai-features.ts             # AI tools (debrief, compare, predict, summarize)
│       ├── dashboard.ts               # Stats tools
│       ├── activity.ts                # Activity + onboarding tools
│       └── admin.ts                   # Admin-only tools
└── components/                         # Feature-specific UI components
    ├── cv-pool-client.tsx
    ├── jobs-client.tsx
    ├── job-detail-client.tsx
    ├── statistics-chat.tsx
    ├── chat/                           # Chat UI components
    └── ...

components/
├── ui/                                 # shadcn/ui primitives (generic)
└── shared/                             # Shared reusable components

lib/                                    # Shared utilities
├── db.ts                               # Drizzle client (Neon serverless)
├── auth.ts                             # Better-auth config + requireRole helper
├── auth-client.ts                      # Client-side auth hooks
├── rate-limit.ts                       # Sliding window rate limiter
├── i18n.ts                             # Internationalization
├── logger.ts                           # Structured logging
└── utils.ts                            # cn() and general helpers

db/
├── schema.ts                           # Drizzle schema (all tables)
├── seed.ts                             # Local seed orchestrator
├── seed-users.ts                       # Local role account seeding
├── seed-jobs.ts                        # Baseline job seeding
├── seed-interviews.ts                  # Pipeline/interview fixture seeding
├── enable-pgvector.sql                 # pgvector extension setup
└── migrations/                         # Drizzle migrations
```

## Layer Boundaries

| Layer | Allowed | Forbidden |
|---|---|---|
| **App Router** (`app/`) | Rendering, metadata, route orchestration | Direct DB calls, business logic |
| **Actions** (`actions.ts`) | Auth check, call services, revalidate paths | DB queries, complex logic |
| **Services** (`services/`) | Business logic, DB access, AI calls | Importing other features |
| **Agent Tools** (`agent-tools/`) | Tool definitions, executors via services | Direct DB access |
| **Components** (`components/ui/`) | Pure UI primitives | Business logic, DB access |

## AI Agent Architecture

```
User Message
    │
    ▼
┌─────────────────────────┐
│POST /api/chat/statistics│  ← Rate Limited (15 req/min/user)
│  Session + RBAC check   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Build System Prompt     │
│  + getStatisticsChatContext()  │  ← Live DB context (limited queries)
│  + getToolsForRole(role) │  ← RBAC-filtered tool list
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  LLM Agent Loop          │  ← Max 8 iterations
│  (NVIDIA Build API)      │
│                          │
│  ┌───────┐  ┌─────────┐ │
│  │ Think │→ │ Tool    │ │
│  │       │  │ Call    │ │
│  └───────┘  └────┬────┘ │
│                  │      │
│          ┌───────▼───────┐
│          │ executeAgentTool() │
│          │ 1. RBAC check      │
│          │ 2. Zod validation  │
│          │ 3. Execute handler │
│          │ 4. sanitizeForJson │
│          └───────┬───────┘
│                  │      │
│  ┌───────────────▼──┐   │
│  │ Tool Result →    │   │
│  │ Back to LLM      │   │
│  └──────────────────┘   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  SSE Stream Response     │
│  @@TOOL_START@@ events  │
│  @@TOOL_END@@ events    │
│  Final text (chunked)    │
└─────────────────────────┘
```

## Database Schema (Key Tables)

| Table | Purpose |
|---|---|
| `users` | Auth users with roles (ta, manager, hr, admin) |
| `jobs` | Job postings with must-have/nice-to-have skills |
| `cv_pool` | Uploaded CVs with extracted metadata + embedding vector |
| `candidates` | CV-to-Job assignments with pipeline stage |
| `screenings` | AI-generated match scores |
| `interviews` | Scheduled interviews with stage/status |
| `interview_guides` | AI-generated interview questions |
| `interview_reports` | Post-interview evaluations |
| `chat_conversations` | AI chat conversation threads |
| `chat_messages` | Individual chat messages |
| `notifications` | In-app notification queue |
| `activity_log` | Audit trail for all actions |
| `onboarding_tasks` | Post-hire onboarding checklists |

## Candidate Pipeline

```
new → ta_screening → ta_interview → ta_accepted → manager_interview
                                  → ta_rejected
                                                 → manager_accepted → hr_interview
                                                 → manager_rejected
                                                                    → hr_accepted → hired
                                                                    → hr_rejected
```

## Security

- **Authentication**: Better-auth with email/password
- **Authorization**: Role-based access control (RBAC) at route + action + tool level
- **Rate Limiting**: Sliding window limiter on AI endpoints (15 req/min/user)
- **Input Validation**: Zod schemas on all Server Actions + Agent Tool arguments
- **Data Sanitization**: `sanitizeForJson()` strips rawBytes/rawText before LLM context
- **SQL Injection**: Prevented by Drizzle ORM parameterized queries
