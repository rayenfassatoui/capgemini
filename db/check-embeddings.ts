/**
 * Embedding Coverage Diagnostic
 *
 * Checks whether chunk embeddings were stored correctly after reindexing,
 * and runs a live vector search smoke-test to confirm the full pipeline works.
 *
 * Run with:
 *   bun run db/check-embeddings.ts
 *
 * Options:
 *   --probe=<query>   Override the smoke-test query  (default: "software engineer")
 *   --threshold=<n>   Cosine distance cutoff for probe (default: 0.7)
 *   --verbose         Print first chunk text for each CV
 */

import { db } from "@/lib/db";
import { cvChunks, cvPool } from "@/db/schema";
import { eq, isNull, count, sql, asc } from "drizzle-orm";
import { generateTextEmbedding } from "@/features/recruitment/services/embeddings";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string, def: string) => {
    const kv = args.find((a) => a.startsWith(`--${name}=`));
    return kv ? kv.split("=").slice(1).join("=") : def;
  };
  return {
    probeQuery: get("probe", "software engineer"),
    threshold: parseFloat(get("threshold", "0.7")),
    verbose: args.includes("--verbose"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bar(filled: number, total: number, width = 30): string {
  if (total === 0) return "[" + "─".repeat(width) + "]";
  const n = Math.round((filled / total) * width);
  return "[" + "█".repeat(n) + "░".repeat(width - n) + "]";
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// 1. Extension check
// ---------------------------------------------------------------------------

async function checkPgvector(): Promise<boolean> {
  try {
    const result = await db.execute<{ extname: string }>(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 2. Aggregate coverage
// ---------------------------------------------------------------------------

interface AggRow {
  total: number;
  withEmbedding: number;
  withSearchVector: number;
  latestVersion: number;
}

async function getAggregateCoverage(): Promise<AggRow> {
  const [row] = await db
    .select({
      total: count(),
      withEmbedding: sql<number>`COUNT(CASE WHEN ${cvChunks.embedding} IS NOT NULL THEN 1 END)`,
      withSearchVector: sql<number>`COUNT(CASE WHEN ${cvChunks.searchVector} IS NOT NULL THEN 1 END)`,
      latestVersion: sql<number>`COALESCE(MAX(${cvChunks.indexVersion}), 0)`,
    })
    .from(cvChunks);

  return {
    total: Number(row.total),
    withEmbedding: Number(row.withEmbedding),
    withSearchVector: Number(row.withSearchVector),
    latestVersion: Number(row.latestVersion),
  };
}

// ---------------------------------------------------------------------------
// 3. Per-CV breakdown
// ---------------------------------------------------------------------------

interface CvRow {
  cvId: string;
  candidateName: string | null;
  totalChunks: number;
  withEmbedding: number;
  indexVersion: number;
  firstChunk: string | null;
}

async function getPerCvBreakdown(): Promise<CvRow[]> {
  const rows = await db
    .select({
      cvId: cvChunks.cvId,
      candidateName: cvPool.extractedName,
      totalChunks: count(),
      withEmbedding: sql<number>`COUNT(CASE WHEN ${cvChunks.embedding} IS NOT NULL THEN 1 END)`,
      indexVersion: sql<number>`MAX(${cvChunks.indexVersion})`,
      firstChunk: sql<string>`MIN(${cvChunks.chunkText})`,
    })
    .from(cvChunks)
    .leftJoin(cvPool, eq(cvChunks.cvId, cvPool.id))
    .groupBy(cvChunks.cvId, cvPool.extractedName)
    .orderBy(asc(cvPool.extractedName));

  return rows.map((r) => ({
    cvId: r.cvId,
    candidateName: r.candidateName,
    totalChunks: Number(r.totalChunks),
    withEmbedding: Number(r.withEmbedding),
    indexVersion: Number(r.indexVersion),
    firstChunk: r.firstChunk,
  }));
}

// ---------------------------------------------------------------------------
// 4. Per-version breakdown
// ---------------------------------------------------------------------------

interface VersionRow {
  version: number;
  chunks: number;
  withEmbedding: number;
}

async function getVersionBreakdown(): Promise<VersionRow[]> {
  const rows = await db
    .select({
      version: cvChunks.indexVersion,
      chunks: count(),
      withEmbedding: sql<number>`COUNT(CASE WHEN ${cvChunks.embedding} IS NOT NULL THEN 1 END)`,
    })
    .from(cvChunks)
    .groupBy(cvChunks.indexVersion)
    .orderBy(asc(cvChunks.indexVersion));

  return rows.map((r) => ({
    version: Number(r.version),
    chunks: Number(r.chunks),
    withEmbedding: Number(r.withEmbedding),
  }));
}

// ---------------------------------------------------------------------------
// 5. Vector search smoke-test
// ---------------------------------------------------------------------------

interface ProbeResult {
  embeddingGeneratedMs: number;
  queryMs: number;
  hits: number;
  topDistance: number | null;
  topCandidate: string | null;
  topSection: string | null;
  topSnippet: string | null;
  queryEmbeddingOk: boolean;
}

async function runVectorProbe(
  query: string,
  threshold: number,
): Promise<ProbeResult> {
  // Generate query embedding
  const t0 = Date.now();
  const embedding = await generateTextEmbedding(query, "query");
  const embeddingGeneratedMs = Date.now() - t0;

  if (!embedding) {
    return {
      embeddingGeneratedMs,
      queryMs: 0,
      hits: 0,
      topDistance: null,
      topCandidate: null,
      topSection: null,
      topSnippet: null,
      queryEmbeddingOk: false,
    };
  }

  const embStr = JSON.stringify(embedding);
  const t1 = Date.now();

  const rows = await db.execute<{
    candidate_name: string | null;
    section_type: string;
    chunk_text: string;
    distance: number;
  }>(sql`
    SELECT
      cv.extracted_name   AS candidate_name,
      c.section_type,
      c.chunk_text,
      (c.embedding <=> ${embStr}::vector) AS distance
    FROM cv_chunks c
    LEFT JOIN cv_pool cv ON c.cv_id = cv.id
    WHERE c.embedding IS NOT NULL
      AND (c.embedding <=> ${embStr}::vector) < ${threshold}
    ORDER BY distance ASC
    LIMIT 5
  `);

  const queryMs = Date.now() - t1;
  const top = rows.rows[0] ?? null;

  return {
    embeddingGeneratedMs,
    queryMs,
    hits: rows.rows.length,
    topDistance: top ? Number(top.distance) : null,
    topCandidate: top?.candidate_name ?? null,
    topSection: top?.section_type ?? null,
    topSnippet: top ? top.chunk_text.slice(0, 120) : null,
    queryEmbeddingOk: true,
  };
}

// ---------------------------------------------------------------------------
// 6. Null-embedding sample (for debugging)
// ---------------------------------------------------------------------------

async function getNullEmbeddingSample(): Promise<string[]> {
  const rows = await db
    .select({ cvId: cvChunks.cvId, sectionType: cvChunks.sectionType })
    .from(cvChunks)
    .where(isNull(cvChunks.embedding))
    .limit(5);
  return rows.map((r) => `${r.cvId.slice(0, 8)}… [${r.sectionType}]`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cfg = parseArgs();

  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║            EMBEDDING COVERAGE DIAGNOSTIC                     ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  // ── 1. pgvector extension ────────────────────────────────────────────────
  process.stdout.write("Checking pgvector extension... ");
  const pgvectorOk = await checkPgvector();
  console.log(
    pgvectorOk
      ? "✓ installed"
      : "✗ NOT FOUND — run the enable-pgvector.sql script",
  );

  // ── 2. Aggregate coverage ─────────────────────────────────────────────────
  console.log(
    "\n── Aggregate Coverage ──────────────────────────────────────────",
  );
  const agg = await getAggregateCoverage();
  const embPct = pct(agg.withEmbedding, agg.total);
  const ftsPct = pct(agg.withSearchVector, agg.total);

  console.log(`Total chunks      : ${agg.total}`);
  console.log(
    `With embeddings   : ${agg.withEmbedding}  ${bar(agg.withEmbedding, agg.total)}  ${embPct}`,
  );
  console.log(
    `With searchVector : ${agg.withSearchVector}  ${bar(agg.withSearchVector, agg.total)}  ${ftsPct}`,
  );
  console.log(`Latest index ver  : v${agg.latestVersion}`);

  const embeddingStatus =
    agg.total === 0
      ? "⚠ No chunks in database — run: bun run db:reindex-chunks"
      : agg.withEmbedding === 0
        ? "✗ ZERO embeddings stored — vector search will always return 0 results"
        : agg.withEmbedding < agg.total
          ? `⚠ Partial coverage — ${agg.total - agg.withEmbedding} chunks have no embedding`
          : "✓ All chunks have embeddings";

  const ftsStatus =
    agg.withSearchVector === 0
      ? "✗ No search vectors — lexical search will fail"
      : agg.withSearchVector < agg.total
        ? `⚠ Partial FTS coverage — ${agg.total - agg.withSearchVector} chunks missing`
        : "✓ All chunks have search vectors";

  console.log(`\nEmbedding status  : ${embeddingStatus}`);
  console.log(`FTS status        : ${ftsStatus}`);

  // ── 3. Per-version breakdown ──────────────────────────────────────────────
  console.log(
    "\n── By Index Version ────────────────────────────────────────────",
  );
  const versions = await getVersionBreakdown();
  if (versions.length === 0) {
    console.log("  (no chunks)");
  } else {
    for (const v of versions) {
      const mark =
        v.withEmbedding === v.chunks ? "✓" : v.withEmbedding === 0 ? "✗" : "⚠";
      console.log(
        `  v${String(v.version).padEnd(4)} ${mark}  ${String(v.withEmbedding).padStart(4)}/${v.chunks} chunks have embeddings`,
      );
    }
  }

  // ── 4. Per-CV breakdown ───────────────────────────────────────────────────
  console.log(
    "\n── Per-CV Breakdown ────────────────────────────────────────────",
  );
  const cvRows = await getPerCvBreakdown();
  if (cvRows.length === 0) {
    console.log("  (no CVs)");
  } else {
    const nameW = Math.min(
      28,
      Math.max(...cvRows.map((r) => (r.candidateName ?? "Unknown").length)),
    );
    for (const cv of cvRows) {
      const name = (cv.candidateName ?? "Unknown")
        .slice(0, nameW)
        .padEnd(nameW);
      const ok =
        cv.withEmbedding === cv.totalChunks
          ? "✓"
          : cv.withEmbedding === 0
            ? "✗"
            : "⚠";
      console.log(
        `  ${ok} ${name}  ${String(cv.withEmbedding).padStart(3)}/${cv.totalChunks} chunks  v${cv.indexVersion}`,
      );
      if (cfg.verbose && cv.firstChunk) {
        console.log(`      "${cv.firstChunk.slice(0, 90)}…"`);
      }
    }
  }

  // ── 5. Null sample ────────────────────────────────────────────────────────
  if (agg.withEmbedding < agg.total) {
    const sample = await getNullEmbeddingSample();
    console.log(
      "\n── Sample Chunks Missing Embeddings ────────────────────────────",
    );
    sample.forEach((s) => console.log(`  • ${s}`));
  }

  // ── 6. Vector search smoke-test ───────────────────────────────────────────
  console.log(
    "\n── Vector Search Smoke-Test ────────────────────────────────────",
  );
  console.log(`  Query     : "${cfg.probeQuery}"`);
  console.log(
    `  Threshold : distance < ${cfg.threshold}  (cosine similarity > ${(1 - cfg.threshold).toFixed(2)})`,
  );

  if (!pgvectorOk) {
    console.log("  ✗ Skipped — pgvector extension not installed");
  } else if (agg.withEmbedding === 0) {
    console.log("  ✗ Skipped — no embeddings to search");
  } else {
    const probe = await runVectorProbe(cfg.probeQuery, cfg.threshold);

    if (!probe.queryEmbeddingOk) {
      console.log("  ✗ Query embedding generation FAILED");
      console.log(
        "    Check: NVIDIA_API_KEY is set and https://integrate.api.nvidia.com is reachable",
      );
    } else {
      console.log(
        `  Query embedding : generated in ${probe.embeddingGeneratedMs}ms ✓`,
      );
      console.log(`  SQL query time  : ${probe.queryMs}ms`);
      console.log(`  Hits (top 5)    : ${probe.hits}`);

      if (probe.hits > 0) {
        console.log(
          `  Top result      : "${probe.topCandidate ?? "Unknown"}" [${probe.topSection}]  distance=${probe.topDistance?.toFixed(4)}`,
        );
        console.log(`  Top snippet     : "${probe.topSnippet}…"`);
        console.log("\n  ✓ Vector search is working correctly");
      } else {
        console.log("\n  ✗ No hits returned");
        console.log(`    Possible causes:`);
        console.log(
          `    1. Threshold too strict: try --threshold=0.9 to widen the search`,
        );
        console.log(
          `    2. Query embeddings use a different model than chunk embeddings`,
        );
        console.log(
          `    3. Embeddings stored but all NULL (check table directly with db:studio)`,
        );
        console.log(
          `\n    Quick SQL to check: SELECT count(*), count(embedding) FROM cv_chunks;`,
        );
      }
    }
  }

  // ── 7. Recommendations ───────────────────────────────────────────────────
  console.log(
    "\n── Recommendations ─────────────────────────────────────────────",
  );

  const issues: string[] = [];

  if (!pgvectorOk) {
    issues.push(
      'Enable pgvector:   psql -c "CREATE EXTENSION IF NOT EXISTS vector;"  (then bun run db:push)',
    );
  }
  if (agg.total === 0) {
    issues.push("No chunks found:   bun run db:reindex-chunks");
  } else if (agg.withEmbedding === 0) {
    issues.push(
      "No embeddings:     Verify NVIDIA_API_KEY is set, then bun run db:reindex-chunks --clear",
    );
  } else if (agg.withEmbedding < agg.total) {
    issues.push(
      `Partial coverage:  bun run db:reindex-chunks  (will fill gaps)`,
    );
  }
  if (agg.withSearchVector < agg.total && agg.total > 0) {
    issues.push(
      "Missing FTS vecs:  bun run db:reindex-chunks  (regenerates search_vector too)",
    );
  }

  if (issues.length === 0) {
    console.log(
      "  ✓ Everything looks healthy — run bun run eval:rag to measure quality",
    );
  } else {
    issues.forEach((i) => console.log(`  → ${i}`));
  }

  console.log();
  process.exit(0);
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
