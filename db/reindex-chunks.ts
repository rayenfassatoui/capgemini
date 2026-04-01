/**
 * Reindex all CVs with chunked embeddings for Phase 2 RAG.
 * Run with: bun run db/reindex-chunks.ts
 */

import { db } from '@/lib/db';
import { cvPool, cvChunks } from '@/db/schema';
import { eq, isNotNull, count } from 'drizzle-orm';
import { generateAndStoreCvChunks, deleteCvChunks } from '@/features/recruitment/services/chunking';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reindexAllCvs(): Promise<void> {
  console.log('Starting CV chunk reindexing...\n');

  // Get total CV count
  const [{ total }] = await db
    .select({ total: count() })
    .from(cvPool)
    .where(isNotNull(cvPool.extractedSkills));

  console.log(`Found ${total} CVs with extracted data to reindex.\n`);

  if (total === 0) {
    console.log('No CVs to reindex. Done.');
    return;
  }

  // Get all CV IDs
  const cvIds = await db
    .select({ id: cvPool.id, name: cvPool.extractedName })
    .from(cvPool)
    .where(isNotNull(cvPool.extractedSkills));

  let processed = 0;
  let successful = 0;
  let failed = 0;
  let totalChunks = 0;

  // Process in batches
  for (let i = 0; i < cvIds.length; i += BATCH_SIZE) {
    const batch = cvIds.slice(i, i + BATCH_SIZE);
    
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cvIds.length / BATCH_SIZE)}...`);

    for (const cv of batch) {
      try {
        const chunkCount = await generateAndStoreCvChunks(cv.id);
        
        if (chunkCount > 0) {
          successful++;
          totalChunks += chunkCount;
          console.log(`  ✓ ${cv.name ?? cv.id}: ${chunkCount} chunks`);
        } else {
          failed++;
          console.log(`  ✗ ${cv.name ?? cv.id}: No chunks generated`);
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  ✗ ${cv.name ?? cv.id}: ${msg}`);
      }
      
      processed++;
    }

    // Rate limit to avoid API throttling
    if (i + BATCH_SIZE < cvIds.length) {
      console.log(`  Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...\n`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log('\n========================================');
  console.log('Reindexing complete!');
  console.log(`  Total CVs processed: ${processed}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total chunks created: ${totalChunks}`);
  console.log('========================================\n');
}

async function clearAllChunks(): Promise<void> {
  console.log('Clearing all existing chunks...');
  await db.delete(cvChunks);
  console.log('Done.\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--clear')) {
    await clearAllChunks();
  }
  
  if (args.includes('--help')) {
    console.log(`
CV Chunk Reindexing Script

Usage:
  bun run db/reindex-chunks.ts [options]

Options:
  --clear   Clear all existing chunks before reindexing
  --help    Show this help message

Examples:
  bun run db/reindex-chunks.ts            # Reindex all CVs
  bun run db/reindex-chunks.ts --clear    # Clear and reindex
`);
    return;
  }

  await reindexAllCvs();
}

main().catch(console.error);
