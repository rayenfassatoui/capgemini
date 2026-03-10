import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cvPool } from '@/db/schema';
import { cvExtractionSchema, uploadCvSchema } from '../schemas';
import type { CvExtractionResult, UploadCvInput } from '../types';
import { callOpenRouter, cleanJsonResponse } from './ai';
import { aiCvExtractionOutputSchema } from '../schemas';

export async function uploadCv(input: UploadCvInput, userId: string) {
  const validated = uploadCvSchema.parse(input);
  const [cv] = await db
    .insert(cvPool)
    .values({
      filename: validated.filename,
      contentType: validated.contentType,
      size: validated.size,
      rawText: validated.rawText ?? null,
      rawBytes: validated.rawBytes ?? null,
      uploadedBy: userId,
    })
    .returning();

  return cv;
}

export async function parseCvDocument(
  filename: string,
  contentType: string,
  rawBytes: string
): Promise<string> {
  const buffer = Buffer.from(rawBytes, 'base64');

  if (contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (
    contentType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.toLowerCase().endsWith('.docx')
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString('utf-8');
}

export async function extractCvDataWithAI(text: string): Promise<CvExtractionResult> {
  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences. Return strictly valid JSON.';

  const userPrompt = `Extract structured candidate data from the CV text. Return JSON with fields:
name (string or null), email (string or null), phone (string or null), skills (string[]),
experiences (array of objects with title, company, duration), education (array of objects with degree, school, year),
languages (string[]), summary (string or null).

CV TEXT:
${text}`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = aiCvExtractionOutputSchema.parse(JSON.parse(cleanJsonResponse(content)));

  return {
    extractedName: parsed.name ?? null,
    extractedEmail: parsed.email ?? null,
    extractedPhone: parsed.phone ?? null,
    extractedSkills: parsed.skills,
    extractedExperiences: parsed.experiences,
    extractedEducation: parsed.education,
    extractedLanguages: parsed.languages,
    extractedSummary: parsed.summary ?? null,
  };
}

export async function updateCvExtraction(cvId: string, extraction: CvExtractionResult) {
  const validated = cvExtractionSchema.parse(extraction);
  const [updated] = await db
    .update(cvPool)
    .set({
      extractedName: validated.extractedName ?? null,
      extractedEmail: validated.extractedEmail ?? null,
      extractedPhone: validated.extractedPhone ?? null,
      extractedSkills: validated.extractedSkills,
      extractedExperiences: validated.extractedExperiences,
      extractedEducation: validated.extractedEducation,
      extractedLanguages: validated.extractedLanguages,
      extractedSummary: validated.extractedSummary ?? null,
    })
    .where(eq(cvPool.id, cvId))
    .returning();

  return updated;
}

export async function updateCvRawText(cvId: string, rawText: string) {
  const [updated] = await db
    .update(cvPool)
    .set({ rawText })
    .where(eq(cvPool.id, cvId))
    .returning();

  return updated;
}

export async function listCvPool(userId: string) {
  return db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      contentType: cvPool.contentType,
      size: cvPool.size,
      rawText: cvPool.rawText,
      rawBytes: cvPool.rawBytes,
      extractedName: cvPool.extractedName,
      extractedEmail: cvPool.extractedEmail,
      extractedPhone: cvPool.extractedPhone,
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedEducation: cvPool.extractedEducation,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
      uploadedBy: cvPool.uploadedBy,
      createdAt: cvPool.createdAt,
    })
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId))
    .orderBy(desc(cvPool.createdAt));
}

export async function deleteCv(cvId: string, userId: string) {
  await db
    .delete(cvPool)
    .where(and(eq(cvPool.id, cvId), eq(cvPool.uploadedBy, userId)));
}

export async function getCvDetails(cvId: string) {
  const [cv] = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      contentType: cvPool.contentType,
      size: cvPool.size,
      rawText: cvPool.rawText,
      rawBytes: cvPool.rawBytes,
      extractedName: cvPool.extractedName,
      extractedEmail: cvPool.extractedEmail,
      extractedPhone: cvPool.extractedPhone,
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedEducation: cvPool.extractedEducation,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
      uploadedBy: cvPool.uploadedBy,
      createdAt: cvPool.createdAt,
    })
    .from(cvPool)
    .where(eq(cvPool.id, cvId));
  return cv ?? null;
}

export async function getCvFile(cvId: string) {
  const [cv] = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      contentType: cvPool.contentType,
      rawBytes: cvPool.rawBytes,
    })
    .from(cvPool)
    .where(eq(cvPool.id, cvId));

  return cv ?? null;
}

export interface SearchCvPoolFilters {
  skills?: string[];
  languages?: string[];
  minExperience?: number;
  location?: string;
}

export async function searchCvPool(userId: string, filters: SearchCvPoolFilters) {
  const allCvs = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      contentType: cvPool.contentType,
      size: cvPool.size,
      rawText: cvPool.rawText,
      rawBytes: cvPool.rawBytes,
      extractedName: cvPool.extractedName,
      extractedEmail: cvPool.extractedEmail,
      extractedPhone: cvPool.extractedPhone,
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedEducation: cvPool.extractedEducation,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
      uploadedBy: cvPool.uploadedBy,
      createdAt: cvPool.createdAt,
    })
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId))
    .orderBy(desc(cvPool.createdAt));

  return allCvs.filter((cv) => {
    const cvSkills = (cv.extractedSkills ?? []).map((s) => s.toLowerCase());
    const cvLangs = (cv.extractedLanguages ?? []).map((l) => l.toLowerCase());
    const cvExpCount = (cv.extractedExperiences ?? []).length;
    const cvText = [
      cv.extractedSummary ?? '',
      ...(cv.extractedExperiences ?? []).map((e) => Object.values(e).join(' ')),
      ...(cv.extractedEducation ?? []).map((e) => Object.values(e).join(' ')),
    ]
      .join(' ')
      .toLowerCase();

    if (filters.skills && filters.skills.length > 0) {
      const wantedSkills = filters.skills.map((s) => s.toLowerCase());
      const hasSkill = wantedSkills.some((ws) =>
        cvSkills.some((cs) => cs.includes(ws) || ws.includes(cs))
      );
      if (!hasSkill) return false;
    }

    if (filters.languages && filters.languages.length > 0) {
      const wantedLangs = filters.languages.map((l) => l.toLowerCase());
      const hasLang = wantedLangs.some((wl) =>
        cvLangs.some((cl) => cl.includes(wl) || wl.includes(cl))
      );
      if (!hasLang) return false;
    }

    if (filters.minExperience && filters.minExperience > 0) {
      if (cvExpCount < filters.minExperience) return false;
    }

    if (filters.location && filters.location.trim()) {
      const loc = filters.location.toLowerCase();
      if (!cvText.includes(loc)) return false;
    }

    return true;
  });
}

/**
 * Generate and store a semantic embedding for a CV.
 * This should be called after rawText has been saved to the database.
 * Failures are logged but do not throw — embedding is non-critical.
 */
export async function generateCvEmbeddingAfterUpload(cvId: string): Promise<boolean> {
  try {
    const { generateAndStoreCvEmbedding } = await import('./embeddings');
    const embedding = await generateAndStoreCvEmbedding(cvId);
    return embedding !== null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cv-pool] Failed to generate embedding for CV ${cvId}: ${message}`);
    return false;
  }
}
