# AI System Hardening — Engineering Tasks

## TL;DR

> **Quick Summary**: Harden the AI recruitment system through 5 surgical engineering tasks — static import conversion, DB query limits, in-memory rate limiting, Zod validation for 73 agent tools, and god function refactor into 7 helpers.
> 
> **Deliverables**:
> - Static import replacing dynamic `await import()` in `matching.ts`
> - `.limit()` clauses on all 4 unbounded DB queries in `chat.ts` + column narrowing on jobs query
> - New `lib/rate-limit.ts` sliding window rate limiter + integration in chat statistics API
> - New `features/recruitment/services/agent-tools/schemas.ts` with Zod schemas for all 73 registered tools + validation in executor
> - Refactored `getStatisticsChatContext` — orchestrator under 40 lines, 7 helpers each under 60 lines
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 4 → Task 2 → Task 5 → Task 3 → Task 1

---

## Context

### Original Request
User provided a detailed engineering spec titled "Engineering Tasks: AI System Hardening" with 5 tasks to implement in strict order. The goal is zero-behavior-change hardening: eliminate a dynamic import, bound all DB queries, add rate limiting, validate all agent tool arguments with Zod, and decompose a 280-line god function.

### Interview Summary
**Key Discussions**:
- Execution order is strict: Task 4 → Task 2 → Task 5 → Task 3 → Task 1
- All 73 agent tools (not 57 as initially counted) need Zod schemas
- The user's spec provides schemas for ~30 tools; remaining ~43 must be inferred from tool definitions
- God function has 7 sections with shared state (`jobMap`, `filteredCandidates`, `allCandidatesRaw`)
- `interviews.ts` line 374 also has a dynamic import but is explicitly NOT in scope

**Research Findings**:
- `searchCvsSemantically` is exported from `cv-matching.ts:260` and re-exported from barrel `index.ts:20`
- Rate limit insertion: after session check (line 108), before body parsing (line ~110) in `route.ts`
- Validation insertion: after RBAC check (line 114), before handler lookup (line 120) in `index.ts`
- The semantic availability section (lines 273-293) is async with try/catch for pgvector availability
- `_attachment` is injected by the system for `upload_cv` — not a user-provided arg

### Metis Review
**Identified Gaps** (addressed):
- Tool count was 57, actual is 73 — corrected, all 73 will get schemas
- Zod schema mode: using `.passthrough()` to avoid breaking handlers that expect extra fields
- God function helper count: confirmed 7 per user spec (not 10 as Metis suggested)
- Rate limiter config: using spec values (60s window, 15 requests, 429 response)
- DB query limits: using spec values (.limit(300) candidates, .limit(150) interviews, .limit(300) screenings)
- `role` parameter type change: out of scope per zero-behavior-change constraint

---

## Work Objectives

### Core Objective
Harden the AI recruitment system's runtime safety through 5 targeted engineering changes — all without changing any observable behavior.

### Concrete Deliverables
- Modified `features/recruitment/services/agent-tools/matching.ts` — static import at top, dynamic import removed
- Modified `features/recruitment/services/chat.ts` — bounded queries + refactored god function with 7 extracted helpers
- New `lib/rate-limit.ts` — `SlidingWindowRateLimiter` class
- Modified `app/api/chat/statistics/route.ts` — rate limit check in POST handler
- New `features/recruitment/services/agent-tools/schemas.ts` — Zod schemas for all 73 tools
- Modified `features/recruitment/services/agent-tools/index.ts` — Zod validation before handler dispatch

### Definition of Done
- [ ] `bun run build` succeeds with zero errors
- [ ] `bun run lint` passes
- [ ] No `any` types in new/modified code
- [ ] No `await import(...)` in `matching.ts`
- [ ] All 4 DB queries in chat context builder have `.limit()` or column narrowing
- [ ] Rate limiter returns 429 after 15 rapid calls
- [ ] All 73 tool names have corresponding Zod schemas in `TOOL_ARG_SCHEMAS`
- [ ] `getStatisticsChatContext` body is under 40 lines
- [ ] Each extracted helper is under 60 lines
- [ ] Output string from `getStatisticsChatContext` is identical to pre-refactor output

### Must Have
- Zero behavior change — all outputs identical to current
- TypeScript strict compliance — no `any`, no `@ts-ignore`
- All 73 registered tools covered by Zod schemas
- Handler signatures remain `Record<string, unknown>` — validation is pre-handler
- Rate limiter is pure in-memory (no Redis, no external deps)
- `.passthrough()` on Zod schemas so extra fields (like `_attachment`) flow through

