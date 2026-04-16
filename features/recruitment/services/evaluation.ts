// ---------------------------------------------------------------------------
// Offline Evaluation - Phase 2 RAG
// Evaluation dataset, metrics, runner with baseline comparison
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import { cvPool, cvChunks } from '@/db/schema';
import { count, inArray, sql as drizzleSql } from 'drizzle-orm';
import { retrieveChunks } from './retrieval-pipeline';
import { searchCvsSemantically } from './cv-matching';
import type { RetrievalScope } from './cv-matching';

// ---------------------------------------------------------------------------
// Evaluation Dataset (40 queries with ground-truth support)
// ---------------------------------------------------------------------------

export interface EvalQuery {
  id: string;
  query: string;
  description: string;
  expectedPatterns: string[];
  expectedCvIds?: string[];      // Ground truth CV IDs
  expectedChunkIds?: string[];   // Ground truth chunk IDs
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'skills' | 'experience' | 'education' | 'mixed' | 'seniority' | 'language' | 'certification';
}

// Failure taxonomy for detailed error analysis
export type FailureType = 
  | 'missed_relevance'      // Relevant doc not in results
  | 'wrong_ranking'         // Relevant doc ranked too low
  | 'scope_violation'       // Result from wrong scope returned
  | 'hallucinated_grounding' // Chunk doesn't support the match claim
  | 'empty_result'          // No results returned
  | 'latency_timeout';      // Query took too long

export interface FailureInstance {
  queryId: string;
  type: FailureType;
  details: string;
}

