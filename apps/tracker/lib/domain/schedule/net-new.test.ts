import { describe, expect, it } from "vitest";
import { netNewHours, priorWeek, type NetNewInput, type NetNewResult, type SeriesFact } from "./net-new";
import { weekOf } from "./week";

// REQ-56 AC1, AC2, AC3, AC7: the north-star rule (docs/spec/founder-console/02-data-contracts.md section 5) plus
// the tracker ADR 0068 extensions (adoption, not in scheduler, opening baseline, status mapping).
const W = weekOf("2026-10-21"); // Mon 19 Oct to Sun 25 Oct
const TODAY = "2026-10-22";

const ACTIVE = "a0000000-0000-4000-8000-000000000001";
const UNPAID = "a0000000-0000-4000-8000-000000000002";
const TRIAL = "a0000000-0000-4000-8000-000000000003";
const LOST = "a0000000-0000-4000-8000-000000000004";
const PAUSED = "a0000000-0000-4000-8000-000000000005";
const UNSYNCED_PAID = "a0000000-0000-4000-8000-000000000006";
const UNSYNCED = "a0000000-0000-4000-8000-000000000007";
const FRESH = "a0000000-0000-4000-8000-000000000008";
const NOT_ADOPTED = "a0000000-0000-4000-8000-000000000009";
const NO_SERIES = "a0000000-0000-4000-8000-00000000000a";
const LATE = "a0000000-0000-4000-8000-00000000000b";
const STAFF = "b0000000-0000-4000-8000-000000000001";

const STAGES: Record<string, string> = {
  [ACTIVE]: "Active", [UNPAID]: "Active", [TRIAL]: "Trial Booked", [LOST]: "Lost", [PAUSED]: "Paused",
  [FRESH]: "Onboarding", [NOT_ADOPTED]: "Active", [NO_SERIES]: "Active", [LATE]: "Active",
};
const PAID = [ACTIVE, LOST, PAUSED, UNSYNCED_PAID, FRESH, NOT_ADOPTED, LATE];
const ADOPTED_LONG_AGO = [ACTIVE, UNPAID, TRIAL, LOST, PAUSED, UNSYNCED_PAID, UNSYNCED];

let n = 0;
function s(over: Partial<SeriesFact> = {}): SeriesFact {
  n += 1;
  return {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    studentId: ACTIVE, staffId: STAFF, kind: "weekly", purpose: null, startDate: "2026-10-21", effectiveUntil: null,
    durationMinutes: 60, splitFrom: null, createdAt: "2026-10-21T15:00:00Z", ...over,
  };
}

function input(series: SeriesFact[], over: Partial<NetNewInput> = {}): NetNewInput {
  return {
    week: W,
    today: TODAY,
    series,
    adoptions: [
      ...ADOPTED_LONG_AGO.map((studentId) => ({ studentId, adoptedAt: "2026-09-01T10:00:00Z" })),
      { studentId: FRESH, adoptedAt: "2026-10-20T14:00:00Z" },
      { studentId: LATE, adoptedAt: "2026-10-01T10:00:00Z" },
    ],
    people: { ok: true, stale: false, syncedAt: "2026-10-22T15:00:00Z", students: Object.entries(STAGES).map(([id, stage]) => ({ id, stage })) },
    payments: { ok: true, paidByStudent: new Map(PAID.map((id) => [id.replaceAll("-", ""), [{ invoiceId: `inv-${id}`, paidOn: "2026-10-01", month: "2026-10" }]])) },
    ...over,
  };
}

const nets = (r: NetNewResult) => [r.netNewVerifiedMinutes, r.netNewUnverifiedMinutes];

