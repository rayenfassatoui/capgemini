export type AgentReferenceType = "cv";

export interface AgentReferenceFact {
  label: string;
  value: string;
}

export interface AgentReference {
  type: AgentReferenceType;
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  facts?: AgentReferenceFact[];
}

const MAX_REFERENCE_FACTS = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function normalizeReferenceFact(value: unknown): AgentReferenceFact | null {
  if (!isRecord(value)) return null;

  const label = normalizeText(value.label, 40);
  const factValue = normalizeText(value.value, 160);

  if (!label || !factValue) return null;

  return { label, value: factValue };
}

export function parseAgentReferenceParam(value: string | null): AgentReference | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.type !== "cv") return null;

    const id = normalizeText(parsed.id, 80);
    const title = normalizeText(parsed.title, 120);
    if (!id || !title) return null;

    const subtitle = normalizeText(parsed.subtitle, 160);
    const href = normalizeText(parsed.href, 300);
    const facts = Array.isArray(parsed.facts)
      ? parsed.facts
          .slice(0, MAX_REFERENCE_FACTS)
          .map(normalizeReferenceFact)
          .filter((fact): fact is AgentReferenceFact => fact !== null)
      : undefined;

    return {
      type: "cv",
      id,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(href ? { href } : {}),
      ...(facts && facts.length > 0 ? { facts } : {}),
    };
  } catch {
    return null;
  }
}

export function buildAgentPromptHref(
  prompt: string,
  reference?: AgentReference | null,
): string {
  const params = new URLSearchParams({ prompt });

  if (reference) {
    params.set("reference", JSON.stringify(reference));
  }

  return `/agent?${params.toString()}`;
}
