/**
 * RAG Evaluation Script
 * 
 * Run with: bun run eval:rag
 * 
 * Examples:
 *   bun run eval:rag                                    # Phase 2 only
 *   bun run eval:rag -- --mode baseline                 # Baseline only
 *   bun run eval:rag -- --mode=both                     # Compare both
 *   bun run eval:rag -- --mode=both --strict            # Compare with strict validation
 *   bun run eval:rag -- --discover-ground-truth         # Auto-discover IDs from DB
 *   bun run eval:rag -- --output reports/rag-eval/latest.json
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  runEvaluation,
  runComparisonEvaluation,
  printEvalReport,
  printComparisonReport,
  generateMarkdownSummary,
  discoverGroundTruth,
  calculateCoverage,
  EVAL_QUERIES,
} from '@/features/recruitment/services/evaluation';
import type { EvalMode, EvalQuery } from '@/features/recruitment/services/evaluation';
import type { RetrievalScope } from '@/features/recruitment/services/cv-matching';

const EVAL_MODES: readonly EvalMode[] = ['baseline', 'phase2', 'both'] as const;

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  const getArg = (name: string): string | undefined => {
    const prefixed = `--${name}=`;
    const equalsArg = args.find(a => a.startsWith(prefixed));
    if (equalsArg) {
      return equalsArg.slice(prefixed.length);
    }

    const index = args.findIndex(a => a === `--${name}`);
    if (index >= 0 && index + 1 < args.length) {
      const candidate = args[index + 1];
      if (!candidate.startsWith('--')) {
        return candidate;
      }
    }

    return undefined;
  };
  
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const rawMode = getArg('mode');
  const mode: EvalMode = EVAL_MODES.includes(rawMode as EvalMode)
    ? (rawMode as EvalMode)
    : 'phase2';
  
  return {
    mode,
    strict: hasFlag('strict'),
    discoverGroundTruth: hasFlag('discover-ground-truth'),
    failOnRegression: hasFlag('fail-on-regression'),
    json: hasFlag('json'),
    output: getArg('output'),
    help: hasFlag('help') || hasFlag('h'),
    invalidMode: rawMode && !EVAL_MODES.includes(rawMode as EvalMode) ? rawMode : undefined,
  };
}

function printHelp() {
  console.log(`
RAG Evaluation Script - Phase 2 True RAG

Usage: bun run eval:rag [options]

Options:
  --mode <mode>           Evaluation mode: baseline, phase2, both (default: phase2)
  --mode=<mode>           Same as above (also supported)
  --strict                Enable strict validation (fails on quality gates)
  --discover-ground-truth Auto-discover CV/chunk IDs from database
  --fail-on-regression    Exit with error if precision@5 regresses by >5% in mode=both
  --json                  Output raw JSON instead of formatted report
  --output=<path>         Save JSON report to file (also saves .md summary)
  --help, -h              Show this help message

Examples:
  bun run eval:rag -- --mode both --strict
  bun run eval:rag -- --mode=both --strict
  bun run eval:rag -- --discover-ground-truth --output reports/rag-eval/latest.json
`);
}

// Strict validation checks
interface StrictValidation {
  passed: boolean;
  errors: string[];
}

function validateStrict(
  queryCount: number,
  coverageCvIds: number,
  mode: EvalMode,
  hasComparison: boolean
): StrictValidation {
  const errors: string[] = [];
  
  // Query count must be 30-50
  if (queryCount < 30 || queryCount > 50) {
    errors.push(`Query count ${queryCount} outside required range 30-50`);
  }
  
  // Ground-truth coverage threshold (50% minimum)
  const MIN_COVERAGE = 0.5;
  if (coverageCvIds < MIN_COVERAGE) {
    errors.push(`Ground-truth CV coverage ${(coverageCvIds * 100).toFixed(1)}% below ${MIN_COVERAGE * 100}% threshold`);
  }
  
  // mode=both must produce comparison output
  if (mode === 'both' && !hasComparison) {
    errors.push('mode=both requires comparison output but none was produced');
  }
  
  return {
    passed: errors.length === 0,
    errors,
  };
}

// Ensure directory exists
function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Generate timestamped filename
function getTimestampedPath(basePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const normalized = basePath.replace(/\.json$/i, '');
  return `${normalized}-${timestamp}.json`;
}

function getLatestOutputPaths(basePath: string): { json: string; markdown: string } {
  const json = basePath.endsWith('.json') ? basePath : `${basePath}.json`;
  const markdown = json.replace(/\.json$/i, '.md');
  return { json, markdown };
}

async function main() {
  const config = parseArgs();
  
  if (config.help) {
    printHelp();
    process.exit(0);
  }
  
  const EVAL_USER_ID = process.env.EVAL_USER_ID ?? 'eval-admin-user';
  const EVAL_ROLE = (process.env.EVAL_ROLE ?? 'admin') as 'admin' | 'ta';
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           RAG EVALUATION - Phase 2 True RAG                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('Configuration:');
  console.log(`  Mode: ${config.mode}`);
  console.log(`  User ID: ${EVAL_USER_ID}`);
  console.log(`  Role: ${EVAL_ROLE}`);
  console.log(`  Strict: ${config.strict}`);
  console.log(`  Discover ground truth: ${config.discoverGroundTruth}`);
  console.log(`  Total queries: ${EVAL_QUERIES.length}\n`);

  if (config.invalidMode) {
    console.warn(`Warning: invalid --mode value "${config.invalidMode}"; falling back to "phase2".`);
    console.warn('Allowed values: baseline, phase2, both\n');
  }

  const scope: RetrievalScope = {
    userId: EVAL_USER_ID,
    role: EVAL_ROLE,
  };

  // Optionally discover ground truth from database
  let queries: EvalQuery[] = EVAL_QUERIES;
  
  if (config.discoverGroundTruth) {
    console.log('Discovering ground truth from database...');
    queries = await discoverGroundTruth(queries, scope);
    console.log(`  Discovered ground truth for ${queries.filter(q => q.expectedCvIds?.length).length} queries\n`);
  }
  
  // Calculate coverage metrics
  const coverage = calculateCoverage(queries);
  console.log('Ground truth coverage:');
  console.log(`  Queries with CV IDs: ${coverage.queriesWithCvIds}/${coverage.totalQueries} (${(coverage.cvIdCoverage * 100).toFixed(1)}%)`);
  console.log(`  Queries with chunk IDs: ${coverage.queriesWithChunkIds}/${coverage.totalQueries} (${(coverage.chunkIdCoverage * 100).toFixed(1)}%)\n`);

  const startTime = Date.now();
  
  try {
    if (config.mode === 'both') {
      // Run comparison evaluation
      console.log('Running baseline vs Phase 2 comparison...\n');
      const comparison = await runComparisonEvaluation(scope, queries);
      const durationMs = Date.now() - startTime;
      
      console.log(`Evaluation completed in ${(durationMs / 1000).toFixed(1)}s\n`);
      
      if (config.json) {
        console.log(JSON.stringify(comparison, null, 2));
      } else {
        printComparisonReport(comparison);
      }
      
      // Save reports if output specified
      if (config.output) {
        const jsonPath = getTimestampedPath(config.output);
        const mdPath = jsonPath.replace(/\.json$/, '.md');
        const latestPaths = getLatestOutputPaths(config.output);
        
        ensureDir(jsonPath);
        
        writeFileSync(jsonPath, JSON.stringify(comparison, null, 2));
        console.log(`\nJSON report saved to: ${jsonPath}`);
        
        const mdContent = generateMarkdownSummary(comparison);
        writeFileSync(mdPath, mdContent);
        console.log(`Markdown summary saved to: ${mdPath}`);
        
        // Also save explicit "latest" paths for easy CI/CD consumption.
        ensureDir(latestPaths.json);
        writeFileSync(latestPaths.json, JSON.stringify(comparison, null, 2));
        writeFileSync(latestPaths.markdown, mdContent);
        console.log(`Latest JSON report saved to: ${latestPaths.json}`);
        console.log(`Latest Markdown summary saved to: ${latestPaths.markdown}`);
      }
      
      // Strict validation
      if (config.strict) {
        const validation = validateStrict(
          queries.length,
          coverage.cvIdCoverage,
          config.mode,
          true
        );
        
        if (!validation.passed) {
          console.error('\nStrict validation FAILED:');
          validation.errors.forEach(e => console.error(`  - ${e}`));
          process.exit(1);
        }
        console.log('\nStrict validation passed');
      }
      
      // Summary metrics
      console.log('\n=== Summary for CI/CD ===');
      console.log(`MODE=comparison`);
      console.log(`BASELINE_P5=${(comparison.baseline.avgMetrics.precision5 * 100).toFixed(1)}`);
      console.log(`PHASE2_P5=${(comparison.phase2.avgMetrics.precision5 * 100).toFixed(1)}`);
      console.log(`P5_DELTA=${(comparison.deltas.precision5 * 100).toFixed(1)}`);
      console.log(`P5_CHANGE=${comparison.deltas.precision5Pct.toFixed(1)}%`);
      
      // Optional CI gate: fail if Phase 2 regressed significantly.
      if (comparison.deltas.precision5 < -0.05) {
        const regressionMsg = `Phase 2 precision@5 regressed by ${(comparison.deltas.precision5 * -100).toFixed(1)}%`;
        if (config.failOnRegression) {
          console.error(`\n${regressionMsg}`);
          process.exit(1);
        }
        console.warn(`\nWarning: ${regressionMsg}`);
        console.warn('Use --fail-on-regression to enforce this as a hard failure.');
      }
      
    } else {
      // Run single mode (baseline or phase2)
      console.log(`Running ${config.mode} evaluation...\n`);
      const report = await runEvaluation(scope, queries, config.mode);
      const durationMs = Date.now() - startTime;
      
      console.log(`Evaluation completed in ${(durationMs / 1000).toFixed(1)}s\n`);
      
      if (config.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printEvalReport(report);
      }
      
      // Save reports if output specified
      if (config.output) {
        const jsonPath = getTimestampedPath(config.output);
        const mdPath = jsonPath.replace(/\.json$/, '.md');
        const latestPaths = getLatestOutputPaths(config.output);
        
        ensureDir(jsonPath);
        
        writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        console.log(`\nJSON report saved to: ${jsonPath}`);
        
        const mdContent = generateMarkdownSummary(report);
        writeFileSync(mdPath, mdContent);
        console.log(`Markdown summary saved to: ${mdPath}`);

        ensureDir(latestPaths.json);
        writeFileSync(latestPaths.json, JSON.stringify(report, null, 2));
        writeFileSync(latestPaths.markdown, mdContent);
        console.log(`Latest JSON report saved to: ${latestPaths.json}`);
        console.log(`Latest Markdown summary saved to: ${latestPaths.markdown}`);
      }
      
      // Strict validation
      if (config.strict) {
        const validation = validateStrict(
          queries.length,
          coverage.cvIdCoverage,
          config.mode,
          false
        );
        
        if (!validation.passed) {
          console.error('\nStrict validation FAILED:');
          validation.errors.forEach(e => console.error(`  - ${e}`));
          process.exit(1);
        }
        console.log('\nStrict validation passed');
      }
      
      // Summary metrics
      console.log('\n=== Summary for CI/CD ===');
      console.log(`MODE=${config.mode}`);
      console.log(`PRECISION_5=${(report.avgMetrics.precision5 * 100).toFixed(1)}`);
      console.log(`PRECISION_10=${(report.avgMetrics.precision10 * 100).toFixed(1)}`);
      console.log(`MRR_10=${report.avgMetrics.mrr10.toFixed(3)}`);
      console.log(`NDCG_10=${report.avgMetrics.ndcg10.toFixed(3)}`);
      console.log(`ERROR_RATE=${(report.avgMetrics.errorRate * 100).toFixed(1)}`);
      console.log(`TOTAL_FAILURES=${report.failureSummary.total}`);
      
      // Exit with error if below threshold
      const P5_THRESHOLD = 0.1;
      if (report.avgMetrics.precision5 < P5_THRESHOLD) {
        console.error(`\nPrecision@5 (${(report.avgMetrics.precision5 * 100).toFixed(1)}%) below threshold (${P5_THRESHOLD * 100}%)`);
        process.exit(1);
      }
    }
    
    console.log('\nEvaluation passed quality gates');
    process.exit(0);
    
  } catch (error) {
    console.error('Evaluation failed:', error);
    process.exit(1);
  }
}

main();
