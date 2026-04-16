import { db } from '@/lib/db';
import { cvPool, cvChunks } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateTextEmbeddingsBatch } from './embeddings';

// ---------------------------------------------------------------------------
// CV Chunking Service - Phase 2 RAG
// Splits CVs into semantic chunks for improved retrieval
// ---------------------------------------------------------------------------

export type ChunkSectionType = 'experience' | 'skills' | 'education' | 'summary' | 'languages';

export interface CvChunk {
  sectionType: ChunkSectionType;
  sectionOrder: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
}

// Target chunk size: 200-350 tokens (~800-1400 chars)
const TARGET_MAX_TOKENS = 350;
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count using simple heuristic (1 token ≈ 4 chars).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Truncate text to fit within max tokens.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

/**
 * Build experience chunks - one per role/company block.
 */
function chunkExperiences(
  experiences: Array<Record<string, string>> | null
): CvChunk[] {
  if (!experiences || experiences.length === 0) return [];

  return experiences.map((exp, idx) => {
    const title = exp.title || exp.role || exp.position || '';
    const company = exp.company || exp.organization || '';
    const dates = exp.dates || exp.period || exp.duration || '';
    const description = exp.description || exp.responsibilities || exp.details || '';

    const parts: string[] = [];
    if (title) parts.push(`Role: ${title}`);
    if (company) parts.push(`Company: ${company}`);
    if (dates) parts.push(`Period: ${dates}`);
    if (description) parts.push(`Responsibilities: ${description}`);

    const text = parts.join('. ');
    const truncated = truncateToTokens(text, TARGET_MAX_TOKENS);

    return {
      sectionType: 'experience' as ChunkSectionType,
      sectionOrder: idx,
      chunkText: truncated,
      tokenEstimate: estimateTokens(truncated),
      metadata: { company, title, dates },
    };
  }).filter(chunk => chunk.chunkText.length > 20);
}

/**
 * Build skills chunk - normalized list of skills.
 */
function chunkSkills(skills: string[] | null): CvChunk[] {
  if (!skills || skills.length === 0) return [];

  const normalized = skills.map(s => s.trim()).filter(Boolean);
  const text = `Technical Skills: ${normalized.join(', ')}`;
  const truncated = truncateToTokens(text, TARGET_MAX_TOKENS);

  return [{
    sectionType: 'skills',
    sectionOrder: 0,
    chunkText: truncated,
    tokenEstimate: estimateTokens(truncated),
    metadata: { skillCount: normalized.length },
  }];
}

/**
 * Build education chunks - one per degree.
 */
function chunkEducation(
  education: Array<Record<string, string>> | null
): CvChunk[] {
  if (!education || education.length === 0) return [];

  return education.map((edu, idx) => {
    const degree = edu.degree || edu.level || '';
    const field = edu.field || edu.major || edu.specialization || '';
    const institution = edu.institution || edu.university || edu.school || '';
    const year = edu.year || edu.graduationYear || edu.dates || '';

    const parts: string[] = [];
    if (degree) parts.push(`Degree: ${degree}`);
    if (field) parts.push(`Field: ${field}`);
    if (institution) parts.push(`Institution: ${institution}`);
    if (year) parts.push(`Year: ${year}`);

    const text = parts.join('. ');
    const truncated = truncateToTokens(text, TARGET_MAX_TOKENS);

    return {
      sectionType: 'education' as ChunkSectionType,
      sectionOrder: idx,
      chunkText: truncated,
      tokenEstimate: estimateTokens(truncated),
      metadata: { degree, field, institution },
    };
  }).filter(chunk => chunk.chunkText.length > 10);
}

/**
 * Build summary chunk.
 */
function chunkSummary(summary: string | null): CvChunk[] {
  if (!summary || summary.trim().length < 20) return [];

  const text = `Professional Summary: ${summary.trim()}`;
  const truncated = truncateToTokens(text, TARGET_MAX_TOKENS);

  return [{
    sectionType: 'summary',
    sectionOrder: 0,
    chunkText: truncated,
    tokenEstimate: estimateTokens(truncated),
    metadata: {},
  }];
}

/**
 * Build languages chunk.
 */
function chunkLanguages(languages: string[] | null): CvChunk[] {
  if (!languages || languages.length === 0) return [];

  const text = `Languages: ${languages.join(', ')}`;
  const truncated = truncateToTokens(text, TARGET_MAX_TOKENS);

  return [{
    sectionType: 'languages',
    sectionOrder: 0,
    chunkText: truncated,
    tokenEstimate: estimateTokens(truncated),
    metadata: { languageCount: languages.length },
  }];
}

/**
 * Generate all chunks for a CV from its extracted data.
 */