### Must NOT Have (Guardrails)
- No `any` types anywhere in new or modified code
- No TODO/FIXME/placeholder comments
- No partial implementations ("you can extend this later")
- No changes to `interviews.ts` dynamic import (out of scope)
- No changes to `ToolHandler` type signature
- No external dependencies added
- No npm/yarn/pnpm — bun exclusively
- No changes to the `role` parameter type on `getStatisticsChatContext`
- No `.strict()` on Zod schemas (would reject `_attachment` and other injected fields)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test configured)
- **Automated tests**: NO — user spec does not request new tests, and these are surgical hardening changes with zero behavior change
- **Framework**: bun test (existing)
- **Verification method**: Build + lint + structural assertions + runtime QA

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code structure**: Use `grep`/`ast_grep_search` to verify patterns exist/don't exist
- **Build verification**: `bun run build` must succeed
- **Lint verification**: `bun run lint` must pass
- **Line count**: Count function body lines for size constraints
- **Rate limiter**: `curl` rapid-fire to verify 429 after threshold

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent tasks):
├── Task 1: Static import conversion in matching.ts [quick]
├── Task 2: DB query limits in chat.ts [quick]
└── Task 3: Create rate limiter lib/rate-limit.ts [quick]

Wave 2 (After Wave 1 — depends on Wave 1 outputs):
├── Task 4: Apply rate limiter to chat statistics route (depends: Task 3) [quick]
├── Task 5: Create Zod schemas for all 73 tools (depends: none, but large) [deep]
└── Task 6: Apply Zod validation in agent-tools/index.ts (depends: Task 5) [quick]

