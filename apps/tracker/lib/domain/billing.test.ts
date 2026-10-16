import { describe, expect, it } from "vitest";
import {
  appliedToNumber, creditAmount, creditsOnInvoice, invoiceStatus, openTotal, sharedWith, splitInvoices,
  type Credit, type Invoice,
} from "./billing";

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i-oct", number: "AP-2026-0005", month: "2026-10", amount: 420, creditApplied: 0, creditIds: [],
  issued: "2026-10-13", due: "2026-10-20", status: "Sent", hasPdf: false, studentIds: ["s1"], ...over,
});
const credit = (over: Partial<Credit> = {}): Credit => ({
  id: "c1", date: "2026-10-03", course: "MHF4U", hours: 1, rate: 60, status: "Open", appliedTo: "", ...over,
});

describe("invoiceStatus (AC1)", () => {
  it("Paid is Paid whatever the due date", () => {
    expect(invoiceStatus(inv({ status: "Paid", due: "2026-01-01" }), "2026-10-16")).toBe("Paid");
  });
  it("Sent is Due when Due is tomorrow, today or empty", () => {
    expect(invoiceStatus(inv({ due: "2026-10-17" }), "2026-10-16")).toBe("Due");
    expect(invoiceStatus(inv({ due: "2026-10-16" }), "2026-10-16")).toBe("Due");
    expect(invoiceStatus(inv({ due: null }), "2026-10-16")).toBe("Due");
  });
  it("Sent is Overdue when Due was yesterday", () => {
    expect(invoiceStatus(inv({ due: "2026-10-15" }), "2026-10-16")).toBe("Overdue");
  });
});

describe("netting (AC2)", () => {
  const oct = inv({ id: "i-oct", number: "AP-2026-0005", month: "2026-10" });
  const nov = inv({ id: "i-nov", number: "AP-2026-0010", month: "2026-11" });
  it("an Open credit (Billed Month 2026-10) is on no invoice and counts in openTotal", () => {
    const open = credit();
    expect(creditsOnInvoice(oct, [open])).toEqual([]);
    expect(creditsOnInvoice(nov, [open])).toEqual([]);
    expect(openTotal([open])).toBe(60);
  });
  it("once Applied To names the November invoice, it is on November and not October", () => {
    const applied = credit({ status: "Applied", appliedTo: "AP-2026-0010, Nov 2026" });
    expect(creditsOnInvoice(nov, [applied])).toEqual([applied]);
    expect(creditsOnInvoice(oct, [applied])).toEqual([]);
    expect(openTotal([applied])).toBe(0);
  });
  it("an Open credit placed in an invoice's Credits relation is still excluded", () => {
    expect(creditsOnInvoice(inv({ creditIds: ["c1"] }), [credit()])).toEqual([]);
  });
  it("an Applied credit found only through the relation is included", () => {
    const applied = credit({ status: "Applied", appliedTo: "" });
    expect(creditsOnInvoice(inv({ creditIds: ["c1"] }), [applied])).toEqual([applied]);
  });
  it("openTotal ignores Applied, Made up and Forfeited and rows with no amount", () => {
    const rows = [
      credit({ id: "a", status: "Open", hours: 1.5, rate: 60 }),
      credit({ id: "b", status: "Applied" }),
      credit({ id: "c", status: "Made up" }),
      credit({ id: "d", status: "Forfeited" }),
      credit({ id: "e", status: "Open", hours: null }),
    ];
    expect(openTotal(rows)).toBe(90);
  });
  it("appliedToNumber takes the text before the first comma, or all of it", () => {
    expect(appliedToNumber(" AP-2026-0010 , Nov 2026")).toBe("AP-2026-0010");
    expect(appliedToNumber("AP-2026-0010")).toBe("AP-2026-0010");
    expect(appliedToNumber("")).toBe("");
  });
  it("creditAmount rounds to cents and is null when a part is missing", () => {
    expect(creditAmount(credit({ hours: 1.25, rate: 62.5 }))).toBe(78.13);
    expect(creditAmount(credit({ rate: null }))).toBeNull();
  });
});

describe("splitInvoices (AC4, AC6)", () => {
  it("the current month's invoice goes on the card, the rest are past", () => {
    const out = splitInvoices([inv({ id: "a", month: "2026-09" }), inv({ id: "b", month: "2026-10" })], "2026-10");
    expect(out.current?.id).toBe("b");
    expect(out.past.map((i) => i.id)).toEqual(["a"]);
  });
  it("two current rows keep the latest Issued on the card", () => {
    const out = splitInvoices([
      inv({ id: "early", issued: "2026-10-01" }),
      inv({ id: "late", issued: "2026-10-12" }),
    ], "2026-10");
    expect(out.current?.id).toBe("late");
    expect(out.past.map((i) => i.id)).toEqual(["early"]);
  });
  it("past is Month descending then Issued descending, capped at 24", () => {
    const rows = Array.from({ length: 30 }, (_, k) => inv({ id: `m${k}`, month: `2024-${String((k % 12) + 1).padStart(2, "0")}`, issued: `2024-01-${String(k + 1).padStart(2, "0")}` }));
    const out = splitInvoices(rows, "2026-10");
    expect(out.current).toBeNull();
    expect(out.past).toHaveLength(24);
    for (let k = 1; k < out.past.length; k++) {
      const [a, b] = [out.past[k - 1], out.past[k]];
      expect(a.month > b.month || (a.month === b.month && (a.issued ?? "") >= (b.issued ?? ""))).toBe(true);
    }
  });
});

describe("sharedWith (AC7)", () => {
  const shared = inv({ number: "AP-2026-0007" });
  it("a same-number row whose student has the same family gives the sibling's first name", () => {
    expect(sharedWith(shared, { "AP-2026-0007": [{ firstName: "Haider", family: " afzal " }] }, "Afzal")).toBe("Haider");
  });
  it("another or empty family gives nothing", () => {
    expect(sharedWith(shared, { "AP-2026-0007": [{ firstName: "Kim", family: "Other" }] }, "Afzal")).toBeNull();
    expect(sharedWith(shared, { "AP-2026-0007": [{ firstName: "Kim", family: "" }] }, "")).toBeNull();
    expect(sharedWith(shared, { "AP-2026-0007": [{ firstName: "Kim", family: "" }] }, "Afzal")).toBeNull();
  });
  it("no sharer gives nothing", () => {
    expect(sharedWith(shared, {}, "Afzal")).toBeNull();
  });
});