describe("netNewHours: spec section 5 fixtures (AC1)", () => {
  it("F1: a new weekly series in W, Active and Paid, is +60 verified", () => {
    const r = netNewHours(input([s()]));
    expect(r.status).toBe("verified");
    expect(nets(r)).toEqual([60, 0]);
    expect(r.counted).toEqual([expect.objectContaining({ event: "addition", date: "2026-10-21", minutes: 60, class: "verified", reason: null, paidOn: "2026-10-01" })]);
    expect(r.openingVerifiedMinutes).toBe(0);
  });

  it("F2: a 60 to 90 minute split mid-W nets +30 verified", () => {
    const old = s({ startDate: "2026-09-01", effectiveUntil: "2026-10-20" });
    const next = s({ startDate: "2026-10-21", durationMinutes: 90, splitFrom: old.id });
    const r = netNewHours(input([old, next]));
    expect(nets(r)).toEqual([30, 0]);
    expect([r.additionsVerifiedMinutes, r.reductionsVerifiedMinutes]).toEqual([90, 60]);
    expect(r.openingVerifiedMinutes).toBe(60);
  });

  it("F3: a series ending in W is -60 verified", () => {
    expect(nets(netNewHours(input([s({ startDate: "2026-09-01", effectiveUntil: "2026-10-20" })])))).toEqual([-60, 0]);
  });

  it("F4: a one-off trial is excluded and counts nothing", () => {
    const r = netNewHours(input([s({ studentId: TRIAL, kind: "one_off", purpose: "trial" })]));
    expect(nets(r)).toEqual([0, 0]);
    expect(r.counted).toEqual([]);
    expect(r.excluded).toEqual([expect.objectContaining({ reason: "trial", date: "2026-10-21" })]);
  });

  it("F5: no Paid invoice makes the addition unverified (rule b)", () => {
    const r = netNewHours(input([s({ studentId: UNPAID })]));
    expect(nets(r)).toEqual([0, 60]);
    expect(r.counted[0]).toMatchObject({ class: "unverified", reason: "unpaid", paidOn: null });
  });

  it("F6: an Invoices failure is unverifiable, gross shown unclassified, every figure null", () => {
    const add = s();
    const end = s({ startDate: "2026-09-01", effectiveUntil: "2026-10-20" });
    const r = netNewHours(input([add, end], { payments: { ok: false, reason: "Timed out after 8 s" } }));
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toBe("Timed out after 8 s");
    expect([r.openingVerifiedMinutes, r.additionsVerifiedMinutes, r.reductionsVerifiedMinutes, r.netNewVerifiedMinutes]).toEqual([null, null, null, null]);
    expect([r.additionsUnverifiedMinutes, r.reductionsUnverifiedMinutes, r.netNewUnverifiedMinutes]).toEqual([null, null, null]);
    expect([r.grossAdditionsMinutes, r.grossReductionsMinutes]).toEqual([60, 60]);
    expect(r.counted.map((c) => [c.seriesId, c.class, c.reason])).toEqual([[add.id, "unclassified", null], [end.id, "unclassified", null]]);
  });

  it("F7: a series that starts and ends inside W nets 0 verified", () => {
    const r = netNewHours(input([s({ startDate: "2026-10-19", effectiveUntil: "2026-10-20" })]));
    expect(nets(r)).toEqual([0, 0]);
    expect(r.counted.map((c) => c.event)).toEqual(["addition", "reduction"]);
    expect(r.counted.every((c) => c.class === "verified")).toBe(true);
  });

  it("F8: an ended series of a Lost student stays verified, in both weeks", () => {
    const row = s({ studentId: LOST, startDate: "2026-09-01", effectiveUntil: "2026-10-20" });
    expect(nets(netNewHours(input([row])))).toEqual([-60, 0]);
    expect(nets(netNewHours(input([row], { week: weekOf("2026-09-01") })))).toEqual([60, 0]);
  });

  it("F9: an open series of a Paused student is unverified (rule c)", () => {
    const r = netNewHours(input([s({ studentId: PAUSED })]));
    expect(nets(r)).toEqual([0, 60]);
    expect(r.counted[0].reason).toBe("stage_not_active");
  });

  it("F10: no people row makes an ended series' reduction unverified (rule a)", () => {
    const r = netNewHours(input([s({ studentId: UNSYNCED_PAID, startDate: "2026-09-01", effectiveUntil: "2026-10-20" })]));
    expect(nets(r)).toEqual([0, -60]);
    expect(r.counted[0].reason).toBe("not_synced");
  });

  it("F11: no people row and no invoice is unverified, first failing rule a", () => {
    const r = netNewHours(input([s({ studentId: UNSYNCED })]));
    expect(nets(r)).toEqual([0, 60]);
    expect(r.counted[0].reason).toBe("not_synced");
  });
});

