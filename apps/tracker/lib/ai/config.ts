/** AI drafting settings (ADR 0026). The feature is off unless a key is set. */
export const AI_MODEL = "claude-opus-5-5";
export const AI_EFFORT = "medium" as const;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
