import { describe, expect, it } from "vitest";
import { unseenDrift, type DriftRow } from "./drift-notice";

const row = (over: Partial<DriftRow>): DriftRow => ({ studentId: "s", lastDriftText: "typed", lastDriftAt: null, driftSeenAt: null, ...over });
const T1 = "2026-10-20T10:00:00+00:00";
const T2 = "2026-10-21T10:00:00+00:00";
const ids = (rows: DriftRow[]) => unseenDrift(rows).map((r) => r.studentId);

describe("unseenDrift (REQ-34 AC9)", () => {
  it("lists drift that was never marked seen, with or without a drift time", () => {
    expect(ids([row({ studentId: "a", lastDriftAt: T1 }), row({ studentId: "b" })])).toEqual(["a", "b"]);
  });

  it("lists drift recorded after it was last seen", () => {
    expect(ids([row({ lastDriftAt: T2, driftSeenAt: T1 })])).toEqual(["s"]);
  });

  it("hides drift seen after it was recorded", () => {
    expect(ids([row({ lastDriftAt: T1, driftSeenAt: T2 })])).toEqual([]);
  });

  it("hides old drift with no drift time once it is marked seen", () => {
    expect(ids([row({ lastDriftAt: null, driftSeenAt: T1 })])).toEqual([]);
  });

  it("a legacy row marked seen shows again when a later drift sets the drift time", () => {
    expect(ids([row({ lastDriftAt: T2, driftSeenAt: T1 })])).toEqual(["s"]);
  });

  it("never lists a row with no drift text", () => {
    expect(ids([row({ lastDriftText: null, lastDriftAt: T1 })])).toEqual([]);
  });

  it("orders newest first, with no drift time last", () => {
    expect(ids([row({ studentId: "old", lastDriftAt: T1 }), row({ studentId: "none" }), row({ studentId: "new", lastDriftAt: T2 })])).toEqual(["new", "old", "none"]);
  });

  it("compares instants, not strings", () => {
    expect(ids([row({ lastDriftAt: "2026-10-21T10:00:00.5+00:00", driftSeenAt: "2026-10-21T06:00:01-04:00" })])).toEqual([]);
  });
});
