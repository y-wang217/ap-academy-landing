import assert from "node:assert/strict";
import { test } from "node:test";
import { loginPath, safeNextPath } from "./paths.ts";

const FALLBACK = "/fallback";

test("same-origin paths pass through unchanged", () => {
  for (const path of ["/", "/tracker", "/tracker/courses/1?tab=2", "/sat#quiz"]) {
    assert.equal(safeNextPath(path, FALLBACK), path);
  }
});

test("empty and missing values fall back", () => {
  for (const value of [null, undefined, ""]) {
    assert.equal(safeNextPath(value, FALLBACK), FALLBACK);
  }
});

test("anything that could leave the origin falls back", () => {
  for (const value of [
    "https://evil.example",
    "evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
  ]) {
    assert.equal(safeNextPath(value, FALLBACK), FALLBACK, JSON.stringify(value));
  }
});

test("loginPath targets the root-level /login with a readable next", () => {
  assert.equal(loginPath("/tracker"), "/login?next=/tracker");
  assert.equal(loginPath("/tracker/a?b=1&c=2"), "/login?next=/tracker/a%3Fb%3D1%26c%3D2");
});

test("loginPath round-trips through safeNextPath", () => {
  const next = "/tracker/a?b=1&c=2";
  const params = new URL(loginPath(next), "https://www.apacademy.ca").searchParams;
  assert.equal(safeNextPath(params.get("next"), FALLBACK), next);
});
