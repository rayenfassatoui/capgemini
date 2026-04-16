/**
 * Retrieval Pipeline Latency Benchmark
 *
 * Measures per-tier latency and verifies that the Phase 3 optimizations are
 * working as expected:
 *   • Simple queries skip LLM rewrite  (rewriteMs ≈ 0)
 *   • Dynamic topK delivers smaller scans for simple / medium tiers
 *   • Parallel retrieval keeps total ≈ max(vector, lexical) + fusion + rerank
 *
 * Run with:
 *   bun run bench:retrieval
 *   bun run bench:retrieval -- --repeats=5 --no-cache
 *   bun run bench:retrieval -- --role=ta --user-id=YOUR_TA_USER_ID
 *
 * Options:
 *   --repeats=N     Measured runs per query  (default: 3)
 *   --warmup=N      Warmup runs before measurement (default: 1)
 *   --no-cache      Disable retrieval cache (cold-path only)
 *   --user-id=ID    Scope user ID           (default: bench-admin)
 *   --role=ROLE     Scope role              (default: admin)
 */

import {
  retrieveChunks,
  type RetrievalResult,
} from "@/features/recruitment/services/retrieval-pipeline";
import type { RetrievalScope } from "@/features/recruitment/services/cv-matching";
import {
  invalidateAllCaches,
  retrievalCache,
} from "@/features/recruitment/services/cache";

// ---------------------------------------------------------------------------
// Benchmark query corpus — one representative query per complexity tier
// ---------------------------------------------------------------------------

interface BenchQuery {
  id: string;
  query: string;
  tier: "simple" | "medium" | "complex";
  /** Expected: should LLM rewrite fire for this query? */
  expectRewrite: boolean;
}

