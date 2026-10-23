import { describe, expect, it } from "vitest";
import { fixtureLeads, lead, LEAD_IDS, SALES_NOW, TRIAL_F, type LeadKey } from "../../test/console/sales-fixtures";
import type { LeadRow } from "./contracts";
import { rankSalesQueue } from "./sales-queue";

// REQ-57 AC2, AC3, AC10 (T1): the published order, the reasons, eligibility, dedupe and the override.
const keyOf = (id: string) => (Object.entries(LEAD_IDS).find(([, v]) => v === id)?.[0] ?? id) as LeadKey;
const rank = (leads: LeadRow[], trial = true) => rankSalesQueue({ leads, trialLessons: trial ? [TRIAL_F] : null, now: SALES_NOW });

const REASONS: Partial<Record<LeadKey, string>> = {
  A: "New lead, not contacted yet",
  B: "New lead, not contacted yet",
  G: "Follow-up due: Assign teacher due Wed 21 Oct (moved up: due earlier)",
  D: "Follow-up due: Book trial due Thu 22 Oct 10:00 (moved up: due earlier)",
  E: "Post-trial decision: awaiting close (moved up: due earlier)",
  C: "Urgent callback: Call due Thu 22 Oct 11:30",
  F: "Post-trial decision: trial on Tue 20 Oct, not closed",
  H: "Follow-up due: Deliver trial due Thu 22 Oct 11:45",
  K: "Later: never contacted, next Close call Sun 25 Oct 10:00",
  I: "Later: last contact Sat 10 Oct, next Text Sat 24 Oct 10:00",
  J: "Later: last contact Thu 15 Oct, no due date",
};

function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("rankSalesQueue", () => {
  const q = rank(fixtureLeads());

  it("gives the published order and effective buckets (AC2)", () => {
    expect(q.items.map((i) => keyOf(i.lead.id))).toEqual(["A", "B", "G", "D", "E", "C", "F", "H", "K", "I", "J"]);
    expect(q.items.map((i) => i.effectiveBucket)).toEqual([1, 1, 2, 2, 2, 2, 3, 4, 5, 5, 5]);
    expect(q.items.map((i) => i.bucket)).toEqual([1, 1, 4, 4, 3, 2, 3, 4, 5, 5, 5]);
  });

  it("gives every queued row its exact reason (AC2)", () => {
    for (const item of q.items) expect(item.priorityReason, keyOf(item.lead.id)).toBe(REASONS[keyOf(item.lead.id)]);
    expect(q.items.filter((i) => i.priorityReason.endsWith(" (moved up: due earlier)")).map((i) => keyOf(i.lead.id))).toEqual(["G", "D", "E"]);
    expect(q.items.some((i) => i.priorityReason.includes("  "))).toBe(false);
  });

  it("links F to its trial lesson", () => {
    expect(q.items.find((i) => i.lead.id === LEAD_IDS.F)?.trialLessonId).toBe(TRIAL_F.id);
    expect(q.items.find((i) => i.lead.id === LEAD_IDS.K)?.trialLessonId).toBeNull();
  });

  it("excludes opt-outs, closed stages and Next Action None, and merges duplicates (AC3)", () => {
    const queued = new Set(q.items.map((i) => keyOf(i.lead.id)));
    for (const k of ["L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"] as LeadKey[]) expect(queued.has(k), k).toBe(false);
    expect(q.items.filter((i) => i.lead.id === LEAD_IDS.A)).toHaveLength(1);
    expect(q.mergedDuplicates).toBe(1);
  });

  it("lists the exceptions B, J and T, never hidden (AC10)", () => {
    expect(q.exceptions.map((e) => [keyOf(e.id), e.reason])).toEqual([["J", "No Next Action Due"], ["B", "No Next Action Due"], ["T", "No Stage"]]);
    expect(q.exceptions[0].pageUrl).toBe(lead("J").pageUrl);
  });

  it("with trial lessons null, F drops to bucket 5 after K", () => {
    const n = rank(fixtureLeads(), false);
    expect(n.items.map((i) => keyOf(i.lead.id))).toEqual(["A", "B", "G", "D", "E", "C", "H", "K", "F", "I", "J"]);
    expect(n.items.find((i) => i.lead.id === LEAD_IDS.F)?.priorityReason).toBe("Later: never contacted, no due date");
  });

  it("is stable over 20 shuffles, with W and X tied on due and created time", () => {
    const tied = [
      lead("W", { nextActionDue: "2026-10-22T15:20:00.000Z", createdAt: "2026-10-01T12:00:00.000Z" }),
      lead("X", { nextActionDue: "2026-10-22T15:20:00.000Z", createdAt: "2026-10-01T12:00:00.000Z" }),
    ];
    const input = [...fixtureLeads(), ...tied];
    const first = rank(input).items.map((i) => i.lead.id);
    for (let s = 1; s <= 20; s++) expect(rank(shuffled(input, s)).items.map((i) => i.lead.id)).toEqual(first);
    const wx = rank(shuffled(tied, 3)).items;
    expect(wx.map((i) => keyOf(i.lead.id))).toEqual(["W", "X"]);
    expect(wx.map((i) => i.priorityReason)).toEqual(["Urgent callback: Call due Thu 22 Oct 11:20", "Urgent callback: Call due Thu 22 Oct 11:20"]);
  });

  it("keeps the override: an overdue due goes before any later due outside bucket 1 (AC2)", () => {
    const at = (l: LeadRow) => (l.nextActionDue === null ? null : Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(l.nextActionDue) ? `${l.nextActionDue}T04:00:00Z` : l.nextActionDue));
    const items = q.items.filter((i) => i.bucket !== 1);
    for (let x = 0; x < items.length; x++) {
      for (let y = 0; y < items.length; y++) {
        const ax = at(items[x].lead);
        const ay = at(items[y].lead);
        if (ax !== null && ay !== null && ax <= SALES_NOW.getTime() && ay > ax) expect(x, `${keyOf(items[x].lead.id)} before ${keyOf(items[y].lead.id)}`).toBeLessThan(y);
      }
    }
  });

  it("a date-only due is 00:00 Toronto, on the DST date too", () => {
    const before = rankSalesQueue({ leads: [lead("D", { nextAction: "Book trial", nextActionDue: "2026-11-01" })], trialLessons: [], now: new Date("2026-11-01T03:59:00.000Z") });
    expect(before.items[0].bucket).toBe(5);
    const after = rankSalesQueue({ leads: [lead("D", { nextAction: "Book trial", nextActionDue: "2026-11-01" })], trialLessons: [], now: new Date("2026-11-01T04:00:00.000Z") });
    expect(after.items[0].bucket).toBe(4);
    expect(after.items[0].priorityReason).toBe("Follow-up due: Book trial due Sun 1 Nov");
  });

  it("an empty input is an empty queue", () => {
    expect(rankSalesQueue({ leads: [], trialLessons: null, now: SALES_NOW })).toEqual({ items: [], exceptions: [], mergedDuplicates: 0 });
  });
});
