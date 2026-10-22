import { describe, expect, it } from "vitest";
import type { Db } from "../data/client";
import type { OwnerViewer } from "./guard";
import { consoleFreshness, createConsoleDeps } from "./providers";

// REQ-54 AC2: one module-level freshness record, shared by every request on this server instance.
const viewer = (orgId: string): OwnerViewer => ({ kind: "staff", userId: "u", email: "o@example.com", orgId, role: "owner", db: { tracker: {} } as unknown as Db });

describe("createConsoleDeps", () => {
  it("two calls with different viewers share the one consoleFreshness Map", () => {
    const a = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    const b = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000bbbb"));
    expect(a.freshness).toBe(consoleFreshness);
    expect(b.freshness).toBe(consoleFreshness);
    expect(a.orgId).not.toBe(b.orgId);
  });

  it("uses the TUNING limits and the configured data source ids", () => {
    const d = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    expect({ timeoutMs: d.timeoutMs, maxPages: d.maxPages, perStudent: d.touchesPerStudent, days: d.touchesWindowDays }).toEqual({ timeoutMs: 8_000, maxPages: 10, perStudent: 5, days: 90 });
    expect(d.sources.touches).toBe("772939bd-bd88-4272-9f1f-20ce75ef2204");
    expect(d.sources.leads).toBe("fe3d651a-70c6-4d1e-8a38-656163d6bc63");
  });
});
