import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-59 AC10: the funnel and cash pulse write nothing, read Notion only through the facade and never name Last Payment Date.
const APP = join(__dirname, "../..");
const FILES = ["lib/console/trial-funnel.ts", "lib/console/cash-pulse.ts", "lib/console/finance-panels.ts", "components/console/trial-funnel.tsx", "components/console/cash-pulse.tsx"];

describe.each(FILES)("%s", (f) => {
  const src = readFileSync(join(APP, f), "utf8");
  it("writes nothing and reads no Notion outside the facade", () => {
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(|rpc\(|fetch\(/);
    expect(src).not.toContain("api.notion.com");
    expect(src).not.toMatch(/from "[^"]*\/notion\//);
  });
  it("never names Last Payment Date and prints no percentage", () => {
    expect(src).not.toContain("Last Payment Date");
    expect(src).not.toMatch(/%[`"]|"%"|\(\$\{[^}]*\}%\)/);
  });
});
