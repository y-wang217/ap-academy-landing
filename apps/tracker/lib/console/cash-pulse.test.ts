import { describe, expect, it } from "vitest";
import { cashPulse, toCents } from "./cash-pulse";
import type { InvoiceRow } from "./contracts";
import { windowOf } from "./trial-funnel";

// REQ-59 AC3, AC4: fixtures T1a to T1j. Window 30 days ending 2026-10-22.
const WINDOW = windowOf(30, "2026-10-22");
let n = 0;
const inv = (extra: Partial<InvoiceRow>): InvoiceRow => {
  n += 1;
  return {
    id: `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, pageUrl: `https://www.notion.so/inv${n}`, status: "Paid", paidOn: null, amount: null,
    creditApplied: null, issued: null, due: null, month: null, studentIds: [], studentName: null, ...extra,
  };
};
const pulse = (invoices: InvoiceRow[]) => cashPulse({ window: WINDOW, today: "2026-10-22", invoices });

describe("cashPulse fixtures", () => {
  it("T1a Paid with Paid On in the window is collected", () => expect(pulse([inv({ amount: 120, paidOn: "2026-10-05" })]).collected.cents).toBe(12000));
  it("T1b Paid with no Paid On is placed by Issued, collected and labelled", () => {
    const p = pulse([inv({ amount: 97.5, issued: "2026-10-01" })]);
    expect(p.collected).toMatchObject({ cents: 9750, byIssued: 1 });
    expect(p.collected.rows[0].label).toBe("paid date not recorded");
  });
  it("T1c Paid with no date is listed undated and not summed", () => {
    const p = pulse([inv({ amount: 50 })]);
    expect(p.collected.cents).toBe(0);
    expect(p.collected.undated.map((r) => r.label)).toEqual(["no date"]);
  });
  it("T1d Paid with no amount is listed, never summed or treated as 0", () => {
    const p = pulse([inv({ paidOn: "2026-10-05" })]);
    expect(p.collected).toMatchObject({ cents: 0, rows: [] });
    expect(p.collected.missingAmount.map((r) => [r.label, r.cents])).toEqual([["amount missing", null]]);
  });
  it("T1e Sent splits into due and overdue by invoiceStatus", () => {
    const p = pulse([inv({ status: "Sent", amount: 315, due: "2026-10-23" }), inv({ status: "Sent", amount: 420, due: "2026-10-21" })]);
    expect([p.outstandingDue.cents, p.outstandingOverdue.cents]).toEqual([31500, 42000]);
  });
  it("T1f Draft and Void are counts in no sum", () => {
    const p = pulse([inv({ status: "Draft", amount: 999 }), inv({ status: "Void", amount: 888, issued: "2026-10-01" })]);
    expect([p.drafts.length, p.voids.length]).toEqual([1, 1]);
    expect([p.collected.cents, p.outstandingDue.cents, p.outstandingOverdue.cents]).toEqual([0, 0, 0]);
  });
  it("T1g an empty or unknown status is not recognised", () => {
    const p = pulse([inv({ status: null, amount: 10, paidOn: "2026-10-05" }), inv({ status: "Refunded", amount: 10, paidOn: "2026-10-05" })]);
    expect(p.unrecognised).toHaveLength(2);
    expect(p.collected.cents).toBe(0);
  });
  it("T1h 0.1 plus 0.2 is exactly 30 cents", () => {
    expect(pulse([inv({ amount: 0.1, paidOn: "2026-10-05" }), inv({ amount: 0.2, paidOn: "2026-10-05" })]).collected.cents).toBe(30);
  });
  it("T1i credit applied on a counted Paid row", () => {
    expect(pulse([inv({ amount: 100, paidOn: "2026-10-05", creditApplied: 60 })]).creditsAppliedCents).toBe(6000);
  });
  it("T1j Paid On before the window is not collected", () => expect(pulse([inv({ amount: 100, paidOn: "2026-09-22" })]).collected.cents).toBe(0));
});

describe("cashPulse rules", () => {
  it("Due today is due; due yesterday is overdue; no due date is due", () => {
    const p = pulse([inv({ status: "Sent", amount: 1, due: "2026-10-22" }), inv({ status: "Sent", amount: 2, due: "2026-10-21" }), inv({ status: "Sent", amount: 4 })]);
    expect([p.outstandingDue.cents, p.outstandingOverdue.cents]).toEqual([500, 200]);
  });
  it("outstanding is every Sent row, whatever its date", () => {
    expect(pulse([inv({ status: "Sent", amount: 10, issued: "2026-01-01", due: "2026-12-01" })]).outstandingDue.cents).toBe(1000);
  });
  it("a Sent row with no amount is listed under its line", () => {
    expect(pulse([inv({ status: "Sent", due: "2026-10-01" })]).outstandingOverdue.missingAmount).toHaveLength(1);
  });
  it("drafts count whatever their date; voids only when issued in the window or undated", () => {
    const p = pulse([inv({ status: "Draft", issued: "2025-01-01" }), inv({ status: "Void", issued: "2025-01-01" }), inv({ status: "Void" })]);
    expect([p.drafts.length, p.voids.length]).toEqual([1, 1]);
  });
  it("credits count Sent rows issued in the window, not older ones or uncounted Paid rows", () => {
    const p = pulse([
      inv({ status: "Sent", amount: 10, issued: "2026-10-02", creditApplied: 5 }),
      inv({ status: "Sent", amount: 10, issued: "2026-08-02", creditApplied: 7 }),
      inv({ amount: 10, paidOn: "2026-08-02", creditApplied: 9 }),
    ]);
    expect(p.creditsAppliedCents).toBe(500);
  });
  it("toCents rounds", () => expect(toCents(97.505)).toBe(9751));
});
