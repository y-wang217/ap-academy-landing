/**
 * Iris's one model call (REQ-43), built like lib/ai/draft.ts: one Anthropic
 * call with a Zod output format, the server-side refusal fallback and a fixed
 * map of short errors. Writes nothing; the classify step records the call.
 * Never returns or logs a response body or an error message from the API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_MODEL } from "../ai/config";
import { CLASSIFIER_INTENTS, FLAGS } from "./policy";
import type { Classification } from "./route";

/** No range or length limits in the wire schema: the answer is clamped after parse instead. */
export const ClassifyWire = z.object({
  intents: z.array(z.enum(CLASSIFIER_INTENTS)),
  primary: z.enum(CLASSIFIER_INTENTS),
  confidence: z.number(),
  flags: z.array(z.enum(FLAGS)),
  child_name: z.string(),
  summary: z.string(),
});

export const CLASSIFY_ERRORS = {
  refused: "The AI declined this message.",
  cutOff: "The AI answer was cut off.",
  unreadable: "The AI answer could not be read.",
  auth: "AI is not set up correctly (API key).",
  busy: "The AI is busy.",
  api: "The AI could not classify this right now.",
  network: "Could not reach the AI.",
  aborted: "Stopped at the run's time limit.",
} as const;

const MAX_INTENTS = 4;
const SUMMARY_CHARS = 200;

/** summary lives in memory for the run only; nothing stores it. */
export type ClassifyOutput = Classification & { summary: string };
export type ClassifyAnswer =
  | { ok: true; output: ClassifyOutput; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; outcome: "refused" | "error"; error: string; model: string | null; aborted: boolean };
export type ClassifyPrompt = { system: string; user: string };
export type ClassifyPort = (prompt: ClassifyPrompt, signal?: AbortSignal) => Promise<ClassifyAnswer>;
export type ClassifyClient = Pick<Anthropic, "beta">;

const failed = (error: string, model: string | null = null, outcome: "refused" | "error" = "error", aborted = false): ClassifyAnswer => ({ ok: false, outcome, error, model, aborted });

export async function classifyMessage(prompt: ClassifyPrompt, signal?: AbortSignal, client: ClassifyClient = new Anthropic({ maxRetries: 2, timeout: 20_000 })): Promise<ClassifyAnswer> {
  try {
    const response = await client.beta.messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 2000,
        // Refusal fallback chosen by the server (claude-api guidance).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(ClassifyWire) },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") return failed(CLASSIFY_ERRORS.refused, response.model, "refused");
    if (response.stop_reason === "max_tokens") return failed(CLASSIFY_ERRORS.cutOff, response.model);
    const w = response.parsed_output;
    if (!w) return failed(CLASSIFY_ERRORS.unreadable, response.model);
    const output: ClassifyOutput = {
      intents: [...new Set([...w.intents, w.primary])].slice(0, MAX_INTENTS),
      primary: w.primary,
      confidence: Math.min(1, Math.max(0, w.confidence)),
      flags: [...new Set(w.flags)],
      childName: w.child_name,
      summary: w.summary.slice(0, SUMMARY_CHARS),
    };
    return { ok: true, output, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  } catch (error) {
    // The subclasses first: an abort and a connection error are APIErrors too.
    if (error instanceof Anthropic.APIUserAbortError) return failed(CLASSIFY_ERRORS.aborted, null, "error", true);
    if (error instanceof Anthropic.APIConnectionError) return failed(CLASSIFY_ERRORS.network);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return failed(CLASSIFY_ERRORS.auth);
    if (error instanceof Anthropic.RateLimitError) return failed(CLASSIFY_ERRORS.busy);
    if (error instanceof Anthropic.APIError) {
      // The status only: an API message can echo the request, which holds parent text.
      console.error(`Iris classify failed (${error.status})`);
      return failed(CLASSIFY_ERRORS.api);
    }
    console.error("Iris classify failed (no status)");
    return failed(CLASSIFY_ERRORS.api);
  }
}