Wave 3 (After Wave 2 — largest refactor, depends on Task 2):
└── Task 7: Refactor god function into 7 helpers (depends: Task 2) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Runtime QA verification [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 2 → Task 7 (longest chain)
Parallel Speedup: ~50% faster than fully sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | — | 1 |
| 2 | — | 7 | 1 |
| 3 | — | 4 | 1 |
| 4 | 3 | — | 2 |
| 5 | — | 6 | 2 |
| 6 | 5 | — | 2 |
| 7 | 2 | F1-F4 | 3 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 3 tasks — T4 → `quick`, T5 → `deep`, T6 → `quick`
- **Wave 3**: 1 task — T7 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Convert Dynamic Import to Static Import in matching.ts

  **What to do**:
  - Add `import { searchCvsSemantically } from '../cv-matching';` at the top of `matching.ts` (after existing imports, line 1)
  - Remove the dynamic import at line 231: `const { searchCvsSemantically } = await import('../cv-matching');`
  - Keep the rest of the `semantic_search_cvs` executor logic identical
  - Verify no circular dependency exists (cv-matching.ts does not import from agent-tools/)

  **Must NOT do**:
  - Do NOT touch any other dynamic imports in the codebase (e.g., `interviews.ts` line 374)
  - Do NOT change any function signatures or return types
  - Do NOT add any types or modify the executor's behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 2-line change (add import, remove dynamic import)
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `features/recruitment/services/agent-tools/matching.ts:1` - Current imports section, add static import here
  - `features/recruitment/services/agent-tools/matching.ts:231` - Dynamic import to remove: `const { searchCvsSemantically } = await import('../cv-matching');`

  **API/Type References**:
  - `features/recruitment/services/cv-matching.ts:260` - `searchCvsSemantically` export (named export, function signature)
  - `features/recruitment/services/index.ts:20` - Barrel re-export confirming the function is part of public API

  **WHY Each Reference Matters**:
  - `matching.ts:1` - This is where to add the new `import` statement
  - `matching.ts:231` - This is the exact line to delete (the dynamic `await import`)
  - `cv-matching.ts:260` - Confirms the function exists and is a named export (not default)
  - `index.ts:20` - Confirms no re-export naming conflicts

  **Acceptance Criteria**:
  - [ ] `grep -c "await import" features/recruitment/services/agent-tools/matching.ts` returns `0`
  - [ ] `grep -c "from '../cv-matching'" features/recruitment/services/agent-tools/matching.ts` returns `1` (the static import)
  - [ ] `bun run build` succeeds

  **QA Scenarios:**

  ```
  Scenario: Static import replaces dynamic import
    Tool: Bash (grep)
    Preconditions: Task 1 changes applied to matching.ts
    Steps:
      1. Run: grep -n "await import" features/recruitment/services/agent-tools/matching.ts
      2. Assert: No output (exit code 1 - no matches)
      3. Run: grep -n "from '../cv-matching'" features/recruitment/services/agent-tools/matching.ts
      4. Assert: Exactly 1 line, near top of file (line < 10)
      5. Run: bun run build
      6. Assert: Exit code 0, no TypeScript errors
    Expected Result: Zero dynamic imports, one static import, build passes
    Failure Indicators: grep finds `await import`, or build fails with import error
    Evidence: .sisyphus/evidence/task-1-static-import.txt

  Scenario: No collateral changes to other files
    Tool: Bash (git diff)
    Preconditions: Only matching.ts should be modified
    Steps:
      1. Run: git diff --name-only
      2. Assert: Only `features/recruitment/services/agent-tools/matching.ts` appears
      3. Run: grep -c "await import" features/recruitment/services/agent-tools/interviews.ts
      4. Assert: Returns `1` (interviews.ts dynamic import is UNTOUCHED)
    Expected Result: Only matching.ts changed, interviews.ts untouched
    Failure Indicators: Other files modified, or interviews.ts dynamic import removed
    Evidence: .sisyphus/evidence/task-1-scope-check.txt
  ```

  **Commit**: YES
  - Message: `fix(matching): convert dynamic import to static for cv-matching`
  - Files: `features/recruitment/services/agent-tools/matching.ts`
  - Pre-commit: `bun run build`

---

- [x] 2. Add DB Query Limits to Chat Context Builder

  **What to do**:
  - In `chat.ts`, modify the jobs query (line ~37) to use explicit column selection:
    ```typescript
    db.select({ id: jobs.id, title: jobs.title, seniority: jobs.seniority, status: jobs.status, mustHave: jobs.mustHave, niceToHave: jobs.niceToHave, businessUnit: jobs.businessUnit }).from(jobs)
    ```
  - In `chat.ts`, add `.limit(300)` to the candidates query (line ~38-41)
  - In `chat.ts`, add `.limit(150)` to both branches of the interviews query (line ~42-48)
  - In `chat.ts`, add `.orderBy(desc(screenings.createdAt)).limit(300)` to the screenings query (line ~49)
  - Ensure `desc` is imported from `drizzle-orm` if not already
  - Do NOT change any other logic in the function

  **Must NOT do**:
  - Do NOT change the structure or output of `getStatisticsChatContext`
  - Do NOT add limits to queries outside the 4 specified
  - Do NOT change any column references or joins
  - Do NOT modify any code below line ~50 in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, surgical additions to 4 existing queries
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 7 (refactor depends on this being done first)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `features/recruitment/services/chat.ts:37-49` - The 4 queries to modify (jobs, candidates, interviews, screenings)
  - `features/recruitment/services/chat.ts:15-296` - Full god function for context

  **API/Type References**:
  - `db/schema.ts` - Table definitions for `jobs`, `candidates`, `interviews`, `screenings`
  - `jobs` table columns: `id`, `title`, `seniority`, `status`, `mustHave`, `niceToHave`, `businessUnit` (plus others not needed)
  - `screenings` table has `createdAt` for ordering

  **External References**:
  - Drizzle ORM `.limit()` and `.select({})` API - standard Drizzle query builder methods

  **WHY Each Reference Matters**:
  - `chat.ts:37-49` - These are the exact 4 queries that need `.limit()` / column narrowing
  - `db/schema.ts` - Needed to confirm column names for the explicit select on jobs query
  - Drizzle docs - Confirm `.limit()` is chained after `.from()` and `.where()`

  **Acceptance Criteria**:
  - [ ] `grep -c "\.limit(" features/recruitment/services/chat.ts` returns >= 3
  - [ ] Jobs query uses explicit `db.select({...})` with 7 columns (not `db.select()`)
  - [ ] `bun run build` succeeds
  - [ ] No `any` types introduced

  **QA Scenarios:**

  ```
  Scenario: All 4 queries have limits
    Tool: Bash (grep + ast_grep_search)
    Preconditions: Task 2 changes applied to chat.ts
    Steps:
      1. Run: grep -n "\.limit(" features/recruitment/services/chat.ts
      2. Assert: At least 3 matches (candidates .limit(300), interviews .limit(150) x2 or combined, screenings .limit(300))
      3. Run: grep -n "db.select({" features/recruitment/services/chat.ts
      4. Assert: At least 1 match for the jobs query with explicit columns
      5. Run: bun run build
      6. Assert: Exit code 0
    Expected Result: All queries bounded, explicit column selection on jobs, build passes
    Failure Indicators: Missing .limit() on any query, build error from wrong column names
    Evidence: .sisyphus/evidence/task-2-query-limits.txt

  Scenario: No behavior change in query results
    Tool: Bash (grep)
    Preconditions: chat.ts modified
    Steps:
      1. Run: grep -c "any" features/recruitment/services/chat.ts | head -5
      2. Assert: No new `any` type annotations added
      3. Verify the function still exports the same name and signature
    Expected Result: Zero new any types, same function signature
    Failure Indicators: any types introduced, function signature changed
    Evidence: .sisyphus/evidence/task-2-no-behavior-change.txt
  ```

  **Commit**: YES
  - Message: `perf(chat): add query limits and column narrowing to context builder`
  - Files: `features/recruitment/services/chat.ts`
  - Pre-commit: `bun run build`

---

- [x] 3. Create In-Memory Sliding Window Rate Limiter

  **What to do**: Create `lib/rate-limit.ts` with `SlidingWindowRateLimiter` class. Constructor takes `(private maxRequests: number, private windowMs: number)`. Private `requests: Map<string, number[]>`. `isAllowed(key)`: filters expired timestamps, checks count < max, pushes if allowed. `reset(key?)`: clears one key or all. Named export. No external deps. Follow code in user's spec exactly.
  **Must NOT do**: No Redis/external packages. No global state outside class. Do NOT import from anywhere yet (Task 4 handles integration).
  **Recommended Agent Profile**: `quick` / Skills: `[]`
  **Parallelization**: Wave 1 (parallel with Tasks 1, 2). Blocks: Task 4. Blocked By: None.
  **References**: `lib/` directory for placement alongside db.ts, auth.ts, utils.ts.
  **Acceptance Criteria**: File exists at `lib/rate-limit.ts`, exports `SlidingWindowRateLimiter`, no external imports, `bun run build` succeeds, no `any`.
  **QA**: bun eval — create instance max=3, call isAllowed 4x, expect true,true,true,false. Reset then re-check.
  Evidence: `.sisyphus/evidence/task-3-rate-limit-basic.txt`
  **Commit**: NO (groups with Task 4)

---

- [x] 4. Apply Rate Limiter to Chat Statistics Route

  **What to do**: In `app/api/chat/statistics/route.ts`: (1) Add import `import { SlidingWindowRateLimiter } from '@/lib/rate-limit';` (2) Create module-level instance: `const chatLimiter = new SlidingWindowRateLimiter(15, 60_000);` (3) In POST handler, after session check (~line 108-110), before body parsing, add: `if (!chatLimiter.isAllowed(session.user.id)) { return NextResponse.json({ error: 'Too many requests. Please wait before sending another message.' }, { status: 429 }); }`
  **Must NOT do**: No changes to existing route logic. No rate limiting on other routes. No modification of rate limiter class.
  **Recommended Agent Profile**: `quick` / Skills: `[]`
  **Parallelization**: Wave 2. Blocks: None. Blocked By: Task 3.
  **References**: `app/api/chat/statistics/route.ts:106-112` (POST handler, session check), `lib/rate-limit.ts` (class from Task 3), `session.user.id` (Better-auth user ID as rate limit key).
  **Acceptance Criteria**: grep finds `SlidingWindowRateLimiter` and `429` in route.ts, instance at module level, `bun run build` succeeds.
  **QA**: grep -n to verify import, instance, isAllowed check, and 429 response all present. Verify line ordering: session check < rate limit < body parsing.
  Evidence: `.sisyphus/evidence/task-4-rate-limit-integration.txt`
  **Commit**: YES (includes Task 3) — `feat(rate-limit): add in-memory sliding window rate limiter` — Files: `lib/rate-limit.ts`, `app/api/chat/statistics/route.ts`

---

- [x] 5. Create Zod Validation Schemas for All 73 Agent Tools

  **What to do**: Create `features/recruitment/services/agent-tools/schemas.ts`. Import `z` from `zod`. Export `TOOL_ARG_SCHEMAS: Record<string, z.ZodType>` mapping every registered tool name to a Zod schema. For each tool, derive the schema from its `parameters.properties` and `parameters.required` in the definition. Use `.passthrough()` on all object schemas so injected fields like `_attachment` flow through. User's spec provides ~30 schemas; infer remaining ~43 from tool definitions in: cv-pool.ts, jobs.ts, candidates.ts, matching.ts, interviews.ts, communication.ts, ai-features.ts, dashboard.ts, activity.ts, admin.ts.

  **Complete tool inventory (73 tools)**:
  - cv-pool (7): upload_cv, list_cv_pool, get_cv_details, delete_cv, search_cv_pool, check_duplicate_cv, scan_pool_duplicates
  - jobs (7): list_jobs, get_job, create_job, close_job, save_job_as_template, list_job_templates, create_job_from_template
  - candidates (8): get_candidates_by_job, get_candidates_by_stage, get_candidate, update_candidate_stage, assign_cv_to_job, add_candidate_note, get_candidate_notes, bulk_update_candidate_stage
  - matching (6): match_cvs_to_job, match_cvs_to_job_with_filters, generate_screening, get_screening, bulk_assign_cvs_to_job, semantic_search_cvs
  - interviews (11): generate_interview_questions, get_interview_guide, schedule_interview, get_interview, get_today_interviews, get_interview_report, get_interview_reports_by_candidate, reschedule_interview, cancel_interview, create_interview_report, get_interview_calendar
  - communication (6): send_interview_invite_email, send_rejection_email, export_candidates_csv, get_notifications, mark_notification_read, mark_all_notifications_read
  - ai-features (9): ai_interview_debrief, compare_candidates, generate_job_description, generate_candidate_email, predict_pipeline_score, ai_summarize_candidate, ai_talent_insights, ai_followup_questions, ai_optimize_job_requirements
  - dashboard (4): get_dashboard_stats, get_cv_pool_stats, get_jobs_stats, get_smart_insights
  - activity (7): get_activity_log, get_activity_by_entity, get_onboarding_checklist, toggle_onboarding_task, add_onboarding_task, get_activity_log_enriched, export_activity_log
  - admin (8): get_system_overview, get_recruitment_analytics, get_email_logs, get_onboarding_overview, get_onboarding_detailed, export_email_logs, export_onboarding, generate_candidate_accept_excel

  **Must NOT do**:
  - Do NOT use `.strict()` on any schema — use `.passthrough()` on ALL
  - Do NOT change `ToolHandler` type signature or handler function signatures
  - Do NOT add runtime validation in this task (Task 6 handles that)
  - Do NOT import from any feature module — schemas use only `zod`
  - Do NOT type `args` as `any` — the map type is `Record<string, z.ZodType>`
  - Zero-param tools get `z.object({}).passthrough()`, NOT omitted from the map
  - `upload_cv` schema includes ONLY `attachmentIndex` (z.number()) — `_attachment` is injected

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 73 schemas in a single file, must cross-reference 10 tool modules for parameter definitions. Large volume, high precision required.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately, but placed in Wave 2 due to size)

  **References**:

  **Pattern References** (tool definitions to derive schemas from):
  - `features/recruitment/services/agent-tools/cv-pool.ts` — 7 tools: `upload_cv` (attachmentIndex: number), `list_cv_pool` (page?, limit?, search?, skills?), `get_cv_details` (cvId), `delete_cv` (cvId), `search_cv_pool` (query, filters?), `check_duplicate_cv` (cvId), `scan_pool_duplicates` (no params)
  - `features/recruitment/services/agent-tools/jobs.ts` — 7 tools: `list_jobs` (status?, page?, limit?), `get_job` (jobId), `create_job` (title, seniority, mustHave, niceToHave, businessUnit), `close_job` (jobId), `save_job_as_template` (jobId, templateName), `list_job_templates` (no params), `create_job_from_template` (templateId, overrides?)
  - `features/recruitment/services/agent-tools/candidates.ts` — 8 tools: check each tool's executor for expected args
  - `features/recruitment/services/agent-tools/matching.ts` — 6 tools: check each tool's executor
  - `features/recruitment/services/agent-tools/interviews.ts` — 11 tools: largest module, check all executors carefully
  - `features/recruitment/services/agent-tools/communication.ts` — 6 tools
  - `features/recruitment/services/agent-tools/ai-features.ts` — 9 tools
  - `features/recruitment/services/agent-tools/dashboard.ts` — 4 tools (mostly zero-param)
  - `features/recruitment/services/agent-tools/activity.ts` — 7 tools
  - `features/recruitment/services/agent-tools/admin.ts` — 8 tools

  **API/Type References**:
  - `features/recruitment/services/agent-tools/types.ts` — `ToolHandler` type, `ExecutorDeps` type
  - User's spec provides ~30 schemas explicitly — use as-is, infer remaining from executor code

  **WHY Each Reference Matters**:
  - Each tool module file contains executor functions that destructure `args` — this reveals the expected parameters and their types
  - `types.ts` confirms the `Record<string, unknown>` contract that handlers expect
  - The user's spec schemas take priority; only infer what's missing

  **Acceptance Criteria**:
  - [ ] File exists: `features/recruitment/services/agent-tools/schemas.ts`
  - [ ] `TOOL_ARG_SCHEMAS` exported as `Record<string, z.ZodType>`
  - [ ] `Object.keys(TOOL_ARG_SCHEMAS).length === 73`
  - [ ] Every schema uses `.passthrough()`
  - [ ] `bun run build` succeeds
  - [ ] No `any` types in the file

  **QA Scenarios:**

  ```
  Scenario: All 73 tools have schemas
    Tool: Bash (bun eval)
    Preconditions: schemas.ts created
    Steps:
      1. Run: bun eval "const s = require('./features/recruitment/services/agent-tools/schemas'); console.log(Object.keys(s.TOOL_ARG_SCHEMAS).length)"
      2. Assert: Output is `73`
      3. Run: bun run build
      4. Assert: Exit code 0
    Expected Result: 73 schemas registered, build passes
    Failure Indicators: Count != 73, build fails, import errors
    Evidence: .sisyphus/evidence/task-5-schema-count.txt

  Scenario: Schema names match registered tool names exactly
    Tool: Bash (bun eval)
    Preconditions: schemas.ts created
    Steps:
      1. Import TOOL_ARG_SCHEMAS and get keys
      2. Compare against known tool names from all 10 modules
      3. Assert: zero missing, zero extra
    Expected Result: 1:1 mapping between schema keys and registered tool names
    Failure Indicators: Missing or extra schema keys
    Evidence: .sisyphus/evidence/task-5-schema-names.txt

  Scenario: Passthrough mode allows extra fields
    Tool: Bash (bun eval)
    Preconditions: schemas.ts created
    Steps:
      1. Parse upload_cv schema with { attachmentIndex: 0, _attachment: "blob" }
      2. Assert: parse succeeds (passthrough allows _attachment)
      3. Parse upload_cv schema with { _attachment: "blob" } (missing attachmentIndex)
      4. Assert: parse fails (attachmentIndex is required)
    Expected Result: Extra fields pass through, required fields enforced
    Failure Indicators: Parse rejects extra fields, or accepts missing required fields
    Evidence: .sisyphus/evidence/task-5-passthrough.txt
  ```

  **Commit**: NO (groups with Task 6)

