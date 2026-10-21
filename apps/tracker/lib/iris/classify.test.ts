import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it, vi } from "vitest";
import { AI_MODEL } from "../ai/config";
import { CLASSIFY_ERRORS, ClassifyWire, classifyMessage, type ClassifyClient } from "./classify";

// REQ-43 AC8: one Anthropic call, its fixed short errors, and nothing from a response body.
const PROMPT = { system: "system text", user: "user text" };
const ok = (parsed: unknown, stop = "end_turn") => ({ model: AI_MODEL, stop_reason: stop, parsed_output: parsed, usage: { input_tokens: 120, output_tokens: 30 } });
const wire = { intents: ["general_question"], primary: "general_question", confidence: 0.92, flags: [], child_name: "", summary: "Asks about Tuesday." };

function client(result: unknown | (() => never)) {
  const parse = vi.fn<(body: unknown, opts?: unknown) => Promise<unknown>>(async () => (typeof result === "function" ? (result as () => never)() : result));
  return { c: { beta: { messages: { parse } } } as unknown as ClassifyClient, parse };
}
const headers = new Headers();
const SECRET = "body text with a secret sk-ant-xyz";

describe("classifyMessage", () => {
  it("sends one call with the model, the fallback beta, low effort and the Zod format", async () => {
    const { c, parse } = client(ok(wire));
    const signal = new AbortController().signal;
    const r = await classifyMessage(PROMPT, signal, c);
    expect(r).toEqual({ ok: true, model: AI_MODEL, inputTokens: 120, outputTokens: 30, output: { intents: ["general_question"], primary: "general_question", confidence: 0.92, flags: [], childName: "", summary: "Asks about Tuesday." } });
    expect(parse).toHaveBeenCalledTimes(1);
    const [body, opts] = parse.mock.calls[0] as [Record<string, unknown>, { signal?: AbortSignal }];
    expect(body).toMatchObject({ model: AI_MODEL, max_tokens: 2000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", system: "system text", messages: [{ role: "user", content: "user text" }] });
    expect((body.output_config as { effort: string }).effort).toBe("low");
    expect(opts.signal).toBe(signal);
  });

  it("adds the primary to intents, de-duplicates, clamps confidence and cuts the summary", async () => {
    const { c } = client(ok({ ...wire, intents: ["cancellation", "cancellation"], primary: "general_question", confidence: 1.4, summary: "s".repeat(500) }));
    const r = await classifyMessage(PROMPT, undefined, c);
    if (!r.ok) throw new Error("expected ok");
    expect(r.output.intents).toEqual(["cancellation", "general_question"]);
    expect(r.output.confidence).toBe(1);
    expect(r.output.summary).toHaveLength(200);
  });

  it("the wire schema is accepted by betaZodOutputFormat", () => {
    expect(() => betaZodOutputFormat(ClassifyWire)).not.toThrow();
  });

  const cases: [string, unknown | (() => never), string, "refused" | "error"][] = [
    ["a refusal", ok(null, "refusal"), CLASSIFY_ERRORS.refused, "refused"],
    ["max_tokens", ok(null, "max_tokens"), CLASSIFY_ERRORS.cutOff, "error"],
    ["an unparsed answer", ok(null), CLASSIFY_ERRORS.unreadable, "error"],
    ["a 429", () => { throw new Anthropic.RateLimitError(429, { error: SECRET }, SECRET, headers); }, CLASSIFY_ERRORS.busy, "error"],
    ["a 500", () => { throw new Anthropic.InternalServerError(500, { error: SECRET }, SECRET, headers); }, CLASSIFY_ERRORS.api, "error"],
    ["an auth error", () => { throw new Anthropic.AuthenticationError(401, { error: SECRET }, SECRET, headers); }, CLASSIFY_ERRORS.auth, "error"],
    ["a network error", () => { throw new Anthropic.APIConnectionError({ message: SECRET }); }, CLASSIFY_ERRORS.network, "error"],
    ["anything else", () => { throw new Error(SECRET); }, CLASSIFY_ERRORS.api, "error"],
  ];
  for (const [name, result, error, outcome] of cases) {
    it(`${name} maps to its fixed short error, never the response text`, async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await classifyMessage(PROMPT, undefined, client(result).c);
      expect(r).toMatchObject({ ok: false, outcome, error, aborted: false });
      if (!r.ok) expect(r.error.length).toBeLessThanOrEqual(300);
      expect(JSON.stringify(r)).not.toContain("secret");
      for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain("secret");
      log.mockRestore();
    });
  }

  it("an abort is marked aborted, so the step keeps the retry count", async () => {
    const r = await classifyMessage(PROMPT, undefined, client(() => { throw new Anthropic.APIUserAbortError(); }).c);
    expect(r).toMatchObject({ ok: false, outcome: "error", aborted: true });
  });
});
