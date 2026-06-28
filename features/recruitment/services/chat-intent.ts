import { normalizeLookupText } from "./name-matching";

const GREETING_RE =
  /^(?:hi|hello|hey|yo|salam|slm|salam alaikom|salam alaykom|aslema|ahla|bonjour|bonsoir|good morning|good afternoon|good evening|thanks|thank you|thx)[!.?,\s]*$/i;

const EXPLICIT_COMPARE_RE =
  /\b(compare|versus|vs\.?|who is better|chkoun khir|7aseb el resume|حسب السيرة|حسب الresume|wela|ولا)\b/i;

const EXPLICIT_NAME_HINT_RE = /\bname\s*(?:is|=)\s+["']?([^"'\n,]+)["']?/i;

const ROLE_QUERY_STRIP_RE =
  /\b(i want|find me|search for|looking for|please|candidate|candidates|resume|resumes|cv|cvs|name is|name=|called|compare|versus|vs\.?|who is better|better|best|chkoun khir|khir|wela|7aseb el resume|haseb el resume)\b/gi;
const NON_CANDIDATE_COMPARE_REF_RE =
  /\b(action|actions|analytics?|chart|charts|dashboard|demand|diagram|funnel|ghalta|gap|job|jobs|lobb|pipeline|pool|skill|skills|statistics?|stats|supply)\b/i;

export type ChatIntent = "greeting" | "compare" | "named_search" | "agent";

export interface ClassifiedChatIntent {
  intent: ChatIntent;
  candidateRefs?: string[];
  requestedName?: string;
  targetRoleQuery?: string;
}

export function classifyChatIntent(
  message: string,
  hasAttachments: boolean = false,
): ClassifiedChatIntent {
  const raw = String(message ?? "").trim();
  const normalized = normalizeLookupText(raw);

  if (!normalized || hasAttachments) {
    return { intent: "agent" };
  }

  if (GREETING_RE.test(raw)) {
    return { intent: "greeting" };
  }

  if (EXPLICIT_COMPARE_RE.test(normalized)) {
    const candidateRefs = extractCompareCandidateRefs(raw);
    return {
      intent: candidateRefs.length >= 2 ? "compare" : "agent",
      candidateRefs: candidateRefs.length >= 2 ? candidateRefs : undefined,
      targetRoleQuery: extractRoleQuery(raw),
    };
  }

  const explicitName = extractExplicitName(raw);
  if (explicitName) {
    return {
      intent: "named_search",
      requestedName: explicitName,
      targetRoleQuery: extractRoleQuery(raw),
    };
  }

  return { intent: "agent" };
}

function extractExplicitName(input: string): string | undefined {
  const match = input.match(EXPLICIT_NAME_HINT_RE);
  if (match?.[1]) {
    return sanitizeReference(match[1]);
  }

  const normalized = normalizeLookupText(input);
  const calledMatch = normalized.match(/\bcalled\s+(.+)$/);
  if (calledMatch?.[1]) {
    return sanitizeReference(calledMatch[1]);
  }

  return undefined;
}

function extractCompareCandidateRefs(input: string): string[] {
  const normalized = normalizeLookupText(input);
  const working = normalized
    .replace(/\bwho is better\b/g, " ")
    .replace(/\bcompare\b/g, " ")
    .replace(/\bversus\b/g, "|")
    .replace(/\bvs\b/g, "|")
    .replace(/\bbetter\b/g, " ")
    .replace(/\bbest\b/g, " ")
    .replace(/\bkhir\b/g, " ")
    .replace(/\bwela\b/g, "|")
    .replace(/\bولا\b/g, "|")
    .replace(/\b7aseb el resume\b/g, " ")
    .replace(/\bhaseb el resume\b/g, " ")
    .replace(/\bresume\b/g, " ")
    .replace(/\bcv\b/g, " ");

  const separators = ["|", " and ", " or ", ","];
  for (const separator of separators) {
    if (working.includes(separator)) {
      const parts = working
        .split(separator)
        .map((part) => sanitizeReference(part))
        .filter(isLikelyCandidateReference);
      if (parts.length >= 2) {
        return parts.slice(0, 5);
      }
    }
  }

  return [];
}

function isLikelyCandidateReference(input: string): boolean {
  const normalized = normalizeLookupText(input);
  if (!normalized || NON_CANDIDATE_COMPARE_REF_RE.test(normalized)) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4;
}

function sanitizeReference(input: string): string {
  return String(input ?? "")
    .replace(/["'`]+/g, "")
    .replace(
      /\b(please|resume|resumes|cv|cvs|candidate|candidates|for|job|role)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractRoleQuery(input: string): string | undefined {
  const explicitName = extractExplicitName(input);
  let cleaned = input;

  if (explicitName) {
    cleaned = cleaned.replace(EXPLICIT_NAME_HINT_RE, " ");
  }

  cleaned = cleaned
    .replace(/["'`]/g, " ")
    .replace(ROLE_QUERY_STRIP_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned : undefined;
}
