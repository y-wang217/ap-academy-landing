import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it, vi } from "vitest";
import { AI_EFFORT, AI_MODEL } from "../ai/config";
import { DRAFT_ERRORS, DraftWire, draftReply, type DraftClient } from "./draft";

// REQ-44 AC7: one Anthropic call per draft, its fixed short errors, and nothing from a response body.
const PROMPT = { system: "system text", user: "user text" };
const ok = (parsed: unknown, stop = "end_turn") => ({ model: AI_MODEL, stop_reason: stop, parsed_output: parsed, usage: { input_tokens: 400, output_tokens: 90 } });
const wire = { body: "Hi Pat,\n\nThanks for letting me know.", needs_charlie: false, reason: "" };

function client(result: unknown | (() => never)) {
  const parse = vi.fn<(body: unknown, opts?: unknown) => Promise<unknown>>(async () => (typeof result === "function" ? (result as () => never)() : result));
  return { c: { beta: { messages: { parse } } } as unknown as DraftClient, parse };
}
const headers = new Headers();
const SECRET = "body text with a secret sk-ant-xyz";

describe("draftReply", () => {
  it("sends one call with the model, the fallback beta, the AI effort and the Zod format", async () => {
    const { c, parse } = client(ok(wire));
    const signal = new AbortController().signal;
    const r = await draftReply(PROMPT, signal, c);
    expect(r).toEqual({ ok: true, model: AI_MODEL, inputTokens: 400, outputTokens: 90, output: { body: wire.body, needsCharlie: false, reason: "" } });
    const [body, opts] = parse.mock.calls[0] as [Record<string, unknown>, { signal?: AbortSignal }];
    expect(body).toMatchObject({ model: AI_MODEL, max_tokens: 2000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", system: "system text", messages: [{ role: "user", content: "user text" }] });
    expect((body.output_config as { effort: string }).effort).toBe(AI_EFFORT);
    expect(opts.signal).toBe(signal);
  });

  it("the wire schema is accepted by betaZodOutputFormat", () => {
    expect(() => betaZodOutputFormat(DraftWire)).not.toThrow();
  });

  it("keeps needs_charlie and cuts the reason", async () => {
    const r = await draftReply(PROMPT, undefined, client(ok({ ...wire, needs_charlie: true, reason: "r".repeat(500) })).c);
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.needsCharlie).toBe(true);
    expect(r.output.reason).toHaveLength(200);
  });

  const cases: [string, unknown | (() => never), string, "refused" | "error"][] = [
    ["a refusal", ok(null, "refusal"), DRAFT_ERRORS.refused, "refused"],
    ["max_tokens", ok(null, "max_tokens"), DRAFT_ERRORS.cutOff, "error"],
    ["an unparsed answer", ok(null), DRAFT_ERRORS.unreadable, "error"],
    ["an empty body", ok({ ...wire, body: "  " }), DRAFT_ERRORS.empty, "error"],
    ["a body over 3,000 characters", ok({ ...wire, body: "a".repeat(3001) }), DRAFT_ERRORS.empty, "error"],
    ["a 429", () => { throw new Anthropic.RateLimitError(429, { error: SECRET }, SECRET, headers); }, DRAFT_ERRORS.busy, "error"],
    ["a 500", () => { throw new Anthropic.InternalServerError(500, { error: SECRET }, SECRET, headers); }, DRAFT_ERRORS.api, "error"],
    ["an auth error", () => { throw new Anthropic.AuthenticationError(401, { error: SECRET }, SECRET, headers); }, DRAFT_ERRORS.auth, "error"],
    ["a network error", () => { throw new Anthropic.APIConnectionError({ message: SECRET }); }, DRAFT_ERRORS.network, "error"],
    ["anything else", () => { throw new Error(SECRET); }, DRAFT_ERRORS.api, "error"],
  ];
  for (const [name, result, error, outcome] of cases) {
    it(`${name} maps to its fixed short error, never the response text`, async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await draftReply(PROMPT, undefined, client(result).c);
      expect(r).toMatchObject({ ok: false, outcome, error, aborted: false });
      if (!r.ok) expect(r.error.length).toBeLessThanOrEqual(300);
      expect(JSON.stringify(r)).not.toContain("secret");
      for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain("secret");
      log.mockRestore();
    });
  }

  it("an abort is marked aborted, so the step keeps the retry count", async () => {
    const r = await draftReply(PROMPT, undefined, client(() => { throw new Anthropic.APIUserAbortError(); }).c);
    expect(r).toMatchObject({ ok: false, outcome: "error", aborted: true });
  });
});
