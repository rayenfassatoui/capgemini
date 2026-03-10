# Capgemini Talent Intelligence

AI-powered recruitment platform. Manages the full hiring pipeline: job creation, CV screening, multi-stage interviews, and hiring decisions.

## Tech Stack

Next.js 16 / TypeScript / Bun / Tailwind CSS + shadcn/ui / PostgreSQL (Neon) + Drizzle ORM / Better-auth / OpenRouter AI

## Getting Started

```bash
bun install
cp .env.example .env   # Fill in your values
bun run db:push        # Push schema to database
bun dev                # http://localhost:3000
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_URL` | App URL (`http://localhost:3000`) |
| `BETTER_AUTH_SECRET` | Random secret for auth |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `EMAIL_USER` | Gmail address for interview emails |
| `EMAIL_PASSWORD` | Gmail App Password |
| `NVIDIA_API_KEY` | NVIDIA NIM API key for semantic CV search ([build.nvidia.com](https://build.nvidia.com/)) |

## Scripts

| Command | Description |
|---|---|
| `bun dev` | Dev server (Turbopack) |
| `bun run build` | Production build |
| `bun run lint` | Lint |
| `bun run test` | Tests |
| `bun run db:push` | Push DB schema |
| `bun run db:studio` | Drizzle Studio |
| `bun run db:seed` | Seed demo users |

## Docs

See [ARCHITECTURE.md](ARCHITECTURE.md) and [PROJECT-RESUME.md](PROJECT-RESUME.md) for details.

## Semantic Search (pgvector)

The platform uses NVIDIA NV-EmbedQA E5 V5 embeddings with pgvector for semantic CV search. This requires:

1. The `vector` PostgreSQL extension enabled on your Neon database:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. A valid `NVIDIA_API_KEY` in your environment (separate from `OPENROUTER_API_KEY`).
3. Run `bun run db:push` to create the vector column and HNSW index.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
