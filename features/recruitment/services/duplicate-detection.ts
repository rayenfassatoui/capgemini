import { db } from '@/lib/db';
import { cvPool } from '@/db/schema';
import { eq, ne, and } from 'drizzle-orm';

export interface DuplicateMatch {
  cvId: string;
  filename: string;
  extractedName: string | null;
  extractedEmail: string | null;
  extractedPhone: string | null;
  matchReasons: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Normalize a name for comparison: lowercase, trim, collapse whitespace,
 * strip diacritics, remove common prefixes/suffixes.
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // keep only letters and spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a phone number to just digits for comparison.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '').replace(/^0+/, '');
}

/**
 * Simple similarity ratio between two strings (0-1).
 * Uses longest common subsequence length / max length.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const lenA = a.length;
  const lenB = b.length;

  // Quick check: if lengths differ by more than 50%, likely not a match
  if (Math.abs(lenA - lenB) > Math.max(lenA, lenB) * 0.5) return 0;

  // Compute Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[lenA][lenB];
  return 1 - distance / Math.max(lenA, lenB);
}

/**
 * Check a single CV against the existing pool for duplicates.
 * Call this AFTER extraction is saved (so we have name/email/phone).
 */
export async function checkDuplicateCv(
  cvId: string,
  userId: string
): Promise<DuplicateMatch[]> {
  const [target] = await db.select({
    id: cvPool.id,
    extractedName: cvPool.extractedName,
    extractedEmail: cvPool.extractedEmail,
    extractedPhone: cvPool.extractedPhone,
  }).from(cvPool).where(eq(cvPool.id, cvId));
  if (!target) return [];

  const existing = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      extractedName: cvPool.extractedName,
      extractedEmail: cvPool.extractedEmail,
      extractedPhone: cvPool.extractedPhone,
    })
    .from(cvPool)
    .where(and(eq(cvPool.uploadedBy, userId), ne(cvPool.id, cvId)));

  const targetEmail = target.extractedEmail?.toLowerCase().trim() ?? '';
  const targetName = normalizeName(target.extractedName ?? '');
  const targetPhone = normalizePhone(target.extractedPhone ?? '');

  const matches: DuplicateMatch[] = [];

  for (const cv of existing) {
    const reasons: string[] = [];
    let bestConfidence: 'high' | 'medium' | 'low' = 'low';

    // Email match (strongest signal)
    const cvEmail = cv.extractedEmail?.toLowerCase().trim() ?? '';
    if (targetEmail && cvEmail && targetEmail === cvEmail) {
      reasons.push(`Same email: ${cvEmail}`);
      bestConfidence = 'high';
    }

    // Name similarity
    const cvName = normalizeName(cv.extractedName ?? '');
    if (targetName && cvName) {
      const sim = similarity(targetName, cvName);
      if (sim === 1) {
        reasons.push(`Exact name match: ${cv.extractedName}`);
        bestConfidence = bestConfidence === 'high' ? 'high' : 'high';
      } else if (sim >= 0.85) {
        reasons.push(`Similar name (${Math.round(sim * 100)}%): ${cv.extractedName}`);
        if (bestConfidence === 'low') bestConfidence = 'medium';
      }
    }

    // Phone match
    const cvPhone = normalizePhone(cv.extractedPhone ?? '');
    if (targetPhone && cvPhone && targetPhone.length >= 6 && cvPhone.length >= 6) {
      if (targetPhone === cvPhone || targetPhone.endsWith(cvPhone) || cvPhone.endsWith(targetPhone)) {
        reasons.push(`Same phone: ${cv.extractedPhone}`);
        if (bestConfidence === 'low') bestConfidence = 'medium';
      }
    }

    if (reasons.length > 0) {
      matches.push({
        cvId: cv.id,
        filename: cv.filename,
        extractedName: cv.extractedName,
        extractedEmail: cv.extractedEmail,
        extractedPhone: cv.extractedPhone,
        matchReasons: reasons,
        confidence: bestConfidence,
      });
    }
  }

  // Sort by confidence (high first) then by number of match reasons
  const order = { high: 0, medium: 1, low: 2 };
  matches.sort((a, b) => order[a.confidence] - order[b.confidence] || b.matchReasons.length - a.matchReasons.length);

  return matches;
}