const BENCH_QUERIES: BenchQuery[] = [
  // ── Simple (≤2 words) ───────────────────────────────────────────────────
  { id: "S1", query: "Java", tier: "simple", expectRewrite: false },
  { id: "S2", query: "React developer", tier: "simple", expectRewrite: false },
  { id: "S3", query: "Python", tier: "simple", expectRewrite: false },
  { id: "S4", query: "DevOps engineer", tier: "simple", expectRewrite: false },

  // ── Medium (3–6 words, ≤1 constraint) ───────────────────────────────────
  {
    id: "M1",
    query: "senior software engineer Python",
    tier: "medium",
    expectRewrite: true,
  },
  {
    id: "M2",
    query: "React TypeScript frontend developer",
    tier: "medium",
    expectRewrite: true,
  },
  {
    id: "M3",
    query: "backend developer with API experience",
    tier: "medium",
    expectRewrite: true,
  },
  {
    id: "M4",
    query: "machine learning data science engineer",
    tier: "medium",
    expectRewrite: false,
  },

  // ── Complex (7+ words or ≥2 constraints) ────────────────────────────────
  {
    id: "C1",
    query: "senior Java developer with 5+ years and Spring Boot",
    tier: "complex",
    expectRewrite: true,
  },
  {
    id: "C2",
    query: "fullstack developer who speaks French with 3 years",
    tier: "complex",
    expectRewrite: true,
  },
  {
    id: "C3",
    query: "lead architect microservices AWS Docker Kubernetes senior",
    tier: "complex",
    expectRewrite: true,
  },
  {
    id: "C4",
    query: "data scientist machine learning Python R senior analyst",
    tier: "complex",
    expectRewrite: true,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunMetrics {
  totalMs: number;
  rewriteMs: number;
  vectorMs: number;
  lexicalMs: number;
  fusionMs: number;
  rerankMs: number;
  vectorCount: number;
  lexicalCount: number;
  finalCount: number;
  cacheHit: boolean;
}

interface BenchResult {
  queryId: string;
  query: string;
  tier: BenchQuery["tier"];
  expectRewrite: boolean;
  rewriteTriggered: boolean; // true when rewriteMs > threshold
  latency: { min: number; max: number; avg: number; p50: number; p95: number };
  stages: {
    rewrite: number;
    vector: number;
    lexical: number;
    fusion: number;
    rerank: number;
  };
  quality: { vectorCount: number; lexicalCount: number; finalCount: number };
  cacheHits: number;
  runs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function fmt(n: number): string {
  return `${Math.round(n)}ms`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getVal = (name: string, def: string): string => {
    const kv = args.find((a) => a.startsWith(`--${name}=`));
    if (kv) return kv.split("=")[1];
    const idx = args.indexOf(`--${name}`);
    if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith("--"))
      return args[idx + 1];
    return def;
  };
  return {
    repeats: Math.max(1, parseInt(getVal("repeats", "3"), 10)),
    warmup: Math.max(0, parseInt(getVal("warmup", "1"), 10)),
    noCache: args.includes("--no-cache"),
    userId: getVal("user-id", "bench-admin"),
    role: getVal("role", "admin") as "admin" | "ta",
  };
}

// ---------------------------------------------------------------------------
// Core benchmark runner
// ---------------------------------------------------------------------------

const REWRITE_THRESHOLD_MS = 10; // below this = fast-path / skipped

async function singleRun(
  query: string,
  scope: RetrievalScope,
  enableCache: boolean,
): Promise<RunMetrics> {
  const result: RetrievalResult = await retrieveChunks(query, scope, {
    enableCache,
    enableRewrite: true,
  });
  const m = result.metrics;
  return {
    totalMs: m.totalMs,
    rewriteMs: m.rewriteMs,
    vectorMs: m.vectorMs,
    lexicalMs: m.lexicalMs,
    fusionMs: m.fusionMs,
    rerankMs: m.rerankMs,
    vectorCount: m.vectorCount,
    lexicalCount: m.lexicalCount,
    finalCount: m.finalCount,
    cacheHit: m.cacheHit,
  };
}

async function benchQuery(
  bq: BenchQuery,
  scope: RetrievalScope,
  repeats: number,
  warmup: number,
  enableCache: boolean,
): Promise<BenchResult> {
  // Warmup — results discarded, ensures JIT and connection pool are ready
  for (let i = 0; i < warmup; i++) {
    invalidateAllCaches();
    await singleRun(bq.query, scope, enableCache);
  }

  const totals: RunMetrics[] = [];

  for (let i = 0; i < repeats; i++) {
    if (enableCache) {
      // Keep the embedding cache warm (avoids re-generating vectors each run)
      // but clear the retrieval result cache so we always measure real retrieval.
      retrievalCache.clear();
    } else {
      // --no-cache mode: full cold-path — clear everything including embeddings.
      invalidateAllCaches();
    }
    totals.push(await singleRun(bq.query, scope, enableCache));
  }

  const latencies = totals.map((r) => r.totalMs).sort((a, b) => a - b);
  const avg = (fn: (r: RunMetrics) => number) =>
    totals.reduce((s, r) => s + fn(r), 0) / repeats;

  const rewriteTriggered = avg((r) => r.rewriteMs) > REWRITE_THRESHOLD_MS;
  const last = totals[totals.length - 1];

  return {
    queryId: bq.id,
    query: bq.query,
    tier: bq.tier,
    expectRewrite: bq.expectRewrite,
    rewriteTriggered,
    latency: {
      min: latencies[0],
      max: latencies[latencies.length - 1],
      avg: avg((r) => r.totalMs),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    stages: {
      rewrite: avg((r) => r.rewriteMs),
      vector: avg((r) => r.vectorMs),
      lexical: avg((r) => r.lexicalMs),
      fusion: avg((r) => r.fusionMs),
      rerank: avg((r) => r.rerankMs),
    },
    quality: {
      vectorCount: last.vectorCount,
      lexicalCount: last.lexicalCount,
      finalCount: last.finalCount,
    },
    cacheHits: totals.filter((r) => r.cacheHit).length,
    runs: repeats,
  };
}

// ---------------------------------------------------------------------------
// Report printing
// ---------------------------------------------------------------------------

function printReport(
  results: BenchResult[],
  config: ReturnType<typeof parseArgs>,
): void {
  const TIERS: Array<BenchQuery["tier"]> = ["simple", "medium", "complex"];

  console.log(
    "\n╔═══════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║            RETRIEVAL PIPELINE BENCHMARK REPORT                   ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════════╝\n",
  );
  console.log(
    `Settings  repeats=${config.repeats}  warmup=${config.warmup}  cache=${!config.noCache}  role=${config.role}\n`,
  );

  for (const tier of TIERS) {
    const tier_r = results.filter((r) => r.tier === tier);
    if (tier_r.length === 0) continue;

    const tierAvg = (fn: (r: BenchResult) => number) =>
      tier_r.reduce((s, r) => s + fn(r), 0) / tier_r.length;

    console.log(
      `━━━ ${tier.toUpperCase().padEnd(8)} ` +
        `avg=${fmt(tierAvg((r) => r.latency.avg))}  ` +
        `rewrite=${tier_r.filter((r) => r.rewriteTriggered).length}/${tier_r.length}  ` +
        `avg-final=${tierAvg((r) => r.quality.finalCount).toFixed(1)} chunks`,
    );

    const H = `${"ID".padEnd(4)} ${"Query".padEnd(44)} ${"Total".padStart(7)} ${"Rewrite".padStart(9)} ${"Vector".padStart(7)} ${"Lexical".padStart(8)} ${"Final".padStart(6)}`;
    console.log(H);
    console.log("─".repeat(H.length));

    for (const r of tier_r) {
      const q = r.query.length > 42 ? `${r.query.slice(0, 42)}…` : r.query;
      const rw = r.rewriteTriggered ? `${fmt(r.stages.rewrite)}✓` : "skip    ";
      const ok = r.expectRewrite === r.rewriteTriggered ? "" : " ⚠";
      console.log(
        `${r.queryId.padEnd(4)} ${q.padEnd(44)} ${fmt(r.latency.avg).padStart(7)} ` +
          `${rw.padStart(9)} ${fmt(r.stages.vector).padStart(7)} ${fmt(r.stages.lexical).padStart(8)} ` +
          `${String(r.quality.finalCount).padStart(6)}${ok}`,
      );
    }
    console.log();
  }

  // ── Tier summary ──────────────────────────────────────────────────────────
  console.log(
    "══ TIER SUMMARY ═════════════════════════════════════════════════════",
  );
  const SH = `${"Tier".padEnd(8)} ${"N".padStart(3)} ${"AvgTotal".padStart(10)} ${"AvgRewrite".padStart(11)} ${"AvgVector".padStart(10)} ${"AvgLexical".padStart(11)} ${"AvgFinal".padStart(9)}`;
  console.log(SH);
  console.log("─".repeat(SH.length));

  for (const tier of TIERS) {
    const tier_r = results.filter((r) => r.tier === tier);
    if (tier_r.length === 0) continue;
    const avg = (fn: (r: BenchResult) => number) =>
      tier_r.reduce((s, r) => s + fn(r), 0) / tier_r.length;

    console.log(
      `${tier.padEnd(8)} ${String(tier_r.length).padStart(3)} ` +
        `${fmt(avg((r) => r.latency.avg)).padStart(10)} ` +
        `${fmt(avg((r) => r.stages.rewrite)).padStart(11)} ` +
        `${fmt(avg((r) => r.stages.vector)).padStart(10)} ` +
        `${fmt(avg((r) => r.stages.lexical)).padStart(11)} ` +
        `${avg((r) => r.quality.finalCount)
          .toFixed(1)
          .padStart(9)}`,
    );
  }

  // ── Correctness checks ────────────────────────────────────────────────────
  console.log(
    "\n══ CORRECTNESS CHECKS ═══════════════════════════════════════════════",
  );

  // 1. Simple queries must not trigger rewrite
  const simpleWithRewrite = results.filter(
    (r) => r.tier === "simple" && r.rewriteTriggered,
  );
  if (simpleWithRewrite.length === 0) {
    console.log("✓  Simple queries correctly skip LLM rewrite");
  } else {
    console.log(
      `✗  ${simpleWithRewrite.length} simple quer${simpleWithRewrite.length > 1 ? "ies" : "y"} unexpectedly triggered rewrite:`,
    );
    simpleWithRewrite.forEach((r) =>
      console.log(`     [${r.queryId}] "${r.query}"`),
    );
  }

  // 2. Rewrite expectation mismatches
  const mismatches = results.filter(
    (r) => r.expectRewrite !== r.rewriteTriggered,
  );
  if (mismatches.length === 0) {
    console.log("✓  Rewrite decisions match expectations for all queries");
  } else {
    console.log(`⚠  ${mismatches.length} rewrite decision mismatch(es):`);
    mismatches.forEach((r) =>
      console.log(
        `     [${r.queryId}] expected=${r.expectRewrite} got=${r.rewriteTriggered}  "${r.query}"`,
      ),
    );
  }

  // 3. Dynamic topK: complex should produce more final chunks than simple
  const simpleR = results.filter((r) => r.tier === "simple");
  const complexR = results.filter((r) => r.tier === "complex");
  if (simpleR.length > 0 && complexR.length > 0) {
    const simpleAvgFinal =
      simpleR.reduce((s, r) => s + r.quality.finalCount, 0) / simpleR.length;
    const complexAvgFinal =
      complexR.reduce((s, r) => s + r.quality.finalCount, 0) / complexR.length;
    if (complexAvgFinal >= simpleAvgFinal) {
      console.log(
        `✓  Dynamic topK: complex avg final (${complexAvgFinal.toFixed(1)}) ≥ simple (${simpleAvgFinal.toFixed(1)})`,
      );
    } else {
      console.log(
        `⚠  Dynamic topK: complex avg final (${complexAvgFinal.toFixed(1)}) < simple (${simpleAvgFinal.toFixed(1)}) — ` +
          "may indicate all CV pools are too small to show the difference",
      );
    }
  }

  // 4. Parallelism sanity: vector + lexical avg should exceed total avg (they overlap)
  const allResults = results.filter(
    (r) => !r.latency.avg.toString().includes("NaN"),
  );
  const parallelismViolations = allResults.filter(
    (r) => r.stages.vector + r.stages.lexical < r.latency.avg * 0.5,
  );
  if (parallelismViolations.length === 0) {
    console.log("✓  Parallel retrieval timing looks consistent");
  } else {
    console.log(
      `⚠  ${parallelismViolations.length} queries have unexpectedly low combined v+l time (parallel check)`,
    );
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = parseArgs();

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         RETRIEVAL PIPELINE LATENCY BENCHMARK               ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n",
  );
  console.log(`Repeats per query : ${config.repeats}`);
  console.log(`Warmup runs       : ${config.warmup}`);
  console.log(
    `Cache             : ${config.noCache ? "disabled (cold-path)" : "enabled"}`,
  );
  console.log(`Scope             : user=${config.userId}  role=${config.role}`);
  console.log(
    `Query corpus      : ${BENCH_QUERIES.length} queries ` +
      `(${BENCH_QUERIES.filter((q) => q.tier === "simple").length} simple / ` +
      `${BENCH_QUERIES.filter((q) => q.tier === "medium").length} medium / ` +
      `${BENCH_QUERIES.filter((q) => q.tier === "complex").length} complex)\n`,
  );

  const scope: RetrievalScope = { userId: config.userId, role: config.role };
  const results: BenchResult[] = [];

  for (const bq of BENCH_QUERIES) {
    const label = `  [${bq.id}] ${bq.tier.padEnd(8)} "${bq.query.slice(0, 38)}"`;
    process.stdout.write(`${label.padEnd(60)}...`);
    try {
      const r = await benchQuery(
        bq,
        scope,
        config.repeats,
        config.warmup,
        !config.noCache,
      );
      results.push(r);
      process.stdout.write(` ${fmt(r.latency.avg)}\n`);
    } catch (err) {
      process.stdout.write(` ERROR: ${(err as Error).message}\n`);
    }
  }

  printReport(results, config);
  process.exit(0);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
