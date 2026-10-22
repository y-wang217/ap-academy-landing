import { describe, expect, it } from "vitest";
import { checkDraft, withSignature } from "./draft-rules";
import { SIGNATURE } from "./policy";

// REQ-44 AC3, AC4: the signature is added once by code; rule-breaking drafts are caught.
describe("withSignature", () => {
  it("appends the signature once", () => {
    const out = withSignature("Hi Pat,\n\nThanks for letting me know.");
    expect(out).toBe(`Hi Pat,\n\nThanks for letting me know.\n\n${SIGNATURE}`);
    expect(out.endsWith("Charlie\nAP Academy")).toBe(true);
  });

  it("strips a sign-off the model added, so Charlie appears once", () => {
    for (const body of ["Hi Pat,\n\nSee you soon.\n\nCharlie", "Hi Pat,\n\nSee you soon.\n\nThanks,\nCharlie\nAP Academy\n", "Hi Pat,\n\nSee you soon.\nBest,\n\nCharlie  "]) {
      const out = withSignature(body);
      expect(out).toBe(`Hi Pat,\n\nSee you soon.\n\n${SIGNATURE}`);
      expect(out.match(/Charlie/g)).toHaveLength(1);
    }
  });
});

describe("checkDraft", () => {
  it.each([
    ["money", "That class is $40."],
    ["money", "It costs 40 dollars."],
    ["money", "A credit of 35 CAD."],
    ["ai_line", "As an AI, I cannot say."],
    ["ai_line", "Your assistant here."],
    ["ai_line", "This is an automated reply."],
    ["ai_line", "Iris here."],
    ["time", "How about 5:30 on Tuesday?"],
    ["time", "Can Sam come at 5 pm?"],
    ["time", "Shall we say 4pm?"],
    ["forfeit", "That class is forfeited."],
    ["forfeit", "It counts as a forfeit."],
  ])("%s fires on %s", (code, body) => {
    expect(checkDraft(body)).toContain(code);
  });

  it("a clean body breaks no rule", () => {
    expect(checkDraft("Hi Pat,\n\nThanks for letting me know. I hope Sam feels better soon. We can find a make-up class, and I will send some options.")).toEqual([]);
  });

  it("lists every rule broken, in a fixed order", () => {
    expect(checkDraft("Iris says the $40 class at 5 pm is forfeit.")).toEqual(["money", "ai_line", "time", "forfeit"]);
  });
});