describe("netNewHours: the card's extra fixtures (AC1, AC3)", () => {
  it("F12: an adopted series' addition is excluded and joins the opening baseline", () => {
    const r = netNewHours(input([s({ studentId: FRESH, createdAt: "2026-10-20T14:00:00+00:00" })]));
    expect(nets(r)).toEqual([0, 0]);
    expect(r.excluded).toEqual([expect.objectContaining({ reason: "adopted", date: "2026-10-21" })]);
    expect(r.openingVerifiedMinutes).toBe(60);
  });

  it("F13: an adopted series' later reduction counts", () => {
    const row = s({ studentId: FRESH, createdAt: "2026-10-20T14:00:00.000Z", effectiveUntil: "2026-11-03" });
    expect(nets(netNewHours(input([row], { week: weekOf("2026-11-02") })))).toEqual([-60, 0]);
  });

  it("F14: make-up and extra one-offs are excluded with their purpose", () => {
    const r = netNewHours(input([s({ kind: "one_off", purpose: "makeup" }), s({ kind: "one_off", purpose: "extra" }), s({ kind: "one_off" })]));
    expect(nets(r)).toEqual([0, 0]);
    expect(r.excluded.map((e) => e.reason)).toEqual(["makeup", "extra", "one_off"]);
  });

  it("F15: an Active student with no series and no adoption row is listed as not in scheduler", () => {
    const r = netNewHours(input([]));
    expect(r.notInScheduler).toEqual(expect.arrayContaining([NO_SERIES, NOT_ADOPTED]));
    expect(r.notInScheduler).not.toContain(ACTIVE);
    expect(nets(r)).toEqual([0, 0]);
  });

  it("F16: an empty week is verified with nothing counted or excluded", () => {
    const r = netNewHours(input([]));
    expect(r.status).toBe("verified");
    expect([r.counted, r.excluded]).toEqual([[], []]);
    expect([r.grossAdditionsMinutes, r.grossReductionsMinutes]).toEqual([0, 0]);
  });

  it("F17: the same series row twice counts once (ids compared without dashes)", () => {
    const row = s();
    const r = netNewHours(input([row, { ...row, id: row.id.replaceAll("-", "").toUpperCase() }]));
    expect(nets(r)).toEqual([60, 0]);
    expect(r.counted).toHaveLength(1);
  });

  it("F18: the prior week is computed by the same function", () => {
    const rows = [s({ startDate: "2026-10-14" }), s({ startDate: "2026-10-21", durationMinutes: 90 })];
    expect(netNewHours(input(rows, { week: priorWeek(W) })).netNewVerifiedMinutes).toBe(60);
    expect(netNewHours(input(rows)).netNewVerifiedMinutes).toBe(90);
  });

  it("F19: a stale people copy is incomplete and keeps its figures (AC7)", () => {
    const r = netNewHours(input([s()], { people: { ok: true, stale: true, syncedAt: "2026-10-22T12:00:00Z", students: [{ id: ACTIVE, stage: "Active" }] } }));
    expect(r.status).toBe("incomplete");
    expect(nets(r)).toEqual([60, 0]);
    expect(r.lastSuccessfulSyncAt).toBe("2026-10-22T12:00:00Z");
  });

  it("F20: a failed people read is unverifiable", () => {
    const r = netNewHours(input([s()], { people: { ok: false, reason: "Student stages unavailable" } }));
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toBe("Student stages unavailable");
    expect(r.netNewVerifiedMinutes).toBeNull();
    expect(r.grossAdditionsMinutes).toBe(60);
  });

  it("F21: series of a student with no adoption row are excluded, kept out of the opening, and the student listed", () => {
    const r = netNewHours(input([s({ studentId: NOT_ADOPTED }), s({ studentId: NOT_ADOPTED, startDate: "2026-09-01" })]));
    expect(nets(r)).toEqual([0, 0]);
    expect(r.counted).toEqual([]);
    expect(r.excluded.map((e) => [e.reason, e.date])).toEqual([["not_in_scheduler", "2026-10-21"], ["not_in_scheduler", "2026-10-19"]]);
    expect(r.openingVerifiedMinutes).toBe(0);
    expect(r.notInScheduler).toContain(NOT_ADOPTED);
  });

  it("F21 with a failed people read still lists the student and never counts the series", () => {
    const r = netNewHours(input([s({ studentId: NOT_ADOPTED })], { people: { ok: false, reason: "Student stages unavailable" } }));
    expect(r.excluded.map((e) => e.reason)).toEqual(["not_in_scheduler"]);
    expect(r.notInScheduler).toEqual([NOT_ADOPTED]);
    expect(r.grossAdditionsMinutes).toBe(0);
  });

  it("F22: a series created after an empty-text adoption counts as an addition", () => {
    const r = netNewHours(input([s({ studentId: LATE, createdAt: "2026-10-01T10:00:01Z" })]));
    expect(nets(r)).toEqual([60, 0]);
    expect(r.excluded).toEqual([]);
  });

  it("a split of an adopted series counts the reduction and the new row's addition", () => {
    const old = s({ studentId: FRESH, startDate: "2026-10-01", createdAt: "2026-10-20T14:00:00Z", effectiveUntil: "2026-10-20" });
    const next = s({ studentId: FRESH, startDate: "2026-10-21", durationMinutes: 90, splitFrom: old.id, createdAt: "2026-10-20T16:00:00Z" });
    expect(nets(netNewHours(input([old, next])))).toEqual([30, 0]);
  });
});

describe("netNewHours: Toronto DST weeks keep wall-clock dates (AC2)", () => {
  it("a series starting Sun 2026-03-08 is an addition in the week of 2026-03-02", () => {
    const r = netNewHours(input([s({ startDate: "2026-03-08" })], { week: weekOf("2026-03-04"), today: "2026-03-10" }));
    expect(weekOf("2026-03-04")).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    expect(r.counted.map((c) => [c.event, c.date])).toEqual([["addition", "2026-03-08"]]);
  });

  it("effective_until 2026-11-01 is a reduction in the week of 2026-11-02, not 2026-10-26", () => {
    const row = s({ startDate: "2026-09-01", effectiveUntil: "2026-11-01" });
    expect(netNewHours(input([row], { week: weekOf("2026-10-28") })).counted).toEqual([]);
    expect(netNewHours(input([row], { week: weekOf("2026-11-04") })).counted.map((c) => [c.event, c.date])).toEqual([["reduction", "2026-11-02"]]);
  });

  it("a series starting Mon 2026-11-02 is an addition in the week of 2026-11-02", () => {
    expect(netNewHours(input([s({ startDate: "2026-11-02" })], { week: weekOf("2026-11-02") })).counted.map((c) => c.event)).toEqual(["addition"]);
  });
});

describe("priorWeek", () => {
  it("is the Monday-to-Sunday week before", () => {
    expect(priorWeek(W)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(priorWeek(weekOf("2026-11-04"))).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });
});