---

- [x] 6. Apply Zod Validation in Agent Tool Executor

  **What to do**:
  - In `features/recruitment/services/agent-tools/index.ts`:
    1. Add import at top: `import { TOOL_ARG_SCHEMAS } from './schemas';`
    2. After the RBAC check (line ~114) and before the try block (line ~116), insert validation:
    ```typescript
    const schema = TOOL_ARG_SCHEMAS[toolName];
    if (schema) {
      const result = schema.safeParse(args);
      if (!result.success) {
        return {
          success: false,
          error: `Invalid arguments for ${toolName}: ${result.error.issues.map(i => i.message).join(', ')}`
        };
      }
    }
    ```
  - This validation runs BEFORE the handler dispatch, not inside handlers
  - Handler signatures remain `Record<string, unknown>` — this is pre-handler validation

  **Must NOT do**:
  - Do NOT change `ToolHandler` type or any handler function signatures
  - Do NOT modify RBAC logic or handler dispatch logic
  - Do NOT add validation inside individual handler functions
  - Do NOT change the return type of `executeAgentTool`
  - Do NOT use `.parse()` (throws) — use `.safeParse()` (returns result)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~10 lines of new code at a precise insertion point
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 5 completes)
  - **Blocks**: None
  - **Blocked By**: Task 5 (schemas file must exist to import)

  **References**:

  **Pattern References**:
  - `features/recruitment/services/agent-tools/index.ts:98-155` — `executeAgentTool` function, the full executor
  - `features/recruitment/services/agent-tools/index.ts:109-114` — RBAC check block (validation goes AFTER this)
  - `features/recruitment/services/agent-tools/index.ts:116-120` — try block with handler lookup (validation goes BEFORE this)

  **API/Type References**:
  - `features/recruitment/services/agent-tools/types.ts:ToolHandler` — Confirms handler expects `Record<string, unknown>` for args
  - `features/recruitment/services/agent-tools/schemas.ts:TOOL_ARG_SCHEMAS` — The schemas map from Task 5

  **WHY Each Reference Matters**:
  - `index.ts:109-114` — Exact insertion point: after RBAC check completes, before handler runs
  - `index.ts:116-120` — Must NOT be modified, only prepended to
  - `types.ts` — Confirms we don't need to change handler type contracts

  **Acceptance Criteria**:
  - [ ] `grep -c "TOOL_ARG_SCHEMAS" features/recruitment/services/agent-tools/index.ts` returns >= 1
  - [ ] `grep -c "safeParse" features/recruitment/services/agent-tools/index.ts` returns >= 1
  - [ ] Validation block appears AFTER RBAC check and BEFORE handler dispatch
  - [ ] `bun run build` succeeds
  - [ ] No `any` types introduced

  **QA Scenarios:**

  ```
  Scenario: Validation block is correctly positioned
    Tool: Bash (grep)
    Preconditions: Task 6 changes applied to index.ts
    Steps:
      1. Run: grep -n "TOOL_ARG_SCHEMAS\|safeParse\|rbac\|handlers\[" features/recruitment/services/agent-tools/index.ts
      2. Assert: RBAC check line < safeParse line < handler lookup line
      3. Run: grep -c "import.*TOOL_ARG_SCHEMAS.*from.*schemas" features/recruitment/services/agent-tools/index.ts
      4. Assert: Returns 1 (import exists)
      5. Run: bun run build
      6. Assert: Exit code 0
    Expected Result: Import present, validation positioned between RBAC and dispatch, build passes
    Failure Indicators: Wrong ordering, missing import, build error
    Evidence: .sisyphus/evidence/task-6-validation-position.txt

  Scenario: Invalid args return error (not throw)
    Tool: Bash (grep)
    Preconditions: index.ts modified
    Steps:
      1. Verify safeParse is used (not parse)
      2. Verify error return uses `{ success: false, error: ... }` pattern
      3. Assert: No `throw` in the validation block
    Expected Result: Graceful error return matching executor's existing error pattern
    Failure Indicators: Uses .parse() which throws, or returns different error shape
    Evidence: .sisyphus/evidence/task-6-error-handling.txt
  ```

  **Commit**: YES (includes Task 5)
  - Message: `feat(agent-tools): add Zod validation schemas for all tool arguments`
  - Files: `features/recruitment/services/agent-tools/schemas.ts`, `features/recruitment/services/agent-tools/index.ts`
  - Pre-commit: `bun run build`

