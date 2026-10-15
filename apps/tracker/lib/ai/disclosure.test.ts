import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_DISCLOSURE } from "./disclosure";

const composer = readFileSync(new URL("../../components/teacher/composer.tsx", import.meta.url), "utf8");

describe("AI_DISCLOSURE", () => {
  it("names Anthropic and the photo/PDF gap", () => {
    expect(AI_DISCLOSURE).toContain("Anthropic");
    expect(AI_DISCLOSURE).toContain("photos or PDFs");
    expect(AI_DISCLOSURE).toContain("removed");
  });
  it("is one sentence with no em or en dash", () => {
    expect(AI_DISCLOSURE.match(/\./g)).toHaveLength(1);
    expect(AI_DISCLOSURE.endsWith(".")).toBe(true);
    expect(AI_DISCLOSURE).not.toMatch(/[–—]/);
  });
});

describe("composer", () => {
  it("uses the disclosure with a plain link to /privacy", () => {
    expect(composer).toContain("AI_DISCLOSURE");
    expect(composer).toMatch(/<a\s+href="\/privacy"/);
    expect(composer).not.toContain("next/link");
  });
  it("does not repeat the old name claim", () => {
    expect(composer).not.toContain("removed from text before it is sent");
  });
});
