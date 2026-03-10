# Decisions — ai-system-hardening

## [2026-03-10] Planning Phase

### Tool Count: 73 (not 57)
Exhaustive manual count across all 10 executor modules. The initial 57 estimate was wrong.

### Zod Schema Mode: .passthrough()
`.strict()` would reject `_attachment` field injected by the system for upload_cv. All schemas use `.passthrough()`.

### Validation Style: .safeParse() not .parse()
`.parse()` throws on failure. The executor's error pattern returns `{ success: false, error: string }`. Must use `.safeParse()` to match existing pattern.

### DB Limits per spec
- candidates: .limit(300)
- interviews: .limit(150) on both branches
- screenings: .orderBy(desc(screenings.createdAt)).limit(300)
- jobs: explicit column select (no .limit() — column narrowing is the "limit" here)

### God Function: 7 helpers exactly
User spec says 7. Metis suggested 10. User spec wins. Helper list:
1. buildCvSection
2. buildJobsSection
3. buildCandidatePipelineSection
4. buildInterviewSection
5. buildScreeningSection
6. buildSkillGapSection
7. buildSemanticAvailabilitySection (async, try/catch for pgvector)
