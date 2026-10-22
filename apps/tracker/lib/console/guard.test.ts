import { describe, expect, it } from "vitest";
import type { Db } from "../data/client";
import type { Viewer } from "../data/queries";
import { CONSOLE_DENIALS, requireOwner } from "./guard";

// REQ-53 AC3, AC5: every Viewer kind maps to one fixed outcome.
const db = {} as Db;
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const base = { userId: "u1", email: "x@example.com" };
const OWNER: Viewer = { kind: "staff", ...base, orgId: ORG, role: "owner", db };

const CASES: [string, Viewer, number, string][] = [
  ["not configured", { kind: "not_configured" }, 503, '{"error":"console_not_configured"}'],
  ["signed out", { kind: "signed_out" }, 401, '{"error":"unauthenticated"}'],
  ["grade teacher", { kind: "staff", ...base, orgId: ORG, role: "teacher", db }, 403, '{"error":"forbidden"}'],
  ["student", { kind: "student", ...base, studentId: "s1", db }, 403, '{"error":"forbidden"}'],
  ["parent", { kind: "parent", ...base, db }, 403, '{"error":"forbidden"}'],
  ["role-less user", { kind: "none", ...base }, 403, '{"error":"forbidden"}'],
];

describe("requireOwner", () => {
  it.each(CASES)("%s is denied with a fixed body", (_who, viewer, status, body) => {
    const r = requireOwner(viewer);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(status);
    expect(JSON.stringify(r.body)).toBe(body);
  });

  it("the owner passes with the same viewer", () => {
    const r = requireOwner(OWNER);
    expect(r).toEqual({ ok: true, viewer: OWNER });
  });

  it("the templates are the four fixed bodies", () => {
    expect(Object.values(CONSOLE_DENIALS).map((b) => JSON.stringify(b)).sort()).toEqual([
      '{"error":"console_not_configured"}',
      '{"error":"console_unavailable"}',
      '{"error":"forbidden"}',
      '{"error":"unauthenticated"}',
    ]);
  });
});
