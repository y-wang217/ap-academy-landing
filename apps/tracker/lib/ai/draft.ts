/**
 * The one place the tracker calls an AI provider (ADR 0026). Returns the
 * model's structured answer or a plain error. Never writes anything.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AI_EFFORT, AI_MODEL } from "./config";
import { AiOutput, SYSTEM_PROMPT } from "./prompt";

export type ModelAnswer =
  | { ok: true; output: AiOutput; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; model: string | null };

/** An attachment as the API takes it: a photo or a PDF, base64 (ADR 0028). */
export type Attachment =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }
  | { kind: "pdf"; data: string };

export async function askModel(text: string, attachments: readonly Attachment[] = []): Promise<ModelAnswer> {
  const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...attachments.map((a): Anthropic.Beta.BetaContentBlockParam =>
      a.kind === "image"
        ? { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } },
    ),
    { type: "text", text },
  ];
  try {
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // Refusal fallback chosen by the server (claude-api guidance).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: AI_EFFORT, format: betaZodOutputFormat(AiOutput) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const usage = { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal") return { ok: false, error: "The AI declined this material. Enter the changes by hand.", model: response.model };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "That is too much to draft in one go. Send less at a time.", model: response.model };
    if (!response.parsed_output) return { ok: false, error: "The AI's answer could not be read. Try again.", model: response.model };
    return { ok: true, output: response.parsed_output, ...usage };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, error: "AI drafting is not set up correctly (API key). Enter the changes by hand.", model: null };
    }
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "The AI is busy. Try again in a minute.", model: null };
    if (error instanceof Anthropic.BadRequestError) return { ok: false, error: "The AI could not read one of the files. Try a smaller photo or a different file.", model: null };
    if (error instanceof Anthropic.APIError) return { ok: false, error: "The AI could not draft this right now. Try again.", model: null };
    return { ok: false, error: "Could not reach the AI. Check your connection and try again.", model: null };
  }
}
