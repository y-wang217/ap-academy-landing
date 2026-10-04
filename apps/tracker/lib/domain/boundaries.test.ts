import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR 0005: the domain layer imports nothing from React, Next or Supabase, and
// reads no clock or randomness.
const FORBIDDEN = [/from\s+["']react/, /from\s+["']next/, /from\s+["']@supabase/, /from\s+["']@ap-academy\/db/, /Date\.now\(/, /new Date\(\)/, /Math\.random/];

describe("lib/domain boundaries", () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  it("has source files to check", () => expect(files.length).toBeGreaterThan(0));
  for (const file of files) {
    it(`${file} stays pure`, () => {
      const source = readFileSync(join(dir, file), "utf8");
      for (const pattern of FORBIDDEN) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }
});
