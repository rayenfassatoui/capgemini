You are a senior AI engineer and software architect.
Complete ONLY the final remaining Phase 2 True RAG gaps.

Current status (already done):
- RAG tool mapping and runtime guidance are updated.
- Both upload paths trigger chunk generation.
- Embedding cache keys include scope and index version.
- Dynamic index versioning is wired in indexing and retrieval.
- Build and tests are passing.
- eval:rag command exists.

Do not refactor completed areas. Focus only on unresolved evaluation/compliance gaps.

Final gaps to implement:

1. Ground-truth coverage must be real, not template-only
- Reduce evaluation dataset to 30-50 queries (target 40).
- For every query, populate real expectedCvIds.
- For most queries, populate expectedChunkIds as well.
- Remove placeholder-only ground-truth examples as the primary mechanism.
- Add a coverage metric in report: percentage of queries with CV IDs and chunk IDs.

2. Baseline vs Phase 2 comparison must be explicit
- Add baseline retrieval mode (legacy retrieval path) inside evaluation harness.
- Support modes: baseline, phase2, and both.
- When mode=both, run both on the same query set and output metric deltas:
  - precision@5, precision@10, MRR@10, NDCG@10, error rate, latency.
- Report uplift/regression per metric with clear percentages.

3. Failure taxonomy must be grounded in IDs when available
- Use expectedCvIds/expectedChunkIds as the primary relevance source.
- Keep pattern matching only as fallback when IDs are missing.
- Make missed_relevance and scope_violation detection deterministic when ID ground truth exists.

4. Evaluation outputs must be reproducible artifacts
- Save JSON report(s) to reports/rag-eval/ with timestamped filenames.
- Save a compact Markdown summary next to JSON.
- Include run config (mode, role, query count, ground-truth coverage).

5. Strict validation mode
- Add a strict mode flag that fails the command when:
  - query count is outside 30-50,
  - ground-truth coverage is below threshold,
  - required comparison output is missing in mode=both.

Implementation constraints:
1. Use Bun only.
2. No breaking API changes unless required and documented.
3. Preserve role-based scope and existing frontend contract.
4. Keep changes modular, typed, and validated.
5. No new dependencies without explicit approval.

Validation steps:
1. bun run lint
2. bun run build
3. bun run test
4. bun run eval:rag -- --mode both --strict --output reports/rag-eval/latest.json

Definition of done:
1. Evaluation dataset is 30-50 queries with real ground-truth IDs.
2. Baseline vs Phase 2 comparison is produced in one command.
3. Report includes complete metrics, taxonomy, and deltas.
4. Strict mode enforces quality gates and fails correctly when unmet.
5. Lint, build, tests, and eval command all pass in expected conditions.

Required deliverables:
1. Architecture delta summary for evaluation subsystem only.
2. File-by-file edit summary.
3. Exact run commands for normal and strict evaluation.
4. Example output paths for JSON and Markdown reports.
5. Residual risks and recommended Phase 3 follow-ups.

