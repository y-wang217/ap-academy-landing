import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { securityHeaders } from "./headers.ts";

test("exactly the four security headers, in order", () => {
  assert.deepEqual(securityHeaders, [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ]);
});

test("header keys are unique", () => {
  const keys = securityHeaders.map((h) => h.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("the module has no imports, so next.config.ts can load it", () => {
  const source = readFileSync(new URL("./headers.ts", import.meta.url), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false);
});