/**
 * Scan the entire CV pool for a user and find all duplicate groups.
 * Returns groups of CVs that appear to be the same person.
 */
export async function scanPoolForDuplicates(userId: string): Promise<
  Array<{
    group: Array<{
      cvId: string;
      filename: string;
      extractedName: string | null;
      extractedEmail: string | null;
    }>;
    matchReasons: string[];
    confidence: 'high' | 'medium' | 'low';
  }>
> {
  const allCvs = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      extractedName: cvPool.extractedName,
      extractedEmail: cvPool.extractedEmail,
      extractedPhone: cvPool.extractedPhone,
    })
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId));

  // Union-find for grouping
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const pairReasons = new Map<string, { reasons: string[]; confidence: 'high' | 'medium' | 'low' }>();

  for (let i = 0; i < allCvs.length; i++) {
    for (let j = i + 1; j < allCvs.length; j++) {
      const a = allCvs[i];
      const b = allCvs[j];
      const reasons: string[] = [];
      let conf: 'high' | 'medium' | 'low' = 'low';

      const emailA = a.extractedEmail?.toLowerCase().trim() ?? '';
      const emailB = b.extractedEmail?.toLowerCase().trim() ?? '';
      if (emailA && emailB && emailA === emailB) {
        reasons.push(`Same email: ${emailA}`);
        conf = 'high';
      }

      const nameA = normalizeName(a.extractedName ?? '');
      const nameB = normalizeName(b.extractedName ?? '');
      if (nameA && nameB) {
        const sim = similarity(nameA, nameB);
        if (sim >= 0.85) {
          reasons.push(`Name match (${Math.round(sim * 100)}%): "${a.extractedName}" / "${b.extractedName}"`);
          if (sim === 1 || conf === 'high') conf = 'high';
          else conf = 'medium';
        }
      }

      const phoneA = normalizePhone(a.extractedPhone ?? '');
      const phoneB = normalizePhone(b.extractedPhone ?? '');
      if (phoneA && phoneB && phoneA.length >= 6 && phoneB.length >= 6) {
        if (phoneA === phoneB || phoneA.endsWith(phoneB) || phoneB.endsWith(phoneA)) {
          reasons.push(`Same phone`);
          if (conf === 'low') conf = 'medium';
        }
      }

      if (reasons.length > 0) {
        union(a.id, b.id);
        const key = [a.id, b.id].sort().join('|');
        pairReasons.set(key, { reasons, confidence: conf });
      }
    }
  }

  // Build groups from union-find
  const groups = new Map<string, typeof allCvs>();
  for (const cv of allCvs) {
    const root = find(cv.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(cv);
  }

  const result: Array<{
    group: Array<{
      cvId: string;
      filename: string;
      extractedName: string | null;
      extractedEmail: string | null;
    }>;
    matchReasons: string[];
    confidence: 'high' | 'medium' | 'low';
  }> = [];

  for (const members of groups.values()) {
    if (members.length < 2) continue;

    // Collect all reasons for this group
    const allReasons: string[] = [];
    let bestConf: 'high' | 'medium' | 'low' = 'low';
    const confOrder = { high: 0, medium: 1, low: 2 };

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = [members[i].id, members[j].id].sort().join('|');
        const pr = pairReasons.get(key);
        if (pr) {
          allReasons.push(...pr.reasons);
          if (confOrder[pr.confidence] < confOrder[bestConf]) {
            bestConf = pr.confidence;
          }
        }
      }
    }

    result.push({
      group: members.map((m) => ({
        cvId: m.id,
        filename: m.filename,
        extractedName: m.extractedName,
        extractedEmail: m.extractedEmail,
      })),
      matchReasons: [...new Set(allReasons)],
      confidence: bestConf,
    });
  }

  // Sort by confidence
  const order = { high: 0, medium: 1, low: 2 };
  result.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return result;
}