export function generateCvChunks(cv: {
  extractedName?: string | null;
  extractedSkills?: string[] | null;
  extractedExperiences?: Array<Record<string, string>> | null;
  extractedEducation?: Array<Record<string, string>> | null;
  extractedLanguages?: string[] | null;
  extractedSummary?: string | null;
}): CvChunk[] {
  const chunks: CvChunk[] = [];

  // Add candidate name context to each chunk for better retrieval
  const namePrefix = cv.extractedName ? `Candidate: ${cv.extractedName}. ` : '';

  // Experience chunks (usually the most important)
  const expChunks = chunkExperiences(cv.extractedExperiences ?? null);
  expChunks.forEach(chunk => {
    chunk.chunkText = namePrefix + chunk.chunkText;
    chunk.tokenEstimate = estimateTokens(chunk.chunkText);
  });
  chunks.push(...expChunks);

  // Skills chunk
  const skillChunks = chunkSkills(cv.extractedSkills ?? null);
  skillChunks.forEach(chunk => {
    chunk.chunkText = namePrefix + chunk.chunkText;
    chunk.tokenEstimate = estimateTokens(chunk.chunkText);
  });
  chunks.push(...skillChunks);

  // Education chunks
  const eduChunks = chunkEducation(cv.extractedEducation ?? null);
  eduChunks.forEach(chunk => {
    chunk.chunkText = namePrefix + chunk.chunkText;
    chunk.tokenEstimate = estimateTokens(chunk.chunkText);
  });
  chunks.push(...eduChunks);

  // Summary chunk
  const summaryChunks = chunkSummary(cv.extractedSummary ?? null);
  summaryChunks.forEach(chunk => {
    chunk.chunkText = namePrefix + chunk.chunkText;
    chunk.tokenEstimate = estimateTokens(chunk.chunkText);
  });
  chunks.push(...summaryChunks);

  // Languages chunk
  const langChunks = chunkLanguages(cv.extractedLanguages ?? null);
  langChunks.forEach(chunk => {
    chunk.chunkText = namePrefix + chunk.chunkText;
    chunk.tokenEstimate = estimateTokens(chunk.chunkText);
  });
  chunks.push(...langChunks);

  return chunks;
}

/**
 * Delete all existing chunks for a CV.
 */
export async function deleteCvChunks(cvId: string): Promise<void> {
  await db.delete(cvChunks).where(eq(cvChunks.cvId, cvId));
}

/**
 * Generate and store chunks with embeddings for a CV.
 * This is the main entrypoint called after CV upload/extraction.
 */
export async function generateAndStoreCvChunks(cvId: string): Promise<number> {
  // 1. Fetch CV data
  const [cv] = await db
    .select({
      extractedName: cvPool.extractedName,
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedEducation: cvPool.extractedEducation,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
      uploadedBy: cvPool.uploadedBy,
    })
    .from(cvPool)
    .where(eq(cvPool.id, cvId));

  if (!cv) {
    console.error(`[chunking] CV not found: ${cvId}`);
    return 0;
  }

  // 2. Generate chunks
  const chunks = generateCvChunks(cv);
  if (chunks.length === 0) {
    console.warn(`[chunking] No chunks generated for CV: ${cvId}`);
    return 0;
  }

  // 3. Delete old chunks
  await deleteCvChunks(cvId);

  // 4. Generate embeddings in batch
  const texts = chunks.map(c => c.chunkText);
  const embeddings = await generateTextEmbeddingsBatch(texts, 'passage');

  // 5. Get next index version for this batch
  const newIndexVersion = await getNextIndexVersion();

  // 6. Insert new chunks with embeddings
  const chunkRecords = chunks.map((chunk, idx) => ({
    cvId,
    uploadedBy: cv.uploadedBy,
    sectionType: chunk.sectionType,
    sectionOrder: chunk.sectionOrder,
    chunkText: chunk.chunkText,
    tokenEstimate: chunk.tokenEstimate,
    embedding: embeddings[idx] ?? undefined,
    metadata: chunk.metadata,
    indexVersion: newIndexVersion,
  }));

  await db.insert(cvChunks).values(chunkRecords);

  // 7. Update searchVector for FTS using raw SQL
  // This generates tsvector from chunkText for each chunk
  await db.execute(sql`
    UPDATE cv_chunks 
    SET search_vector = to_tsvector('english', chunk_text)
    WHERE cv_id = ${cvId} AND search_vector IS NULL
  `);

  console.log(`[chunking] Created ${chunks.length} chunks (v${newIndexVersion}) for CV: ${cvId}`);
  return chunks.length;
}

/**
 * Get current index version for cache invalidation.
 * Returns the maximum version currently in the database, or 1 if no chunks exist.
 */
export async function getLatestIndexVersion(): Promise<number> {
  const result = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${cvChunks.indexVersion}), 1)` })
    .from(cvChunks);

  return result[0]?.maxVersion ?? 1;
}

/**
 * Get the next index version for new chunk batches.
 * Increments the latest version by 1.
 */
export async function getNextIndexVersion(): Promise<number> {
  const current = await getLatestIndexVersion();
  return current + 1;
}
