/**
 * Iris's draft call (REQ-44, tracker ADR 0063), built like classify.ts: one
 * Anthropic call with a Zod output format, the server-side refusal fallback
 * and a fixed map of short errors. Writes nothing; the draft step records the
 * call. Never returns or logs a response body or an error message from the API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_EFFORT, AI_MODEL } from "../ai/config";

/** No length limits in the wire schema: the answer is checked after parse instead. */
export const DraftWire = z.object({
  body: z.string(),
  needs_charlie: z.boolean(),
  reason: z.string(),
});

export const DRAFT_ERRORS = {
  refused: "The AI declined to draft this reply.",
  cutOff: "The AI draft was cut off.",
  unreadable: "The AI draft could not be read.",
  empty: "The AI draft was empty or too long.",
  auth: "AI is not set up correctly (API key).",
  busy: "The AI is busy.",
  api: "The AI could not draft this right now.",
  network: "Could not reach the AI.",
  aborted: "Stopped at the run's time limit.",
} as const;

const BODY_MAX = 3000;
const REASON_CHARS = 200;

/** reason lives in memory for the run only; nothing stores it. */
export type DraftOutput = { body: string; needsCharlie: boolean; reason: string };
export type DraftAnswer =
  | { ok: true; output: DraftOutput; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; outcome: "refused" | "error"; error: string; model: string | null; aborted: boolean };
export type DraftPrompt = { system: string; user: string };
export type DraftPort = (prompt: DraftPrompt, signal?: AbortSignal) => Promise<DraftAnswer>;
export type DraftClient = Pick<Anthropic, "beta">;

const failed = (error: string, model: string | null = null, outcome: "refused" | "error" = "error", aborted = false): DraftAnswer => ({ ok: false, outcome, error, model, aborted });

export async function draftReply(prompt: DraftPrompt, signal?: AbortSignal, client: DraftClient = new Anthropic({ maxRetries: 2, timeout: 30_000 })): Promise<DraftAnswer> {
  try {
    const response = await client.beta.messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 2000,
        // Refusal fallback chosen by the server (claude-api guidance).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: AI_EFFORT, format: betaZodOutputFormat(DraftWire) },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") return failed(DRAFT_ERRORS.refused, response.model, "refused");
    if (response.stop_reason === "max_tokens") return failed(DRAFT_ERRORS.cutOff, response.model);
    const w = response.parsed_output;
    if (!w) return failed(DRAFT_ERRORS.unreadable, response.model);
    const body = w.body.trim();
    if (body.length === 0 || body.length > BODY_MAX) return failed(DRAFT_ERRORS.empty, response.model);
    const output: DraftOutput = { body, needsCharlie: w.needs_charlie, reason: w.reason.slice(0, REASON_CHARS) };
    return { ok: true, output, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  } catch (error) {
    // The subclasses first: an abort and a connection error are APIErrors too.
    if (error instanceof Anthropic.APIUserAbortError) return failed(DRAFT_ERRORS.aborted, null, "error", true);
    if (error instanceof Anthropic.APIConnectionError) return failed(DRAFT_ERRORS.network);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return failed(DRAFT_ERRORS.auth);
    if (error instanceof Anthropic.RateLimitError) return failed(DRAFT_ERRORS.busy);
    if (error instanceof Anthropic.APIError) {
      // The status only: an API message can echo the request, which holds parent text.
      console.error(`Iris draft failed (${error.status})`);
      return failed(DRAFT_ERRORS.api);
    }
    console.error("Iris draft failed (no status)");
    return failed(DRAFT_ERRORS.api);
  }
}