// Core evaluation dataset: 40 queries across categories
// Ground truth IDs are populated dynamically via discoverGroundTruth()
export const EVAL_QUERIES: EvalQuery[] = [
  // Skills queries (15)
  { id: 'skill-1', query: 'Find Java developers', description: 'Basic skill', expectedPatterns: ['java'], difficulty: 'easy', category: 'skills' },
  { id: 'skill-2', query: 'React and TypeScript frontend engineers', description: 'Multi-skill', expectedPatterns: ['react', 'typescript'], difficulty: 'easy', category: 'skills' },
  { id: 'skill-3', query: 'Python machine learning engineers', description: 'Python ML', expectedPatterns: ['python', 'machine learning', 'ml'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-4', query: 'DevOps engineers with Kubernetes', description: 'DevOps K8s', expectedPatterns: ['devops', 'kubernetes', 'k8s'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-5', query: 'Full stack developers Node.js', description: 'Full stack', expectedPatterns: ['node', 'full stack', 'fullstack'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-6', query: 'Cloud architects AWS', description: 'Cloud infra', expectedPatterns: ['aws', 'cloud', 'architect'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-7', query: 'Mobile developers React Native', description: 'Mobile', expectedPatterns: ['react native', 'mobile'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-8', query: 'Data engineers Spark', description: 'Big data', expectedPatterns: ['spark', 'data engineer'], difficulty: 'hard', category: 'skills' },
  { id: 'skill-9', query: 'Backend microservices', description: 'Architecture', expectedPatterns: ['microservices', 'backend'], difficulty: 'hard', category: 'skills' },
  { id: 'skill-10', query: 'GraphQL API developers', description: 'GraphQL', expectedPatterns: ['graphql', 'api'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-11', query: 'Engineers with Docker', description: 'Docker', expectedPatterns: ['docker', 'container'], difficulty: 'easy', category: 'skills' },
  { id: 'skill-12', query: 'Vue.js frontend developers', description: 'Vue frontend', expectedPatterns: ['vue', 'frontend'], difficulty: 'easy', category: 'skills' },
  { id: 'skill-13', query: 'CI/CD pipeline engineers', description: 'CI/CD', expectedPatterns: ['ci', 'cd', 'pipeline', 'jenkins', 'github actions'], difficulty: 'medium', category: 'skills' },
  { id: 'skill-14', query: 'SQL database developers', description: 'SQL', expectedPatterns: ['sql', 'database', 'postgresql', 'mysql'], difficulty: 'easy', category: 'skills' },
  { id: 'skill-15', query: 'Angular frontend engineers', description: 'Angular', expectedPatterns: ['angular', 'frontend'], difficulty: 'easy', category: 'skills' },
  
  // Experience queries (8)
  { id: 'exp-1', query: 'Developers with consulting experience', description: 'Consulting', expectedPatterns: ['consult'], difficulty: 'medium', category: 'experience' },
  { id: 'exp-2', query: 'Engineers who worked at startups', description: 'Startup', expectedPatterns: ['startup'], difficulty: 'medium', category: 'experience' },
  { id: 'exp-3', query: 'Project managers agile', description: 'Agile PM', expectedPatterns: ['project manager', 'agile', 'scrum'], difficulty: 'medium', category: 'experience' },
  { id: 'exp-4', query: 'Tech leads who managed teams', description: 'Leadership', expectedPatterns: ['tech lead', 'team lead', 'manager'], difficulty: 'medium', category: 'experience' },
  { id: 'exp-5', query: 'Banking finance industry', description: 'Finance', expectedPatterns: ['bank', 'financ'], difficulty: 'hard', category: 'experience' },
  { id: 'exp-6', query: 'Healthcare industry experience', description: 'Healthcare', expectedPatterns: ['healthcare', 'health', 'medical'], difficulty: 'hard', category: 'experience' },
  { id: 'exp-7', query: 'E-commerce platform experience', description: 'E-commerce', expectedPatterns: ['e-commerce', 'ecommerce', 'commerce', 'retail'], difficulty: 'medium', category: 'experience' },
  { id: 'exp-8', query: 'API integration experience', description: 'API integration', expectedPatterns: ['api', 'integration'], difficulty: 'easy', category: 'experience' },
  
  // Seniority queries (6)
  { id: 'senior-1', query: 'Senior Java developers', description: 'Senior Java', expectedPatterns: ['java', 'senior'], difficulty: 'medium', category: 'seniority' },
  { id: 'senior-2', query: 'Junior frontend developers', description: 'Junior', expectedPatterns: ['junior', 'frontend', 'entry'], difficulty: 'medium', category: 'seniority' },
  { id: 'senior-3', query: 'Principal engineers', description: 'Principal', expectedPatterns: ['principal', 'staff', 'architect'], difficulty: 'hard', category: 'seniority' },
  { id: 'senior-4', query: 'Lead developers', description: 'Lead', expectedPatterns: ['lead', 'senior'], difficulty: 'medium', category: 'seniority' },
  { id: 'senior-5', query: 'QA engineers automation', description: 'QA auto', expectedPatterns: ['qa', 'test', 'automation'], difficulty: 'medium', category: 'seniority' },
  { id: 'senior-6', query: 'Engineering managers', description: 'Eng manager', expectedPatterns: ['engineering manager', 'team lead', 'manager'], difficulty: 'hard', category: 'seniority' },
  
  // Education queries (2)
  { id: 'edu-1', query: 'Masters degree computer science', description: 'MS CS', expectedPatterns: ['master', 'msc', 'computer science', 'cs'], difficulty: 'hard', category: 'education' },
  { id: 'edu-2', query: 'PhD machine learning', description: 'PhD ML', expectedPatterns: ['phd', 'doctor', 'machine learning'], difficulty: 'hard', category: 'education' },
  
  // Language queries (3)
  { id: 'lang-1', query: 'French speaking developers', description: 'French', expectedPatterns: ['french', 'francais'], difficulty: 'medium', category: 'language' },
  { id: 'lang-2', query: 'German speaking engineers', description: 'German', expectedPatterns: ['german', 'deutsch'], difficulty: 'medium', category: 'language' },
  { id: 'lang-3', query: 'Spanish bilingual', description: 'Spanish', expectedPatterns: ['spanish', 'espanol'], difficulty: 'medium', category: 'language' },
  
  // Certification queries (3)
  { id: 'cert-1', query: 'AWS certified architects', description: 'AWS cert', expectedPatterns: ['aws certified', 'solutions architect', 'aws'], difficulty: 'medium', category: 'certification' },
  { id: 'cert-2', query: 'PMP certified', description: 'PMP', expectedPatterns: ['pmp', 'project management'], difficulty: 'medium', category: 'certification' },
  { id: 'cert-3', query: 'Scrum master certified', description: 'Scrum', expectedPatterns: ['scrum master', 'csm', 'scrum'], difficulty: 'medium', category: 'certification' },
  
  // Mixed queries (3)
  { id: 'mix-1', query: 'French speaking Java developers', description: 'Lang+skill', expectedPatterns: ['french', 'java'], difficulty: 'hard', category: 'mixed' },
  { id: 'mix-2', query: 'Senior React developers TypeScript', description: 'Senior+skill', expectedPatterns: ['senior', 'react', 'typescript'], difficulty: 'hard', category: 'mixed' },
  { id: 'mix-3', query: 'AWS DevOps engineers Terraform', description: 'Cert+skill', expectedPatterns: ['aws', 'devops', 'terraform'], difficulty: 'hard', category: 'mixed' },
];

// ---------------------------------------------------------------------------
// Ground Truth Discovery
// ---------------------------------------------------------------------------

/**
 * Discover ground truth IDs by running pattern-based searches against the database.
 * This populates expectedCvIds for each query based on actual CV content.
 */
export async function discoverGroundTruth(
  queries: EvalQuery[],
  scope: RetrievalScope
): Promise<EvalQuery[]> {
  const enrichedQueries: EvalQuery[] = [];
  
  for (const query of queries) {
    // Search for CVs matching the patterns
    const patternConditions = query.expectedPatterns.map(p => 
      drizzleSql`(
        LOWER(${cvPool.extractedSkills}::text) LIKE ${'%' + p.toLowerCase() + '%'}
        OR LOWER(${cvPool.extractedExperiences}::text) LIKE ${'%' + p.toLowerCase() + '%'}
        OR LOWER(${cvPool.extractedSummary}) LIKE ${'%' + p.toLowerCase() + '%'}
        OR LOWER(${cvPool.extractedEducation}::text) LIKE ${'%' + p.toLowerCase() + '%'}
        OR LOWER(${cvPool.extractedLanguages}::text) LIKE ${'%' + p.toLowerCase() + '%'}
      )`
    );
    
    const whereClause = scope.role !== 'admin'
      ? drizzleSql`${cvPool.uploadedBy} = ${scope.userId} AND (${drizzleSql.join(patternConditions, drizzleSql` OR `)})`
      : drizzleSql`${drizzleSql.join(patternConditions, drizzleSql` OR `)}`;
    
    const matchingCvs = await db
      .select({ id: cvPool.id })
      .from(cvPool)
      .where(whereClause)
      .limit(20);
    
    const cvIds = matchingCvs.map(cv => cv.id);
    
    // Also find chunk IDs for these CVs
    let chunkIds: string[] = [];
    if (cvIds.length > 0) {
      const chunks = await db
        .select({ id: cvChunks.id })
        .from(cvChunks)
        .where(inArray(cvChunks.cvId, cvIds))
        .limit(50);
      chunkIds = chunks.map(c => c.id);
    }
    
    enrichedQueries.push({
      ...query,
      expectedCvIds: cvIds.length > 0 ? cvIds : undefined,
      expectedChunkIds: chunkIds.length > 0 ? chunkIds : undefined,
    });
  }
  
  return enrichedQueries;
}

/**
 * Merge manually provided ground truth IDs into evaluation queries.
 */
export function mergeGroundTruth(
  queries: EvalQuery[],
  groundTruth: Record<string, { expectedCvIds?: string[]; expectedChunkIds?: string[] }>
): EvalQuery[] {
  return queries.map(q => ({
    ...q,
    expectedCvIds: groundTruth[q.id]?.expectedCvIds ?? q.expectedCvIds,
    expectedChunkIds: groundTruth[q.id]?.expectedChunkIds ?? q.expectedChunkIds,
  }));
}

// ---------------------------------------------------------------------------
// Evaluation Metrics
// ---------------------------------------------------------------------------

export interface EvalMetrics {
  precision5: number;
  precision10: number;
  mrr10: number;
  ndcg10: number;
  emptyResultRate: number;
  avgLatencyMs: number;
  errorRate: number;
}

export interface FailureSummary {
  missedRelevance: number;
  wrongRanking: number;
  scopeViolation: number;
  hallucinatedGrounding: number;
  emptyResult: number;
  latencyTimeout: number;
  total: number;
}

export interface CoverageMetrics {
  totalQueries: number;
  queriesWithCvIds: number;
  queriesWithChunkIds: number;
  cvIdCoverage: number;
  chunkIdCoverage: number;
}

// ---------------------------------------------------------------------------
// Relevance Functions
// ---------------------------------------------------------------------------

function chunkMatchesPatterns(chunkText: string, patterns: string[]): boolean {
  const lowerText = chunkText.toLowerCase();
  return patterns.some(p => lowerText.includes(p.toLowerCase()));
}

function isChunkRelevant(
  chunk: { chunkId: string; cvId: string; chunkText: string },
  evalQuery: EvalQuery
): boolean {
  // Primary: use ground truth IDs
  if (evalQuery.expectedChunkIds?.length) {
    return evalQuery.expectedChunkIds.includes(chunk.chunkId);
  }
  if (evalQuery.expectedCvIds?.length) {
    return evalQuery.expectedCvIds.includes(chunk.cvId);
  }
  // Fallback: pattern matching
  return chunkMatchesPatterns(chunk.chunkText, evalQuery.expectedPatterns);
}

function isCvRelevant(cvId: string, evalQuery: EvalQuery): boolean {
  if (evalQuery.expectedCvIds?.length) {
    return evalQuery.expectedCvIds.includes(cvId);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Metric Calculations
// ---------------------------------------------------------------------------

function precisionAtK(
  results: { cvId: string; chunkId?: string; chunkText?: string }[],
  evalQuery: EvalQuery,
  k: number
): number {
  const topK = results.slice(0, k);
  if (topK.length === 0) return 0;
  
  const relevant = topK.filter(r => {
    if (r.chunkId && r.chunkText) {
      return isChunkRelevant({ chunkId: r.chunkId, cvId: r.cvId, chunkText: r.chunkText }, evalQuery);
    }
    return isCvRelevant(r.cvId, evalQuery) || 
      (evalQuery.expectedPatterns.length > 0 && r.chunkText && chunkMatchesPatterns(r.chunkText, evalQuery.expectedPatterns));
  });
  return relevant.length / k;
}

function mrrAtK(
  results: { cvId: string; chunkId?: string; chunkText?: string }[],
  evalQuery: EvalQuery,
  k: number
): number {
  const topK = results.slice(0, k);
  
  for (let i = 0; i < topK.length; i++) {
    const r = topK[i];
    const isRelevant = r.chunkId && r.chunkText
      ? isChunkRelevant({ chunkId: r.chunkId, cvId: r.cvId, chunkText: r.chunkText }, evalQuery)
      : isCvRelevant(r.cvId, evalQuery);
    if (isRelevant) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function ndcgAtK(
  results: { cvId: string; chunkId?: string; chunkText?: string }[],
  evalQuery: EvalQuery,
  k: number
): number {
  const topK = results.slice(0, k);
  
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const r = topK[i];
    const isRelevant = r.chunkId && r.chunkText
      ? isChunkRelevant({ chunkId: r.chunkId, cvId: r.cvId, chunkText: r.chunkText }, evalQuery)
      : isCvRelevant(r.cvId, evalQuery);
    dcg += (isRelevant ? 1 : 0) / Math.log2(i + 2);
  }
  
  const expectedCount = evalQuery.expectedChunkIds?.length ?? evalQuery.expectedCvIds?.length ?? 0;
  let idcg = 0;
  for (let i = 0; i < Math.min(expectedCount, k); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  
  return idcg > 0 ? dcg / idcg : 0;
}

// ---------------------------------------------------------------------------
// Failure Detection
// ---------------------------------------------------------------------------

function detectMissedRelevance(
  results: { cvId: string; chunkId?: string }[],
  evalQuery: EvalQuery
): boolean {
  if (!evalQuery.expectedCvIds?.length && !evalQuery.expectedChunkIds?.length) {
    return false;
  }
  
  const resultCvIds = new Set(results.map(r => r.cvId));
  const resultChunkIds = new Set(results.filter(r => r.chunkId).map(r => r.chunkId!));
  
  if (evalQuery.expectedCvIds) {
    for (const cvId of evalQuery.expectedCvIds) {
      if (!resultCvIds.has(cvId)) return true;
    }
  }
  
  if (evalQuery.expectedChunkIds) {
    for (const chunkId of evalQuery.expectedChunkIds) {
      if (!resultChunkIds.has(chunkId)) return true;
    }
  }
  
  return false;
}

// ---------------------------------------------------------------------------
// Evaluation Result Types
// ---------------------------------------------------------------------------

export interface EvalResult {
  queryId: string;
  query: string;
  patterns: string[];
  hasGroundTruth: boolean;
  resultCount: number;
  precision5: number;
  precision10: number;
  mrr10: number;
  ndcg10: number;
  latencyMs: number;
  matchedCount: number;
  failures: FailureType[];
  isError: boolean;
}

export interface EvalReport {
  timestamp: string;
  mode: EvalMode;
  totalQueries: number;
  coverage: CoverageMetrics;
  avgMetrics: EvalMetrics;
  byDifficulty: Record<string, EvalMetrics>;
  byCategory: Record<string, EvalMetrics>;
  results: EvalResult[];
  failureSummary: FailureSummary;
  systemInfo: {
    totalCvs: number;
    totalChunks: number;
  };
}

export interface ComparisonReport {
  timestamp: string;
  queryCount: number;
  coverage: CoverageMetrics;
  baseline: EvalReport;
  phase2: EvalReport;
  deltas: {
    precision5: number;
    precision5Pct: number;
    precision10: number;
    precision10Pct: number;
    mrr10: number;
    mrr10Pct: number;
    ndcg10: number;
    ndcg10Pct: number;
    errorRate: number;
    errorRatePct: number;
    latencyMs: number;
    latencyPct: number;
  };
  summary: string;
}

export type EvalMode = 'baseline' | 'phase2' | 'both';

// ---------------------------------------------------------------------------
// Baseline Retrieval (Legacy Path)
// ---------------------------------------------------------------------------

interface BaselineResult {
  cvId: string;
  score: number;
  chunkText?: string;
}

async function runBaselineRetrieval(
  query: string,
  scope: RetrievalScope,
  limit: number = 15
): Promise<BaselineResult[]> {
  try {
    const results = await searchCvsSemantically(query, { limit, scope });
    return results.map(r => ({
      cvId: r.cvId,
      score: r.similarityScore ?? 0,
      chunkText: [r.extractedSummary, ...(r.extractedSkills ?? [])].filter(Boolean).join(' '),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Evaluation Runner
// ---------------------------------------------------------------------------

export async function runEvaluation(
  scope: RetrievalScope,
  queries: EvalQuery[],
  mode: 'baseline' | 'phase2' = 'phase2'
): Promise<EvalReport> {
  console.log(`Running ${mode} evaluation with ${queries.length} queries...\n`);

  const [cvCount] = await db.select({ c: count() }).from(cvPool);
  const [chunkCount] = await db.select({ c: count() }).from(cvChunks);

  const results: EvalResult[] = [];
  const LATENCY_TIMEOUT_MS = 10000;
  
  for (const evalQuery of queries) {
    const startTime = Date.now();
    const hasGroundTruth = (evalQuery.expectedCvIds?.length ?? 0) > 0 || (evalQuery.expectedChunkIds?.length ?? 0) > 0;
    
    try {
      let searchResults: { cvId: string; chunkId?: string; chunkText?: string }[];
      
      if (mode === 'baseline') {
        const baselineResults = await runBaselineRetrieval(evalQuery.query, scope);
        searchResults = baselineResults.map(r => ({ cvId: r.cvId, chunkText: r.chunkText }));
      } else {
        const ragResults = await retrieveChunks(evalQuery.query, scope, {
          enableRewrite: true,
          enableCache: false,
        });
        searchResults = ragResults.chunks.map(c => ({
          cvId: c.cvId,
          chunkId: c.chunkId,
          chunkText: c.chunkText,
        }));
      }
      
      const latencyMs = Date.now() - startTime;
      
      const p5 = precisionAtK(searchResults, evalQuery, 5);
      const p10 = precisionAtK(searchResults, evalQuery, 10);
      const mrr = mrrAtK(searchResults, evalQuery, 10);
      const ndcg = ndcgAtK(searchResults, evalQuery, 10);
      
      const matchedCount = searchResults.filter(r => {
        if (r.chunkId && r.chunkText) {
          return isChunkRelevant({ chunkId: r.chunkId, cvId: r.cvId, chunkText: r.chunkText }, evalQuery);
        }
        return isCvRelevant(r.cvId, evalQuery);
      }).length;
      
      const failures: FailureType[] = [];
      
      if (searchResults.length === 0) failures.push('empty_result');
      if (latencyMs > LATENCY_TIMEOUT_MS) failures.push('latency_timeout');
      if (p5 === 0 && matchedCount > 0) failures.push('wrong_ranking');
      if (matchedCount === 0 && searchResults.length > 0) failures.push('hallucinated_grounding');
      if (detectMissedRelevance(searchResults, evalQuery)) failures.push('missed_relevance');
      
      results.push({
        queryId: evalQuery.id,
        query: evalQuery.query,
        patterns: evalQuery.expectedPatterns,
        hasGroundTruth,
        resultCount: searchResults.length,
        precision5: p5,
        precision10: p10,
        mrr10: mrr,
        ndcg10: ndcg,
        latencyMs,
        matchedCount,
        failures,
        isError: false,
      });
      
      const gtLabel = hasGroundTruth ? ' [GT]' : '';
      console.log(`  ${evalQuery.id}${gtLabel}: P@5=${p5.toFixed(2)} MRR=${mrr.toFixed(2)} (${latencyMs}ms)${failures.length > 0 ? ` [${failures.join(', ')}]` : ''}`);
    } catch (error) {
      console.error(`  ${evalQuery.id}: ERROR - ${error}`);
      results.push({
        queryId: evalQuery.id,
        query: evalQuery.query,
        patterns: evalQuery.expectedPatterns,
        hasGroundTruth,
        resultCount: 0,
        precision5: 0,
        precision10: 0,
        mrr10: 0,
        ndcg10: 0,
        latencyMs: Date.now() - startTime,
        matchedCount: 0,
        failures: ['empty_result'],
        isError: true,
      });
    }
  }

  const avgMetrics = calculateAverageMetrics(results);
  const failureSummary = calculateFailureSummary(results);
  const coverage = calculateCoverage(queries);
  
  const byDifficulty: Record<string, EvalMetrics> = {};
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const diffQueries = queries.filter(q => q.difficulty === difficulty);
    const diffResults = results.filter(r => diffQueries.some(q => q.id === r.queryId));
    if (diffResults.length > 0) {
      byDifficulty[difficulty] = calculateAverageMetrics(diffResults);
    }
  }

  const byCategory: Record<string, EvalMetrics> = {};
  const categories = ['skills', 'experience', 'education', 'mixed', 'seniority', 'language', 'certification'] as const;
  for (const category of categories) {
    const catQueries = queries.filter(q => q.category === category);
    const catResults = results.filter(r => catQueries.some(q => q.id === r.queryId));
    if (catResults.length > 0) {
      byCategory[category] = calculateAverageMetrics(catResults);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    mode: mode,
    totalQueries: queries.length,
    coverage,
    avgMetrics,
    byDifficulty,
    byCategory,
    results,
    failureSummary,
    systemInfo: {
      totalCvs: cvCount.c,
      totalChunks: chunkCount.c,
    },
  };
}

/**
 * Run comparison evaluation: baseline vs phase2
 */
export async function runComparisonEvaluation(
  scope: RetrievalScope,
  queries: EvalQuery[]
): Promise<ComparisonReport> {
  console.log('Running comparison evaluation (baseline vs phase2)...\n');
  
  console.log('=== BASELINE ===');
  const baseline = await runEvaluation(scope, queries, 'baseline');
  
  console.log('\n=== PHASE 2 RAG ===');
  const phase2 = await runEvaluation(scope, queries, 'phase2');
  
  const coverage = calculateCoverage(queries);
  
  const deltas = {
    precision5: phase2.avgMetrics.precision5 - baseline.avgMetrics.precision5,
    precision5Pct: baseline.avgMetrics.precision5 > 0 
      ? ((phase2.avgMetrics.precision5 - baseline.avgMetrics.precision5) / baseline.avgMetrics.precision5) * 100 
      : 0,
    precision10: phase2.avgMetrics.precision10 - baseline.avgMetrics.precision10,
    precision10Pct: baseline.avgMetrics.precision10 > 0 
      ? ((phase2.avgMetrics.precision10 - baseline.avgMetrics.precision10) / baseline.avgMetrics.precision10) * 100 
      : 0,
    mrr10: phase2.avgMetrics.mrr10 - baseline.avgMetrics.mrr10,
    mrr10Pct: baseline.avgMetrics.mrr10 > 0 
      ? ((phase2.avgMetrics.mrr10 - baseline.avgMetrics.mrr10) / baseline.avgMetrics.mrr10) * 100 
      : 0,
    ndcg10: phase2.avgMetrics.ndcg10 - baseline.avgMetrics.ndcg10,
    ndcg10Pct: baseline.avgMetrics.ndcg10 > 0 
      ? ((phase2.avgMetrics.ndcg10 - baseline.avgMetrics.ndcg10) / baseline.avgMetrics.ndcg10) * 100 
      : 0,
    errorRate: phase2.avgMetrics.errorRate - baseline.avgMetrics.errorRate,
    errorRatePct: baseline.avgMetrics.errorRate > 0 
      ? ((phase2.avgMetrics.errorRate - baseline.avgMetrics.errorRate) / baseline.avgMetrics.errorRate) * 100 
      : 0,
    latencyMs: phase2.avgMetrics.avgLatencyMs - baseline.avgMetrics.avgLatencyMs,
    latencyPct: baseline.avgMetrics.avgLatencyMs > 0 
      ? ((phase2.avgMetrics.avgLatencyMs - baseline.avgMetrics.avgLatencyMs) / baseline.avgMetrics.avgLatencyMs) * 100 
      : 0,
  };
  
  const summary = generateComparisonSummary(deltas);
  
  return {
    timestamp: new Date().toISOString(),
    queryCount: queries.length,
    coverage,
    baseline,
    phase2,
    deltas,
    summary,
  };
}

function generateComparisonSummary(deltas: ComparisonReport['deltas']): string {
  const lines: string[] = [];
  
  const p5Direction = deltas.precision5 > 0 ? 'improved' : deltas.precision5 < 0 ? 'regressed' : 'unchanged';
  lines.push(`Precision@5: ${p5Direction} by ${Math.abs(deltas.precision5Pct).toFixed(1)}%`);
  
  const mrrDirection = deltas.mrr10 > 0 ? 'improved' : deltas.mrr10 < 0 ? 'regressed' : 'unchanged';
  lines.push(`MRR@10: ${mrrDirection} by ${Math.abs(deltas.mrr10Pct).toFixed(1)}%`);
  
  const latencyDirection = deltas.latencyMs < 0 ? 'faster' : deltas.latencyMs > 0 ? 'slower' : 'unchanged';
  lines.push(`Latency: ${latencyDirection} by ${Math.abs(deltas.latencyPct).toFixed(1)}%`);
  
  return lines.join('; ');
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function calculateAverageMetrics(results: EvalResult[]): EvalMetrics {
  if (results.length === 0) {
    return { precision5: 0, precision10: 0, mrr10: 0, ndcg10: 0, emptyResultRate: 0, avgLatencyMs: 0, errorRate: 0 };
  }

  const sum = results.reduce(
    (acc, r) => ({
      p5: acc.p5 + r.precision5,
      p10: acc.p10 + r.precision10,
      mrr: acc.mrr + r.mrr10,
      ndcg: acc.ndcg + r.ndcg10,
      empty: acc.empty + (r.resultCount === 0 ? 1 : 0),
      latency: acc.latency + r.latencyMs,
      errors: acc.errors + (r.isError ? 1 : 0),
    }),
    { p5: 0, p10: 0, mrr: 0, ndcg: 0, empty: 0, latency: 0, errors: 0 }
  );

  return {
    precision5: sum.p5 / results.length,
    precision10: sum.p10 / results.length,
    mrr10: sum.mrr / results.length,
    ndcg10: sum.ndcg / results.length,
    emptyResultRate: sum.empty / results.length,
    avgLatencyMs: sum.latency / results.length,
    errorRate: sum.errors / results.length,
  };
}

function calculateFailureSummary(results: EvalResult[]): FailureSummary {
  const summary: FailureSummary = {
    missedRelevance: 0,
    wrongRanking: 0,
    scopeViolation: 0,
    hallucinatedGrounding: 0,
    emptyResult: 0,
    latencyTimeout: 0,
    total: 0,
  };

  for (const result of results) {
    for (const failure of result.failures) {
      switch (failure) {
        case 'missed_relevance': summary.missedRelevance++; break;
        case 'wrong_ranking': summary.wrongRanking++; break;
        case 'scope_violation': summary.scopeViolation++; break;
        case 'hallucinated_grounding': summary.hallucinatedGrounding++; break;
        case 'empty_result': summary.emptyResult++; break;
        case 'latency_timeout': summary.latencyTimeout++; break;
      }
      summary.total++;
    }
  }

  return summary;
}

export function calculateCoverage(queries: EvalQuery[]): CoverageMetrics {
  const withCvIds = queries.filter(q => (q.expectedCvIds?.length ?? 0) > 0).length;
  const withChunkIds = queries.filter(q => (q.expectedChunkIds?.length ?? 0) > 0).length;
  
  return {
    totalQueries: queries.length,
    queriesWithCvIds: withCvIds,
    queriesWithChunkIds: withChunkIds,
    cvIdCoverage: queries.length > 0 ? withCvIds / queries.length : 0,
    chunkIdCoverage: queries.length > 0 ? withChunkIds / queries.length : 0,
  };
}

// ---------------------------------------------------------------------------
// Report Printing
// ---------------------------------------------------------------------------

export function printEvalReport(report: EvalReport): void {
  console.log('\n========================================');
  console.log(`EVALUATION REPORT (${report.mode.toUpperCase()})`);
  console.log('========================================\n');
  
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Total Queries: ${report.totalQueries}`);
  console.log(`CVs in DB: ${report.systemInfo.totalCvs}`);
  console.log(`Chunks in DB: ${report.systemInfo.totalChunks}\n`);
  
  console.log('--- Ground Truth Coverage ---');
  console.log(`Queries with CV IDs: ${report.coverage.queriesWithCvIds}/${report.coverage.totalQueries} (${(report.coverage.cvIdCoverage * 100).toFixed(0)}%)`);
  console.log(`Queries with Chunk IDs: ${report.coverage.queriesWithChunkIds}/${report.coverage.totalQueries} (${(report.coverage.chunkIdCoverage * 100).toFixed(0)}%)\n`);
  
  console.log('--- Aggregate Metrics ---');
  console.log(`Precision@5:  ${(report.avgMetrics.precision5 * 100).toFixed(1)}%`);
  console.log(`Precision@10: ${(report.avgMetrics.precision10 * 100).toFixed(1)}%`);
  console.log(`MRR@10:       ${report.avgMetrics.mrr10.toFixed(3)}`);
  console.log(`NDCG@10:      ${report.avgMetrics.ndcg10.toFixed(3)}`);
  console.log(`Empty Rate:   ${(report.avgMetrics.emptyResultRate * 100).toFixed(1)}%`);
  console.log(`Error Rate:   ${(report.avgMetrics.errorRate * 100).toFixed(1)}%`);
  console.log(`Avg Latency:  ${report.avgMetrics.avgLatencyMs.toFixed(0)}ms\n`);
  
  console.log('--- Failure Taxonomy ---');
  console.log(`Empty Results:          ${report.failureSummary.emptyResult}`);
  console.log(`Wrong Ranking:          ${report.failureSummary.wrongRanking}`);
  console.log(`Hallucinated Grounding: ${report.failureSummary.hallucinatedGrounding}`);
  console.log(`Missed Relevance:       ${report.failureSummary.missedRelevance}`);
  console.log(`Scope Violation:        ${report.failureSummary.scopeViolation}`);
  console.log(`Latency Timeout:        ${report.failureSummary.latencyTimeout}`);
  console.log(`Total Failures:         ${report.failureSummary.total}\n`);
  
  console.log('--- By Difficulty ---');
  for (const [diff, metrics] of Object.entries(report.byDifficulty)) {
    console.log(`${diff}: P@5=${(metrics.precision5 * 100).toFixed(1)}% MRR=${metrics.mrr10.toFixed(3)}`);
  }
  
  console.log('\n--- By Category ---');
  for (const [cat, metrics] of Object.entries(report.byCategory)) {
    console.log(`${cat}: P@5=${(metrics.precision5 * 100).toFixed(1)}% MRR=${metrics.mrr10.toFixed(3)}`);
  }
  
  console.log('\n========================================\n');
}

export function printComparisonReport(report: ComparisonReport): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         BASELINE vs PHASE 2 COMPARISON REPORT              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Query Count: ${report.queryCount}`);
  console.log(`Ground Truth Coverage: ${(report.coverage.cvIdCoverage * 100).toFixed(0)}% CV IDs\n`);
  
  console.log('┌─────────────────┬───────────┬───────────┬───────────┬──────────┐');
  console.log('│ Metric          │ Baseline  │ Phase 2   │ Delta     │ Change   │');
  console.log('├─────────────────┼───────────┼───────────┼───────────┼──────────┤');
  
  const fmt = (v: number, pct: boolean = false) => pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(3);
  const delta = (d: number, pct: number, invert: boolean = false) => {
    const sign = (invert ? -d : d) > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };
  
  console.log(`│ Precision@5     │ ${fmt(report.baseline.avgMetrics.precision5, true).padStart(9)} │ ${fmt(report.phase2.avgMetrics.precision5, true).padStart(9)} │ ${delta(report.deltas.precision5, report.deltas.precision5Pct).padStart(9)} │ ${(report.deltas.precision5 >= 0 ? '✓' : '✗').padStart(8)} │`);
  console.log(`│ Precision@10    │ ${fmt(report.baseline.avgMetrics.precision10, true).padStart(9)} │ ${fmt(report.phase2.avgMetrics.precision10, true).padStart(9)} │ ${delta(report.deltas.precision10, report.deltas.precision10Pct).padStart(9)} │ ${(report.deltas.precision10 >= 0 ? '✓' : '✗').padStart(8)} │`);
  console.log(`│ MRR@10          │ ${fmt(report.baseline.avgMetrics.mrr10).padStart(9)} │ ${fmt(report.phase2.avgMetrics.mrr10).padStart(9)} │ ${delta(report.deltas.mrr10, report.deltas.mrr10Pct).padStart(9)} │ ${(report.deltas.mrr10 >= 0 ? '✓' : '✗').padStart(8)} │`);
  console.log(`│ NDCG@10         │ ${fmt(report.baseline.avgMetrics.ndcg10).padStart(9)} │ ${fmt(report.phase2.avgMetrics.ndcg10).padStart(9)} │ ${delta(report.deltas.ndcg10, report.deltas.ndcg10Pct).padStart(9)} │ ${(report.deltas.ndcg10 >= 0 ? '✓' : '✗').padStart(8)} │`);
  console.log(`│ Error Rate      │ ${fmt(report.baseline.avgMetrics.errorRate, true).padStart(9)} │ ${fmt(report.phase2.avgMetrics.errorRate, true).padStart(9)} │ ${delta(report.deltas.errorRate, report.deltas.errorRatePct, true).padStart(9)} │ ${(report.deltas.errorRate <= 0 ? '✓' : '✗').padStart(8)} │`);
  console.log(`│ Avg Latency     │ ${report.baseline.avgMetrics.avgLatencyMs.toFixed(0).padStart(7)}ms │ ${report.phase2.avgMetrics.avgLatencyMs.toFixed(0).padStart(7)}ms │ ${delta(report.deltas.latencyMs, report.deltas.latencyPct, true).padStart(9)} │ ${(report.deltas.latencyMs <= 0 ? '✓' : '✗').padStart(8)} │`);
  console.log('└─────────────────┴───────────┴───────────┴───────────┴──────────┘\n');
  
  console.log(`Summary: ${report.summary}\n`);
}

/**
 * Generate Markdown summary for report.
 */
export function generateMarkdownSummary(report: EvalReport | ComparisonReport): string {
  const lines: string[] = [];
  
  if ('deltas' in report) {
    // Comparison report
    lines.push('# RAG Evaluation Comparison Report');
    lines.push('');
    lines.push(`**Generated:** ${report.timestamp}`);
    lines.push(`**Queries:** ${report.queryCount}`);
    lines.push(`**Ground Truth Coverage:** ${(report.coverage.cvIdCoverage * 100).toFixed(0)}%`);
    lines.push('');
    lines.push('## Results');
    lines.push('');
    lines.push('| Metric | Baseline | Phase 2 | Delta |');
    lines.push('|--------|----------|---------|-------|');
    lines.push(`| Precision@5 | ${(report.baseline.avgMetrics.precision5 * 100).toFixed(1)}% | ${(report.phase2.avgMetrics.precision5 * 100).toFixed(1)}% | ${report.deltas.precision5Pct >= 0 ? '+' : ''}${report.deltas.precision5Pct.toFixed(1)}% |`);
    lines.push(`| Precision@10 | ${(report.baseline.avgMetrics.precision10 * 100).toFixed(1)}% | ${(report.phase2.avgMetrics.precision10 * 100).toFixed(1)}% | ${report.deltas.precision10Pct >= 0 ? '+' : ''}${report.deltas.precision10Pct.toFixed(1)}% |`);
    lines.push(`| MRR@10 | ${report.baseline.avgMetrics.mrr10.toFixed(3)} | ${report.phase2.avgMetrics.mrr10.toFixed(3)} | ${report.deltas.mrr10Pct >= 0 ? '+' : ''}${report.deltas.mrr10Pct.toFixed(1)}% |`);
    lines.push(`| NDCG@10 | ${report.baseline.avgMetrics.ndcg10.toFixed(3)} | ${report.phase2.avgMetrics.ndcg10.toFixed(3)} | ${report.deltas.ndcg10Pct >= 0 ? '+' : ''}${report.deltas.ndcg10Pct.toFixed(1)}% |`);
    lines.push(`| Error Rate | ${(report.baseline.avgMetrics.errorRate * 100).toFixed(1)}% | ${(report.phase2.avgMetrics.errorRate * 100).toFixed(1)}% | ${report.deltas.errorRatePct >= 0 ? '+' : ''}${report.deltas.errorRatePct.toFixed(1)}% |`);
    lines.push(`| Latency | ${report.baseline.avgMetrics.avgLatencyMs.toFixed(0)}ms | ${report.phase2.avgMetrics.avgLatencyMs.toFixed(0)}ms | ${report.deltas.latencyPct >= 0 ? '+' : ''}${report.deltas.latencyPct.toFixed(1)}% |`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(report.summary);
  } else {
    // Single report
    lines.push(`# RAG Evaluation Report (${report.mode})`);
    lines.push('');
    lines.push(`**Generated:** ${report.timestamp}`);
    lines.push(`**Queries:** ${report.totalQueries}`);
    lines.push(`**CVs:** ${report.systemInfo.totalCvs}`);
    lines.push(`**Chunks:** ${report.systemInfo.totalChunks}`);
    lines.push('');
    lines.push('## Metrics');
    lines.push('');
    lines.push(`- **Precision@5:** ${(report.avgMetrics.precision5 * 100).toFixed(1)}%`);
    lines.push(`- **Precision@10:** ${(report.avgMetrics.precision10 * 100).toFixed(1)}%`);
    lines.push(`- **MRR@10:** ${report.avgMetrics.mrr10.toFixed(3)}`);
    lines.push(`- **NDCG@10:** ${report.avgMetrics.ndcg10.toFixed(3)}`);
    lines.push(`- **Empty Rate:** ${(report.avgMetrics.emptyResultRate * 100).toFixed(1)}%`);
    lines.push(`- **Error Rate:** ${(report.avgMetrics.errorRate * 100).toFixed(1)}%`);
    lines.push(`- **Avg Latency:** ${report.avgMetrics.avgLatencyMs.toFixed(0)}ms`);
  }
  
  return lines.join('\n');
}
