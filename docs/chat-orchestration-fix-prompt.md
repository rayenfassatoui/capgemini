# Prompt: Fix Chat Orchestration Bugs (Timeout + Intent Routing + Fallback + Name Normalization)

Use this prompt with your coding agent.

You are a senior full-stack engineer working on a Next.js 16 + TypeScript + Bun project.
Your mission is to fix chat orchestration bugs in the recruitment assistant.

## Context
The current chat flow has these failures:
- Timeout failures for comparison requests and then repeated generic timeout messages.
- Wrong tool usage for simple messages (example: "hello" triggers list/search tools).
- Weak intent routing for candidate comparison requests.
- Name matching is too strict (Ashref vs Achref vs Achraf).
- No graceful fallback when LLM is slow or times out.

Main backend entrypoint to inspect first:
- app/api/chat/statistics/route.ts

Also inspect:
- features/recruitment/services/agent-tools/index.ts
- features/recruitment/services/agent-tools/cv-pool.ts
- features/recruitment/services/agent-tools/matching.ts
- features/recruitment/services/agent-tools/ai-features.ts
- features/recruitment/components/statistics-chat.tsx

## Goal
Implement robust orchestration so the assistant stays useful even when LLM latency is high.

## Required Fixes

1) Timeout handling
- Keep request timeout protection, but improve behavior after timeout.
- If tool results already exist, generate a deterministic summary response from available tool data instead of returning only a generic timeout message.
- Add one retry policy for transient LLM timeout in non-mutating flows.
- Avoid infinite retries.

2) Intent routing
- Add lightweight intent classification before tool loop.
- For greeting/small talk (hello, hi, salam, etc.), return direct friendly response without tools.
- For candidate comparison intents (for example: "who is better X or Y"), route to compare flow directly.
- For search intents, use semantic/rag search only when needed.

3) Fallback strategy
- If compare flow cannot complete via LLM, produce rule-based fallback ranking from available CV fields:
  - years of experience (weight high)
  - skill match to requested role
  - recency and relevance of roles
  - education/certifications (weight medium)
- Return transparent explanation of why one candidate is ranked higher.
- Clearly label fallback mode in response.

4) Name normalization and matching
- Implement normalization for Arabic/French/Latin variations and common typos:
  - ashref, achref, achraf, ashraf
- Use case-insensitive, accent-insensitive matching.
- Add fuzzy matching with threshold and top candidates suggestion when exact match fails.
- Never silently return "not found" if close matches exist.

5) Tool-call efficiency
- Prevent duplicate tool calls for the same intent + same arguments in one turn.
- Add in-turn deduplication cache key (toolName + stable args hash).
- Keep existing role and permission checks intact.

## Non-Functional Constraints
- Bun only.
- Keep architecture boundaries intact (no business logic in app router beyond orchestration).
- No breaking changes to frontend event format used by statistics-chat.tsx.
- TypeScript strict safety, no any.

## Success Criteria
- Greeting message does not call business tools.
- "Ashref" query finds "Achref" candidate when relevant.
- "Who is better Achref or Rayen" returns stable comparison result without timeout-only failure.
- If LLM times out, user still receives useful response from fallback.
- Duplicate tool calls are reduced in one turn.

## Validation Steps
Run:
- bun run lint
- bun run build
- bun run test

Manual checks:
1. Send "hello" -> no tool events.
2. Send "i want a senior full stack developer and name is ashref" -> Achref appears in candidates or close matches.
3. Send "chkoun khir ashref wela rayen 7aseb el resume" -> comparison output with clear rationale.
4. Simulate slow LLM path -> fallback summary still returned.

## Deliverables
- File-by-file change summary.
- Why each change fixes a specific bug.
- Remaining risks and next hardening steps.
