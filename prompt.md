You are a senior AI engineer and senior software architect.
Implement Phase 1 hardening for the AI chat system with minimal, safe, production-ready changes.

Project context:

Next.js App Router, TypeScript strict mode, Feature-Driven Architecture
Agentic chat with tool calling
CV retrieval uses keyword matching, semantic search, and hybrid search
Requirement: reduce token cost and improve retrieval correctness without breaking existing UI behavior
Primary Phase 1 goals:

Remove context stuffing and move to true on-demand retrieval
Enforce consistent data scope in retrieval paths
Reduce tool payload size injected back to the model
Add practical AI cost and runtime guardrails
Hard constraints:
Use Bun only for commands
Preserve existing API contracts and frontend compatibility
Keep RBAC and security checks intact
Do not introduce breaking changes
Keep diffs minimal and focused on Phase 1
Implementation tasks:

Task A: Remove context stuffing

Remove large preloaded data snapshot from system prompt construction.
Keep system prompt compact and static:
Role and safety rules
Tool-usage rules
Minimal session metadata only
Ensure business data is fetched only through tools at runtime.
Keep conversation history window bounded and deterministic.
Task B: Enforce retrieval scope consistency

Apply the same access scope across all CV retrieval methods:
CV list
Keyword matching
Semantic search
Hybrid search
For non-admin users, retrieval must be restricted to their own CV scope.
For admin users, global scope is allowed.
Ensure hybrid search combines only scoped datasets.
Task C: Compact tool outputs before re-injecting to model

Add a compaction layer for tool results before appending them to tool messages.
Strip non-essential fields and large blobs.
Limit arrays returned to the model to practical caps.
Truncate oversized strings in model-facing tool payloads.
For large datasets, return summary plus top items instead of full dumps.
Task D: Add AI consumption and runtime guardrails

Reduce max agent steps to a safer default.
Add max output token limit in model requests.
Add per-request timeout protection for model calls.
Add fail-fast behavior for repeated tool failures in one turn.
Keep temperature conservative for deterministic behavior.
Task E: Preserve compatibility

Keep current streaming contract used by frontend.
Keep existing tool event semantics and message flow.
Do not break chat persistence and conversation behavior.
Validation and verification:

Run:
bun run lint
bun run build
Manual checks:
Chat still streams responses correctly
Tool calls still execute and display in UI
Semantic and hybrid retrieval respect user scope
No large DB snapshot is injected into prompt
Response quality remains acceptable for common queries
Success criteria:

No large context stuffing in the system prompt path
Retrieval scope is consistent and secure
Tool payloads to model are compact
AI loop has bounded cost and runtime
Build and lint pass with no regressions
Deliverables format:

Summary of Phase 1 changes
File-by-file change explanation
Validation results
Remaining risks and suggested Phase 2 follow-up
End of prompt.