import { z } from 'zod';
import { callOpenRouter, cleanJsonResponse } from './ai';

// ---------------------------------------------------------------------------
// Query Rewrite Service - Phase 2 RAG
// Normalizes user queries for better retrieval
// ---------------------------------------------------------------------------

/**
 * Rewritten query structure for retrieval pipeline.
 */
export const rewrittenQuerySchema = z.object({
  semanticQuery: z.string().describe('Normalized query for vector embedding'),
  lexicalKeywords: z.array(z.string()).describe('Keywords for text search'),
  filters: z.object({
    seniority: z.string().optional(),
    languages: z.array(z.string()).optional(),
    minExperienceYears: z.number().optional(),
    skills: z.array(z.string()).optional(),
  }).optional(),
});

export type RewrittenQuery = z.infer<typeof rewrittenQuerySchema>;

const REWRITE_SYSTEM_PROMPT = `You are a query rewriter for a recruitment CV search system.

Given a user's search query, extract and normalize it into structured components for retrieval.

Rules:
1. semanticQuery: Rewrite the query as a clear, searchable statement. Remove filler words. Focus on skills, roles, and requirements.
2. lexicalKeywords: Extract specific technical terms, job titles, company types, and skills that should be matched exactly.
3. filters: Extract any explicit constraints:
   - seniority: "junior", "mid", "senior", "lead", "principal" (if mentioned)
   - languages: Spoken languages like "French", "English" (if mentioned)
   - minExperienceYears: Number of years experience (if mentioned)
   - skills: Specific technical skills to filter by (if mentioned)

Return ONLY valid JSON matching this schema:
{
  "semanticQuery": "string",
  "lexicalKeywords": ["string"],
  "filters": {
    "seniority": "string or omit",
    "languages": ["string"] or omit,
    "minExperienceYears": number or omit,
    "skills": ["string"] or omit
  }
}

Examples:
- "Find me Java developers with 5+ years" -> {"semanticQuery": "Java developer with extensive experience", "lexicalKeywords": ["Java", "developer"], "filters": {"minExperienceYears": 5}}
- "Senior React engineers who speak French" -> {"semanticQuery": "Senior React engineer", "lexicalKeywords": ["React", "engineer", "frontend"], "filters": {"seniority": "senior", "languages": ["French"]}}
- "Anyone good at machine learning" -> {"semanticQuery": "Machine learning engineer or data scientist", "lexicalKeywords": ["machine learning", "ML", "AI", "data science"], "filters": {}}`;

/**
 * Rewrite a user query into structured retrieval components.
 * Uses LLM with deterministic settings for consistent output.
 */
export async function rewriteQuery(query: string): Promise<RewrittenQuery> {
  const trimmed = query.trim();
  
  if (!trimmed || trimmed.length < 3) {
    return {
      semanticQuery: trimmed,
      lexicalKeywords: trimmed.split(/\s+/).filter(w => w.length > 2),
      filters: undefined,
    };
  }

  try {
    const response = await callOpenRouter(
      REWRITE_SYSTEM_PROMPT,
      `Rewrite this search query: "${trimmed}"`,
      'structured'
    );

    const cleaned = cleanJsonResponse(response);
    const parsed = JSON.parse(cleaned);
    const validated = rewrittenQuerySchema.parse(parsed);

    return validated;
  } catch (error) {
    console.warn('[query-rewrite] Failed to rewrite query, using fallback:', error);
    
    // Fallback: simple keyword extraction
    const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return {
      semanticQuery: trimmed,
      lexicalKeywords: words.slice(0, 10),
      filters: undefined,
    };
  }
}

/**
 * Simple query normalization without LLM (for caching/comparison).
 */
export function normalizeQueryForCache(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

/**
 * Extract skills from a query using simple pattern matching.
 * Used as fallback when LLM rewrite is unavailable.
 */
export function extractKeywordsSimple(query: string): string[] {
  const techTerms = [
    'java', 'python', 'javascript', 'typescript', 'react', 'angular', 'vue',
    'node', 'nodejs', 'express', 'django', 'flask', 'spring', 'springboot',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'k8s', 'terraform',
    'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
    'machine learning', 'ml', 'ai', 'deep learning', 'nlp', 'computer vision',
    'devops', 'ci/cd', 'jenkins', 'github actions', 'gitlab',
    'agile', 'scrum', 'kanban', 'jira',
    'frontend', 'backend', 'fullstack', 'full-stack', 'full stack',
    'api', 'rest', 'graphql', 'microservices',
    'senior', 'junior', 'lead', 'principal', 'architect',
  ];

  const lowerQuery = query.toLowerCase();
  const found: string[] = [];

  for (const term of techTerms) {
    if (lowerQuery.includes(term)) {
      found.push(term);
    }
  }

  // Also add individual words longer than 3 chars
  const words = lowerQuery.split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    if (!found.includes(word) && !['find', 'show', 'search', 'looking', 'need', 'want', 'with', 'from', 'have', 'good', 'best'].includes(word)) {
      found.push(word);
    }
  }

  return [...new Set(found)].slice(0, 15);
}
