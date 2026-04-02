# Senario Phase 1 w Phase 2 (Arabizi + FR)

## Version Courte (30-45 sec)
Fi Phase 1, rkizt 3al stabilite, securite, w cost control mta3 l agent AI.
3malt guardrails waz7in: max steps, max tokens, timeout, w fail-fast ki tools yfashlou plusieurs fois.
Zeda na7it context stuffing, w khalit data retrieval on-demand via tools bark.
W zidt tool output compaction bech n9allil token usage.

Fi Phase 2, bnit True RAG pipeline: query rewrite, vector + lexical retrieval, fusion/rerank, chunk citations, caching, w index versioning.
Ba3d 3malt evaluation baseline vs phase2 3la 40 queries b coverage 85%.
Resultat: Precision@5 tla3et men 4.0% l 5.5% (+37.5%), Precision@10 men 2.0% l 5.5% (+175%), MRR@10 men 0.175 l 0.200 (+14.3%), NDCG@10 men 0.042 l 0.071 (+68.5%), error rate 0%.

## Version Detaillee (1.5-2 min)
### 1) Vision generale
El approche mte3i kanet par phases:
- Phase 1 = stabilisation, gouvernance, guardrails.
- Phase 2 = pertinence metrique de la recherche RAG.

### 2) Phase 1 - Chnawa t3amal
- 7atit AI guardrails fi orchestration mta3 chat agent:
  - MAX_AGENT_STEPS = 8
  - MAX_OUTPUT_TOKENS = 2048
  - LLM timeout = 30s
  - MAX_CONSECUTIVE_TOOL_FAILURES = 3
- Na7it context stuffing: l agent ma3adech y3ich 3la contexte static, kol chay yjibou via tools runtime.
- 3malt compaction w sanitization mta3 tool results:
  - n7i fields kbira (rawText, embedding, binaryData...)
  - n9asser long strings
  - nlimit arrays
  => hada na9as cost/tokens w zed stability.
- Sakket access control b scope passing (userId + role) fil matching actions/tools bech ma ysirch cross-scope leakage.

### 3) Phase 2 - Chnawa t3amal
- Bnit retrieval pipeline complet:
  - query rewrite
  - vector retrieval
  - lexical retrieval (FTS)
  - fusion (RRF)
  - rerank
  - context assembly + citations
- Chunking pipeline tfa3al fi upload paths (actions + agent tools).
- Caching mratab b keys fiha scope + indexVersion.
- Index versioning dynamic (mouch hardcoded) bech invalidation tkoun s7i7a.
- Zedt eval harness professional:
  - modes: baseline / phase2 / both
  - strict validation gates
  - artifacts reproducibles: JSON + Markdown timestamped
  - delta metrics automatic.

### 4) Resultats chiffres (phase2 gate)
- Query count: 40
- Ground-truth coverage: 85% (34/40 b expectedCvIds w expectedChunkIds)
- Precision@5: 4.0% -> 5.5% (+37.5%)
- Precision@10: 2.0% -> 5.5% (+175.0%)
- MRR@10: 0.175 -> 0.200 (+14.3%)
- NDCG@10: 0.042 -> 0.071 (+68.5%)
- Error rate: 0.0% -> 0.0%
- Latency: 369ms -> 26463ms (trade-off qualite vs perf)

### 5) Interpretation business
- Phase 1 3tana plateforme stable, securisee, w predictible en production.
- Phase 2 3tana meilleure pertinence fi matching/search, donc decisions recrutement a7sen.
- Trade-off l wa7id: latency tl3et, w hedha backlog performance optimization ba3d stabilisation qualite.

## Contribution Resume (ki y9ollek "exactement chnawa 3malt?")
- Stabilized AI runtime b guardrails anti-runaway.
- Secured data access b scoped retrieval/actions.
- Delivered true chunk-based RAG retrieval pipeline.
- Implemented measurable baseline vs phase2 eval gates.
- Proved uplift b metrics reproductibles w reports auditable.

## Q&A Rapide
### Q1: 3leh latency tl3et barcha?
Khater phase2 walla multi-stage retrieval (rewrite + dual retrieval + fusion + rerank). Rbe7na pertinence b waya7, wl optimization perf hiya l phase jeya.

### Q2: Kifech tdhman ma fama ch hallucination?
Tool-first architecture, anti-fabrication constraints, ID resolution rules, fail-fast 3la tool failures, w no static fabricated context.

### Q3: Chnouwa preuve concrete 3al amelioration?
Comparison baseline vs phase2 3la nafs query set (40), b deltas rasmiya fil gate reports.

### Q4: Chnouwa definition of done eli wsaltelha?
- Eval dataset valid (30-50 range) w coverage mli7a.
- Comparison output complete (baseline vs phase2).
- Reports JSON + MD generes automatiquement.
- Strict checks ypassiw.

## Script Final (memorisation rapide)
"Fi Phase 1, stabilizina l agent AI: guardrails, timeout, token control, w access scope strict.
Ba3d fi Phase 2, bnin True RAG retrieval pipeline b chunking, lexical+vector fusion, citations, caching, w evaluation gates.
3la 40 queries w 85% ground-truth coverage, 7assanna Precision@5 b +37.5%, Precision@10 b +175%, MRR@10 b +14.3%, w NDCG@10 b +68.5%, ma3 error rate 0%.
Donc l impact mte3na: decisions recrutement as7a7, plateforme akther fiabilite, w base solide lel optimisations performance jeyin."