You are a senior AI engineer and senior software architect.
Implement Phase 2 True RAG in 1-2 weeks with production-grade quality and measurable retrieval improvement.

Context:
- Current system already has agentic chat and basic semantic retrieval.
- Goal is to move from one vector per CV to chunked RAG with a full retrieval pipeline.
- Keep behavior stable for existing users while improving relevance, grounding, and efficiency.

Primary Phase 2 goals:
1. Move from one embedding per CV to chunked indexing by section: experience, skills, education, summary.
2. Implement retrieval pipeline: query rewrite -> vector topK -> lexical topK -> RRF fusion -> rerank -> top chunks.
3. Add caching: frequent query embedding cache plus short retrieval cache.
4. Add offline evaluation: 30-50 real HR queries with precision and error metrics.

Non-negotiable constraints:
1. Use Bun only for all commands.
2. No breaking API changes unless explicitly required and documented.
3. Preserve role-based data scope and security.
4. Keep prompt injection and hallucination risk low.
5. Keep changes modular and testable.
6. If a new dependency is needed, propose it first and wait for approval.

Implementation work packages:

Package 1: Chunked indexing design
1. Create chunk model with fields: chunkId, cvId, sectionType, sectionOrder, chunkText, tokenEstimate, embedding, lexicalIndex, metadata, createdAt, updatedAt.
2. Chunking strategy:
- Experience: split by role or company blocks.
- Skills: grouped normalized lists.
- Education: one chunk per degree block.
- Summary: separate chunk.
3. Chunk size target: 200-350 tokens, with overlap only for long experience text.
4. Re-index policy: trigger re-index on CV upload or extraction update.
5. Add index versioning for safe cache invalidation.

Package 2: Query rewrite layer
1. Add rewrite step producing:
- normalized semantic query
- lexical keyword query
- optional filters (seniority, language, experience)
2. Keep rewrite deterministic and bounded.
3. Return strict structured output with validation.

Package 3: Hybrid retrieval pipeline
1. Vector retrieval: topK vector candidates from chunk embeddings with scoped filtering.
2. Lexical retrieval: topK lexical candidates from chunk text search.
3. Fusion: Reciprocal Rank Fusion with configurable constant.
4. Rerank: rerank fused candidates and keep top chunks.
5. Final context assembly: return compact cited chunks only, never full CV payloads.

Package 4: Scope and security
1. Enforce same scope rules everywhere: admin global, non-admin restricted.
2. Apply scope at all stages: vector, lexical, fusion, rerank, final return.
3. Add tests for cross-user leakage prevention.

Package 5: Caching
1. Embedding cache key: normalizedQuery + model + scope + indexVersion.
2. Retrieval cache key: normalizedQuery + filters + scope + indexVersion.
3. TTL policy: embedding cache longer, retrieval cache short.
4. Invalidate cache on re-index events.
5. Add cache metrics: hit rate, miss reason, stale invalidation count.

Package 6: Offline evaluation harness
1. Build evaluation dataset with 30-50 real HR queries.
2. For each query, store expected relevant CV IDs and chunk IDs.
3. Evaluate baseline versus Phase 2 using:
- precision@5
- precision@10
- MRR@10
- NDCG@10
- error rate
4. Add failure taxonomy: missed relevance, wrong ranking, scope violation, hallucinated grounding.
5. Produce comparison report with measurable uplift.

Package 7: Observability and quality gates
1. Log stage latency: rewrite, vector, lexical, fusion, rerank.
2. Track retrieval counters: empty results, low-confidence results, scope-filter drop rate.
3. Add guardrails: max chunks, max context size, max latency fallback behavior.

Package 8: Integration and compatibility
1. Wire new retrieval into existing chat and matching entrypoints.
2. Keep frontend contract stable.
3. Keep response payload compact and citation-friendly.
4. Preserve existing role behavior and tool flow.

Validation and commands:
1. bun run lint
2. bun run build
3. bun run test
4. Run offline evaluation script and produce baseline versus Phase 2 report.

Acceptance criteria:
1. Chunked index replaces single-vector CV retrieval in active path.
2. Full pipeline implemented: rewrite, vector, lexical, RRF, rerank, top chunks.
3. Scope is consistently enforced across all retrieval stages.
4. Embedding and retrieval caches are active with measurable hit rates.
5. Offline evaluation report exists with 30-50 queries and quality metrics.
6. No build regressions and no new critical lint or test failures.

Required deliverables:
1. Summary of architectural changes.
2. File-by-file implementation summary.
3. Migration or re-index instructions.
4. Validation results from lint, build, tests, and evaluation report.
5. Residual risks and recommended Phase 3 improvements.

