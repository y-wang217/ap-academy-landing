import { describe, expect, it } from "vitest";
import type { Credit, Invoice } from "../domain/billing";
import { buildBillingView, money, type BillingData } from "./parent-billing";

const CHILD = "11111111-1111-4111-8111-111111111111";
const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001", number: "AP-2026-0005", month: "2026-10", amount: 420, creditApplied: 60,
  creditIds: [], issued: "2026-10-13", due: "2026-10-15", status: "Sent", hasPdf: true, studentIds: ["n"], ...over,
});
const credit = (over: Partial<Credit> = {}): Credit => ({
  id: "c1", date: "2026-10-03", course: "MHF4U", hours: 1, rate: 60, status: "Applied", appliedTo: "AP-2026-0005, Oct 2026", ...over,
});
const data = (over: Partial<BillingData> = {}): BillingData => ({
  childId: CHILD,
  header: { firstName: "Ada", lastInitial: "P", gradeLevel: 11 },
  profile: { rate: 60, cadence: "2x/week", family: "Afzal" },
  invoices: [
    inv(),
    inv({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0002", number: "AP-2026-0002", month: "2026-09", amount: 62.5, creditApplied: 0, status: "Paid", issued: "2026-09-10" }),
    inv({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0003", number: "AP-2026-0001", month: "2026-08", amount: 300, creditApplied: 0, status: "Paid", hasPdf: false, issued: "2026-08-10" }),
  ],
  credits: [credit(), credit({ id: "c2", date: "2026-10-09", course: "MCV4U", status: "Open", appliedTo: "", hours: 1.5 })],
  sharers: { "AP-2026-0005": [{ firstName: "Haider", family: "Afzal" }] },
  ...over,
});

const keys = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); keys(x, out); }
  return out;
};
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("money", () => {
  it("formats whole dollars, cents and credits", () => {
    expect(money(420)).toBe("$420");
    expect(money(62.5)).toBe("$62.50");
    expect(money(1234)).toBe("$1,234");
    expect(money(60, true)).toBe("-$60");
  });
});

describe("buildBillingView", () => {
  const view = buildBillingView(data(), "2026-10-16");
  it("the card holds this month's invoice, overdue, with the credit lines and the shared line (AC4, AC7)", () => {
    expect(view.card).toEqual({
      title: "October invoice",
      amount: "$420",
      issued: "Oct 13",
      due: "Oct 15",
      pill: { state: "overdue", label: "Overdue" },
      shared: "Shared invoice with Haider",
      credit: { total: "Credit applied: -$60", lines: ["Missed Oct 3 · MHF4U"] },
      pdfHref: `/tracker/parent/${CHILD}/billing/invoices/eeeeeeee-eeee-4eee-8eee-eeeeeeee0001`,
    });
    expect(view.header).toEqual({ name: "Ada P.", grade: "Grade 11" });
  });
  it("credits are Date descending with hours, amount and pills; the open total and footnote (AC5)", () => {
    expect(view.credits.map((c) => [c.date, c.course, c.hours, c.amount, c.pill.state])).toEqual([
      ["Oct 9", "MCV4U", "1.5h", "$90", "open"],
      ["Oct 3", "MHF4U", "1.0h", "$60", "applied"],
    ]);
    expect(view.openTotal).toBe("$90");
    expect(view.hasOpen).toBe(true);
  });
  it("past invoices are Mon YYYY with pills, linked only when there is a PDF (AC6)", () => {
    expect(view.past.map((p) => [p.month, p.amount, p.pill.label, p.pdfHref !== null])).toEqual([
      ["Sep 2026", "$62.50", "Paid", true],
      ["Aug 2026", "$300", "Paid", false],
    ]);
  });
  it("the rate line has both, one or no parts (AC8)", () => {
    expect(view.rateLine).toBe("Rate: $60/h · 2x/week");
    expect(buildBillingView(data({ profile: { rate: null, cadence: "1x/week", family: "" } }), "2026-10-16").rateLine).toBe("Rate: 1x/week");
    expect(buildBillingView(data({ profile: { rate: 62.5, cadence: null, family: "" } }), "2026-10-16").rateLine).toBe("Rate: $62.50/h");
    expect(buildBillingView(data({ profile: { rate: null, cadence: null, family: "" } }), "2026-10-16").rateLine).toBeNull();
  });
  it("no current invoice, credits or past rows leaves each section empty; no Open hides the footnote", () => {
    const empty = buildBillingView(data({ invoices: [], credits: [credit()] }), "2026-10-16");
    expect(empty.card).toBeNull();
    expect(empty.past).toEqual([]);
    expect(empty.hasOpen).toBe(false);
    expect(empty.openTotal).toBe("$0");
    expect(buildBillingView(data({ credits: [] }), "2026-10-16").credits).toEqual([]);
  });
  it("a credit with no amount omits it; a card with no Credit Applied has no credit box", () => {
    const v = buildBillingView(data({ invoices: [inv({ creditApplied: 0 })], credits: [credit({ rate: null })] }), "2026-10-16");
    expect(v.credits[0].amount).toBeNull();
    expect(v.card?.credit).toBeNull();
  });
  it("a sibling with another family shares nothing", () => {
    expect(buildBillingView(data({ sharers: { "AP-2026-0005": [{ firstName: "Kim", family: "Other" }] } }), "2026-10-16").card?.shared).toBeNull();
  });
  it("the model has no url key and no em-dash (AC12, AC15)", () => {
    expect(keys(view).map((k) => k.toLowerCase())).not.toContain("url");
    for (const s of strings(view)) expect(s).not.toContain("—");
  });
});