---

- [x] 7. Refactor God Function `getStatisticsChatContext` into 7 Helpers

  **What to do**:
  - In `features/recruitment/services/chat.ts`, refactor the `getStatisticsChatContext` function (lines 15-296) into a clean orchestrator that calls 7 extracted helper functions.
  - The orchestrator should:
    1. Run the 4 data-fetching queries (already bounded from Task 2)
    2. Compute shared state: `jobMap`, `allCandidatesRaw`, `filteredCandidates`
    3. Call each of the 7 helpers
    4. Filter out `null` returns and join with `\n\n`
    5. Return the assembled string
  - Orchestrator body MUST be under 40 lines
  - Each helper MUST be under 60 lines
  - **7 helpers to extract** (in order of appearance):

    1. `buildCvSection(cvs, role)` — lines 67-112. Builds the CV pool summary. Takes CV array and role string. Returns `string | null`.
    2. `buildJobsSection(allJobs)` — lines 114-122. Builds jobs summary. Takes the jobs array. Returns `string | null`.
    3. `buildCandidatePipelineSection(filteredCandidates, allCandidatesRaw, jobMap)` — lines 124-189. Builds candidate pipeline breakdown. Takes filtered candidates, all raw candidates, and job map. Returns `string | null`.
    4. `buildInterviewSection(interviews, jobMap)` — lines 191-214. Builds interview schedule and stats. Returns `string | null`.
    5. `buildScreeningSection(screenings, jobMap, filteredCandidates)` — lines 216-234. Builds screening results summary. Returns `string | null`.
    6. `buildSkillGapSection(filteredCandidates, allJobs)` — lines 236-271. Builds skill gap analysis. Returns `string | null`.
    7. `buildSemanticAvailabilitySection()` — lines 273-293. Async helper. Tests pgvector availability with try/catch. Returns `Promise<string | null>`.

  - **Shared state passed as parameters** (NOT module-level):
    - `role` — passed from function parameter
    - `cvs`, `allJobs` — from queries
    - `jobMap` — computed: `new Map(allJobs.map(j => [j.id, j.title]))`
    - `allCandidatesRaw` — from candidates query
    - `filteredCandidates` — filtered by role (manager sees all, recruiter filters by their jobs)
    - `interviews`, `screenings` — from queries

  - **Type definitions**: Use `typeof` on Drizzle query results to infer row types. Do NOT use `any`.
  - **Return type for each helper**: `string | null` (except `buildSemanticAvailabilitySection` which returns `Promise<string | null>`)
  - **Output MUST be identical** to pre-refactor output (zero behavior change)

  **Must NOT do**:
  - Do NOT change the function signature of `getStatisticsChatContext`
  - Do NOT change the `role` parameter type
  - Do NOT add/remove/reorder any sections in the output string
  - Do NOT change any text content within sections
  - Do NOT add module-level state (all state passed as params)
  - Do NOT extract the data-fetching queries into helpers (keep in orchestrator)
  - Do NOT change imports beyond what's needed for type definitions
  - Do NOT add any `any` types — use `typeof` on Drizzle results
  - Do NOT touch any other functions in `chat.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Largest task — 280-line function decomposition with strict behavior preservation. Requires careful extraction of 7 sections with proper parameter threading and type inference from Drizzle queries.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 2 (query limits must be in place before refactoring around them)

  **References**:

  **Pattern References** (critical — read ALL before starting):
  - `features/recruitment/services/chat.ts:15-296` — Full `getStatisticsChatContext` function. Read the ENTIRE thing before any extraction.
  - `features/recruitment/services/chat.ts:67-112` — CV section (helper 1). Note: checks `cvs.length === 0` for early return.
  - `features/recruitment/services/chat.ts:114-122` — Jobs section (helper 2). Simple map + join.
  - `features/recruitment/services/chat.ts:124-189` — Candidate pipeline section (helper 3). Most complex — stage grouping, per-job breakdown, uses `jobMap` and `allCandidatesRaw`.
  - `features/recruitment/services/chat.ts:191-214` — Interview section (helper 4). Groups by status, maps with `jobMap`.
  - `features/recruitment/services/chat.ts:216-234` — Screening section (helper 5). Uses `jobMap` and `filteredCandidates` for candidate-to-job lookup.
  - `features/recruitment/services/chat.ts:236-271` — Skill gap section (helper 6). Aggregates mustHave/niceToHave from jobs, compares against candidate skills.
  - `features/recruitment/services/chat.ts:273-293` — Semantic availability section (helper 7). Async, try/catch around pgvector test query.

  **API/Type References**:
  - `features/recruitment/services/chat.ts:37-49` — The 4 data-fetching queries (already bounded from Task 2). Orchestrator keeps these.
  - `db/schema.ts` — Table types for `cvs`, `jobs`, `candidates`, `interviews`, `screenings`
  - Drizzle ORM — `typeof db.select(...)` pattern for row type inference

  **WHY Each Reference Matters**:
  - `chat.ts:15-296` — Must read entire function to understand data flow between sections
  - Each section reference — Exact extraction boundaries. Off-by-one = broken output.
  - `chat.ts:37-49` — These queries stay in orchestrator, but their result types must be threaded to helpers
  - `db/schema.ts` — For type inference if `typeof` on query results is insufficient

  **Acceptance Criteria**:
  - [ ] `getStatisticsChatContext` body is under 40 lines
  - [ ] 7 helper functions exist: `buildCvSection`, `buildJobsSection`, `buildCandidatePipelineSection`, `buildInterviewSection`, `buildScreeningSection`, `buildSkillGapSection`, `buildSemanticAvailabilitySection`
  - [ ] Each helper is under 60 lines
  - [ ] Each helper returns `string | null` (or `Promise<string | null>` for semantic)
  - [ ] No `any` types in new code
  - [ ] `bun run build` succeeds
  - [ ] Output is identical to pre-refactor (zero behavior change)

  **QA Scenarios:**

  ```
  Scenario: Orchestrator line count under 40
    Tool: Bash (line counting)
    Preconditions: Task 7 refactor applied to chat.ts
    Steps:
      1. Find the `getStatisticsChatContext` function in chat.ts
      2. Count lines from opening `{` to closing `}`
      3. Assert: Count <= 40
    Expected Result: Orchestrator body is 40 lines or fewer
    Failure Indicators: Body exceeds 40 lines, or function not found
    Evidence: .sisyphus/evidence/task-7-orchestrator-linecount.txt

  Scenario: All 7 helpers exist and are under 60 lines each
    Tool: Bash (grep + line counting)
    Preconditions: chat.ts refactored
    Steps:
      1. Run: grep -n "^function build\|^async function build\|^export function build\|^export async function build" features/recruitment/services/chat.ts
      2. Assert: 7 matches (buildCvSection, buildJobsSection, buildCandidatePipelineSection, buildInterviewSection, buildScreeningSection, buildSkillGapSection, buildSemanticAvailabilitySection)
      3. For each helper, count lines from `{` to `}`
      4. Assert: Each <= 60 lines
    Expected Result: 7 helpers, all under 60 lines
    Failure Indicators: Missing helper, helper exceeds 60 lines
    Evidence: .sisyphus/evidence/task-7-helpers-linecount.txt

  Scenario: No `any` types in refactored code
    Tool: Bash (grep)
    Preconditions: chat.ts refactored
    Steps:
      1. Run: grep -n ": any\|as any\|<any>" features/recruitment/services/chat.ts
      2. Assert: Zero matches in new/modified code
    Expected Result: Zero `any` types
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-7-no-any.txt

  Scenario: Build succeeds after refactor
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run: bun run build
      2. Assert: Exit code 0, no TypeScript errors
    Expected Result: Clean build
    Failure Indicators: Type errors, missing exports, import errors
    Evidence: .sisyphus/evidence/task-7-build.txt
  ```

  **Commit**: YES
  - Message: `refactor(chat): extract 7 helpers from getStatisticsChatContext`
  - Files: `features/recruitment/services/chat.ts`
  - Pre-commit: `bun run build`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for patterns). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun run lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify TypeScript strict compliance.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Runtime QA Verification** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Verify: no `await import` in matching.ts, all queries have limits, rate limiter returns 429, all 73 schemas exist, god function under 40 lines. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes. Verify `interviews.ts` dynamic import was NOT touched.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message | Files | Pre-commit Check |
|--------|---------|-------|-----------------|
| 1 | `fix(matching): convert dynamic import to static for cv-matching` | `matching.ts` | `bun run build` |
| 2 | `perf(chat): add query limits and column narrowing to context builder` | `chat.ts` | `bun run build` |
| 3 | `feat(rate-limit): add in-memory sliding window rate limiter` | `lib/rate-limit.ts`, `app/api/chat/statistics/route.ts` | `bun run build` |
| 4 | `feat(agent-tools): add Zod validation schemas for all tool arguments` | `schemas.ts`, `index.ts` | `bun run build` |
| 5 | `refactor(chat): extract 7 helpers from getStatisticsChatContext` | `chat.ts` | `bun run build` |

---

## Success Criteria

### Verification Commands
```bash
bun run build     # Expected: Build succeeds, exit 0
bun run lint      # Expected: No errors
```

### Structural Assertions
```bash
# No dynamic imports in matching.ts
grep -c "await import" features/recruitment/services/agent-tools/matching.ts  # Expected: 0

# All queries bounded
grep -c "\.limit(" features/recruitment/services/chat.ts  # Expected: >= 3

# Rate limiter exists
test -f lib/rate-limit.ts && echo "EXISTS"  # Expected: EXISTS

# Schemas file exists
test -f features/recruitment/services/agent-tools/schemas.ts && echo "EXISTS"  # Expected: EXISTS

# God function line count (body between first { and last })
# Expected: <= 40 lines
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build succeeds
- [ ] Lint passes
- [ ] No `any` types in changed files
- [ ] 73 Zod schemas registered
- [ ] Rate limiter returns 429 after 15 calls in 60s window
- [ ] God function orchestrator <= 40 lines
- [ ] Each helper <= 60 lines
