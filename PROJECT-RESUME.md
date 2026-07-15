# Project Resume

## Overview

**Capgemini Talent Intelligence** is an enterprise-grade AI-powered recruitment platform that automates and streamlines the full hiring lifecycle. Built with a Feature-Driven Architecture, it serves four distinct user roles (TA, Manager, HR, Admin) through role-specific dashboards with a shared AI agent backbone.

## Core Features

### CV Pool Management
- Drag-and-drop CV upload (PDF, DOCX)
- Automatic text extraction and metadata parsing (name, email, phone, skills, experience, education, languages)
- Keyword-based and semantic search across the CV pool
- Duplicate CV detection (name/email/phone similarity scoring)
- Bulk operations and CSV/Excel export

### Job Management
- Job creation with structured requirements (must-have, nice-to-have, seniority, business unit)
- AI-powered job description generation from title + seniority
- Job templates (save, list, create from template)
- Job closing with safety checks (no pending interviews or active candidates)

### Candidate Pipeline
- 12-stage pipeline: `new` → `ta_screening` → `ta_interview` → `ta_accepted` → `manager_interview` → `manager_accepted` → `hr_interview` → `hr_accepted` → `hired`
- Stage transitions with role-based permissions
- Bulk candidate stage updates
- Candidate notes visible to all team members
- Post-hire onboarding checklists

### AI-Powered Matching
- **Keyword Matching**: Scores CVs against job requirements based on skill overlap
- **Semantic Search**: NVIDIA NV-EmbedQA E5 V5 embeddings (1024-dim) with pgvector cosine similarity
- **AI-Enhanced Matching**: Filters by skills, languages, minimum experience with AI recommendations
- **Bulk Assignment**: Auto-assign top N matched CVs to a job

### Interview Management
- Multi-stage scheduling (TA, Manager, HR)
- AI-generated interview question guides tailored to candidate + job + stage
- Interview reports with scoring and decision tracking
- Calendar view with date range filtering
- Automated interview invitation emails (Nodemailer + Gmail SMTP)
- AI interview debrief (analyze report, recommend accept/reject/hold)
- AI follow-up question generator from previous interview answers

### AI Agent (50+ Tools)
The platform includes a dedicated `/agent` workspace for long-form analysis, history, and traces, plus a dashboard-wide floating entry for compact chat. The agent can:

| Category | Tools |
|---|---|
| **CV Pool** | list, get, search, delete, upload, check duplicates, scan pool |
| **Jobs** | create, list, get, close, templates, AI job description |
| **Candidates** | assign, list by job/stage, update stage, bulk update, notes |
| **Matching** | keyword match, AI match with filters, bulk assign, semantic search |
| **Interviews** | schedule, reschedule, cancel, generate questions, reports, calendar, debrief |
| **AI Features** | compare candidates, predict pipeline score, summarize candidate, talent insights, optimize job, follow-up questions, generate emails |
| **Communication** | send interview invites, rejection emails, export CSV |
| **Dashboard** | stats, insights, CV pool stats, job stats |
| **Admin** | system overview, recruitment analytics, email logs, onboarding overview |

**Agent capabilities:**
- Multi-step reasoning with automatic tool chaining
- RBAC-enforced tool access per user role
- Zod-validated tool arguments
- SSE streaming with real-time tool execution events
- Conversation memory (persisted in database)
- File attachment support (upload CVs via chat)

### Analytics & Reporting
- Role-specific dashboards with KPI cards
- Skill demand vs supply gap analysis
- Pipeline funnel visualization
- Upload trend tracking (7-day)
- Recharts-powered interactive charts
- AI-powered smart insights

### Admin Panel
- User management (roles, banning)
- System-wide recruitment analytics
- Activity log with entity-level drill-down
- Email sending log
- Onboarding progress tracker
- Data export (CSV, Excel)

## Technical Decisions

| Decision | Rationale |
|---|---|
| **Feature-Driven Architecture** | Vertical slices keep related code together, easier to reason about than MVC |
| **Server Actions over API routes** | Colocation with UI, automatic revalidation, type-safe forms |
| **NVIDIA Build API** | OpenAI-compatible NVIDIA endpoint; all current task types use `stepfun-ai/step-3.5-flash` |
| **NVIDIA E5 V5 over OpenAI embeddings** | Free tier available, 1024-dim vectors, good multilingual support |
| **pgvector over Pinecone/Weaviate** | No external vector DB needed, lives in same Neon database, HNSW indexing |
| **In-memory rate limiting** | Zero dependencies, sufficient for single-instance deployment |
| **Better-auth over NextAuth** | Simpler API, built-in role support, no adapter boilerplate |
| **Bun over Node.js** | Faster installs, native TypeScript execution, built-in test runner compatibility |
| **Drizzle over Prisma** | SQL-like API, better TypeScript inference, lighter bundle |

## AI Model Configuration

```typescript
// features/recruitment/services/ai.ts
export const AI_MODELS = {
  agent: 'stepfun-ai/step-3.5-flash',       // Tool calling, multi-step reasoning
  structured: 'stepfun-ai/step-3.5-flash',  // JSON generation, scoring
  generation: 'stepfun-ai/step-3.5-flash',  // Job descriptions, emails
};
```

Override all models at once by setting `AI_MODEL` in `.env`.

## Security Measures

- **Authentication**: Better-auth with email/password and session management
- **Authorization**: Three-layer RBAC (route middleware, server action, agent tool)
- **Rate Limiting**: Sliding window rate limiter (15 req/min/user on AI endpoints)
- **Input Validation**: Zod schemas on all user inputs and agent tool arguments
- **Data Sanitization**: Raw CV bytes stripped before LLM context to prevent token waste
- **Query Safety**: Drizzle ORM parameterized queries prevent SQL injection
- **DB Query Limits**: All chat context queries capped with `.limit()` to prevent OOM at scale

## Performance Optimizations

- Explicit column selection on all CV queries (excludes 1024-dim embedding vector)
- Async embedding generation (non-blocking after CV upload)
- Chunked SSE streaming for AI responses
- DB query limits in chat context builder (300 candidates, 150 interviews max)
- Static imports for hot-path modules (no dynamic `await import()` in executors)
- Stale-entry auto-cleanup in rate limiter (prevents Map memory leak)
