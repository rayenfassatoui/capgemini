import { db } from '@/lib/db';
import { cvPool } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// NVIDIA NV-EmbedQA E5 V5 — Embedding Service
// ---------------------------------------------------------------------------

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/embeddings';
const NVIDIA_MODEL_ID = 'nvidia/nv-embedqa-e5-v5';
export const EMBEDDING_DIMENSIONS = 1024;
const MAX_RETRIES = 3;

/** Approximate token count heuristic (1 token ~ 4 chars). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within the 512-token context window of E5 V5.
 * Uses a conservative 4-chars-per-token heuristic and leaves a small margin.
 */
function truncateToTokenLimit(text: string, maxTokens = 480): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

interface NvidiaEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generate a text embedding using NVIDIA NV-EmbedQA E5 V5 (1024 dimensions).
 *
 * @param text       - The text to embed.
 * @param inputType  - `"passage"` for documents/CVs (index time),
 *                     `"query"` for search queries (query time).
 * @returns A 1024-dimensional float array, or `null` if embedding fails.
 */
export async function generateTextEmbedding(
  text: string,
  inputType: 'query' | 'passage'
): Promise<number[] | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('[embeddings] NVIDIA_API_KEY is not set — skipping embedding generation');
    return null;
  }

  const cleanedText = text.trim();
  if (!cleanedText) {
    console.warn('[embeddings] Empty text provided — skipping embedding generation');
    return null;
  }

  const truncatedText = truncateToTokenLimit(cleanedText);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          input: [truncatedText],
          model: NVIDIA_MODEL_ID,
          input_type: inputType,
          encoding_format: 'float',
          truncate: 'END',
        }),
      });

      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(
          `[embeddings] Rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `[embeddings] NVIDIA API error ${response.status}: ${errorBody}`
        );
        return null;
      }

      const data = (await response.json()) as NvidiaEmbeddingResponse;

      if (!data.data?.[0]?.embedding) {
        console.error('[embeddings] Unexpected response shape:', JSON.stringify(data).slice(0, 200));
        return null;
      }

      const embedding = data.data[0].embedding;

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        console.error(
          `[embeddings] Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`
        );
        return null;
      }

      return embedding;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[embeddings] Network error (attempt ${attempt + 1}/${MAX_RETRIES}): ${message}`
      );

      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  console.error(`[embeddings] Exhausted ${MAX_RETRIES} retries — returning null`);
  return null;
}

/**
 * Generate multiple embeddings in a single API call (batch).
 * Useful for bulk-indexing existing CVs.
 *
 * @param texts     - Array of texts to embed (max ~16 per batch for trial API).
 * @param inputType - `"passage"` for documents, `"query"` for search queries.
 * @returns Array of embeddings (or null for failed items), same order as input.
 */
export async function generateTextEmbeddingsBatch(
  texts: string[],
  inputType: 'query' | 'passage'
): Promise<(number[] | null)[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('[embeddings] NVIDIA_API_KEY is not set — skipping batch embedding');
    return texts.map(() => null);
  }

  const cleanedTexts = texts.map((t) => truncateToTokenLimit(t.trim()));
  const nonEmpty = cleanedTexts.filter((t) => t.length > 0);

  if (nonEmpty.length === 0) {
    return texts.map(() => null);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          input: nonEmpty,
          model: NVIDIA_MODEL_ID,
          input_type: inputType,
          encoding_format: 'float',
          truncate: 'END',
        }),
      });

      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[embeddings] Batch error ${response.status}: ${errorBody}`);
        return texts.map(() => null);
      }

      const data = (await response.json()) as NvidiaEmbeddingResponse;

      // Sort by index to guarantee order
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      const embeddings = sorted.map((d) => d.embedding);

      // Map back to original array positions (accounting for empty strings)
      const result: (number[] | null)[] = [];
      let embIdx = 0;
      for (const cleaned of cleanedTexts) {
        if (cleaned.length > 0 && embIdx < embeddings.length) {
          result.push(embeddings[embIdx]);
          embIdx++;
        } else {
          result.push(null);
        }
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[embeddings] Batch network error (attempt ${attempt + 1}/${MAX_RETRIES}): ${message}`);

      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  return texts.map(() => null);
}

/**
 * Build a composite text representation of a CV for embedding.
 * Combines the most semantically meaningful fields into a single passage.
 */
export function buildCvEmbeddingText(cv: {
  rawText?: string | null;
  extractedName?: string | null;
  extractedSkills?: string[] | null;
  extractedExperiences?: Array<Record<string, string>> | null;
  extractedEducation?: Array<Record<string, string>> | null;
  extractedLanguages?: string[] | null;
  extractedSummary?: string | null;
}): string {
  // Prefer rawText if available as it captures the full context
  if (cv.rawText && cv.rawText.trim().length > 100) {
    return cv.rawText.trim();
  }

  // Fallback: compose from extracted structured fields
  const parts: string[] = [];

  if (cv.extractedName) {
    parts.push(`Name: ${cv.extractedName}`);
  }

  if (cv.extractedSummary) {
    parts.push(`Summary: ${cv.extractedSummary}`);
  }

  if (cv.extractedSkills && cv.extractedSkills.length > 0) {
    parts.push(`Skills: ${cv.extractedSkills.join(', ')}`);
  }

  if (cv.extractedExperiences && cv.extractedExperiences.length > 0) {
    const expLines = cv.extractedExperiences
      .map((e) => Object.values(e).join(' at '))
      .join('; ');
    parts.push(`Experience: ${expLines}`);
  }

  if (cv.extractedEducation && cv.extractedEducation.length > 0) {
    const eduLines = cv.extractedEducation
      .map((e) => Object.values(e).join(' at '))
      .join('; ');
    parts.push(`Education: ${eduLines}`);
  }

  if (cv.extractedLanguages && cv.extractedLanguages.length > 0) {
    parts.push(`Languages: ${cv.extractedLanguages.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Generate and store an embedding for a specific CV in the database.
 * This is the main entrypoint called after CV parsing/extraction.
 *
 * @returns The embedding array, or null if generation failed.
 */
export async function generateAndStoreCvEmbedding(cvId: string): Promise<number[] | null> {
  const [cv] = await db
    .select({
      rawText: cvPool.rawText,
      extractedName: cvPool.extractedName,
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedEducation: cvPool.extractedEducation,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
    })
    .from(cvPool)
    .where(eq(cvPool.id, cvId));

  if (!cv) {
    console.error(`[embeddings] CV not found: ${cvId}`);
    return null;
  }

  const text = buildCvEmbeddingText(cv);
  if (!text || text.trim().length < 10) {
    console.warn(`[embeddings] CV ${cvId} has insufficient text for embedding`);
    return null;
  }

  const embedding = await generateTextEmbedding(text, 'passage');

  if (embedding) {
    await db
      .update(cvPool)
      .set({ embedding })
      .where(eq(cvPool.id, cvId));
  }

  return embedding;
}
