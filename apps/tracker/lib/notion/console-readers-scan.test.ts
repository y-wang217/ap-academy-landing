import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-54 AC6, AC12: the new console reader files cannot write and never reach the service client.
const FILES = ["leads.ts", "touches.ts", "paged.ts"];
const BANNED = [
  "pages.create", '"PATCH"', '"DELETE"', ".patch(", ".insert(", ".update(", ".upsert(", ".delete(",
  "/v1/pages", "/v1/blocks", "/v1/comments", "@ap-academy/db/service", "getServiceClient",
];

describe("console reader scan", () => {
  it.each(FILES)("%s holds no write call, write endpoint or service client", (f) => {
    const src = readFileSync(join(__dirname, f), "utf8");
    for (const b of BANNED) expect(src, `${f} names ${b}`).not.toContain(b);
  });

  it.each(FILES)("%s names no Notion path but /v1/data_sources/", (f) => {
    const src = readFileSync(join(__dirname, f), "utf8");
    for (const m of src.matchAll(/\/v1\/[a-z_]+/g)) expect(m[0]).toBe("/v1/data_sources");
    expect(src).not.toMatch(/method: "(?!GET|POST)/);
  });
});
