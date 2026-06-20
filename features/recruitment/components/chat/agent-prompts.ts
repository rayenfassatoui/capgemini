export function buildAgentPromptHref(prompt: string): string {
  return `/agent?prompt=${encodeURIComponent(prompt)}`;
}
