# Capgemini Talent Intelligence

AI-powered recruitment platform built for enterprise hiring workflows. Manages the complete talent pipeline from CV upload through job matching, multi-stage interviews, and final hiring decisions --- driven by an AI Agent with 50+ tools.

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript (Strict Mode) |
| **Runtime** | Bun |
| **Styling** | Tailwind CSS v4 + shadcn/ui |
| **Database** | PostgreSQL (Neon) + Drizzle ORM + pgvector |
| **Auth** | Better-auth (email/password, role-based) |
| **AI (LLM)** | NVIDIA Build API (stepfun-ai/step-3.7-flash) |
| **AI (Embeddings)** | NVIDIA NV-EmbedQA E5 V5 (1024-dim vectors) |
| **Email** | Nodemailer (Gmail SMTP) |
| **Charts** | Recharts |
| **Testing** | Vitest + Testing Library |

## Getting Started

```bash
bun install
cp .env.example .env   # Fill in your values
bun run db:push        # Push schema to database
bun run db:seed        # Seed local role accounts and baseline jobs
bun dev                # http://localhost:3000
```

### Semantic Search Setup (Optional)

Semantic CV search uses NVIDIA embeddings + pgvector. To enable:

1. Enable the `vector` extension on your Neon database:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. Set `NVIDIA_API_KEY` in `.env` (get one at [build.nvidia.com](https://build.nvidia.com/))
3. Run `bun run db:push` to create the embedding column and HNSW index

CVs uploaded after setup will automatically generate embeddings. The AI agent can use the `semantic_search_cvs` tool for meaning-based candidate discovery.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `BETTER_AUTH_URL` | Yes | App URL (`http://localhost:3000`) |
| `BETTER_AUTH_SECRET` | Yes | Random secret for auth sessions |
| `NVIDIA_API_KEY` | Yes | NVIDIA Build API key for LLM agent + semantic search |
| `EMAIL_USER` | No | Gmail address for interview invitation emails |
| `EMAIL_PASSWORD` | No | Gmail App Password for SMTP |

## Scripts

| Command | Description |
|---|---|
| `bun dev` | Dev server (Turbopack) |
| `bun run build` | Production build |
| `bun run lint` | ESLint |
| `bun run test` | Vitest tests |
| `bun run db:push` | Push Drizzle schema to database |
| `bun run db:studio` | Open Drizzle Studio (DB GUI) |
| `bun run db:seed` | Seed local role accounts and baseline job records |
| `bun run db:seed-users` | Seed local role accounts only |
| `bun run db:seed-jobs` | Seed baseline job postings |
| `bun run db:seed-interviews` | Seed pipeline/interview records after CVs exist |

## User Roles

| Role | Access |
|---|---|
| **TA** (Talent Acquisition) | Full pipeline: CV pool, jobs, candidates, interviews, AI agent |
| **Manager** | Candidate review (manager stage+), interviews they conduct |
| **HR** | Candidate review (HR stage+), hiring decisions, export |
| **Admin** | Everything + user management, analytics, system overview |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) --- System architecture, folder structure, layer boundaries
- [PROJECT-RESUME.md](PROJECT-RESUME.md) --- Feature inventory, AI capabilities, technical decisions

## Deployment

Deploy to Vercel with zero configuration:

```bash
# Vercel auto-detects Next.js + Bun
vercel deploy
```

Set all environment variables in the Vercel dashboard. The `DATABASE_URL` should point to your Neon database with pooled connections.
