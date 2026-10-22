import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InvoiceRef } from "../../lib/console/cash-pulse";
import type { CashPanelData } from "../../lib/console/finance-panels";
import { PANEL_STATUSES, type PanelStatus, type PanelView } from "../../lib/console/panel-view";
import { CARD_PAYMENTS_FOOTNOTE, CashPulsePanel } from "./cash-pulse";

// REQ-59 AC3, AC4, AC5, AC8: the cash pulse in every status and both variants.
const NOW = "2026-10-22T16:00:00.000Z";
const INVOICES_URL = "https://www.notion.so/invoicesds";
const ref = (i: number, cents: number | null, label: string | null = null): InvoiceRef => ({ id: `inv-${i}`, href: `https://www.notion.so/i${i}`, studentName: `Student ${i}`, month: "2026-10", date: "2026-10-05", cents, label });
const DATA: CashPanelData = {
  window: { days: 30, from: "2026-09-23", to: "2026-10-22" },
  collected: { cents: 192000, rows: [ref(1, 48000, "paid date not recorded"), ref(2, 144000)], missingAmount: [], byIssued: 1, undated: [] },
  outstandingDue: { cents: 31500, rows: [ref(3, 31500)], missingAmount: [] },
  outstandingOverdue: { cents: 119700, rows: [ref(4, 42000, "overdue"), ref(5, 77700, "overdue")], missingAmount: [ref(6, null, "amount missing")] },
  drafts: [ref(7, 99900)], voids: [ref(8, 88800)], unrecognised: [], creditsAppliedCents: 6000,
  links: { label: "Last 30 days, Wed 23 Sep to Thu 22 Oct", others: [{ days: 7, href: "?window=7" }, { days: 90, href: "?window=90" }], operations: "?mode=operations&window=30" },
};
const view = (status: PanelStatus, data: CashPanelData | null = DATA): PanelView<CashPanelData> => ({
  panel: "cashPulse", status, data, count: 2, lastCheckedAt: NOW, lastSuccessfulFetchAt: NOW,
  staleReason: status === "unverifiable" ? "Payment records unavailable: Notion returned 500" : status === "stale" ? "slow" : null,
  errorMessage: status === "error" ? "Read failed" : null,
  sourceEvidence: [{ source: "notion", sourceId: "invoicesds", sourceUrl: INVOICES_URL, observedAt: NOW }],
});
const render = (v: PanelView<CashPanelData>, variant: "full" | "headline" = "full") =>
  renderToStaticMarkup(h(CashPulsePanel, { id: "finance", title: "Finance", emptyText: "No verified payments", result: v, variant }));

describe.each(["full", "headline"] as const)("CashPulsePanel %s", (variant) => {
  it.each(PANEL_STATUSES)("%s shows the Invoices link", (status) => {
    const shows = status === "ready" || status === "stale";
    const out = render(view(status, shows ? DATA : null), variant);
    expect(out).toContain(`href="${INVOICES_URL}"`);
    expect(out).not.toContain("%");
    if (!shows) expect(out).not.toContain("$");
  });
});

describe("CashPulsePanel full", () => {
  it("shows collected, outstanding due and overdue in two decimals, with counts", () => {
    const out = render(view("ready"));
    expect(out).toContain("$1,920.00");
    expect(out).toContain("2 invoices (1 paid date not recorded)");
    expect(out).toContain("$315.00");
    expect(out).toContain("$1,197.00");
    expect(out).toContain("Drafts 1");
    expect(out).toContain("Voids 1");
    expect(out).toContain("Credits applied $60.00");
    expect(out).toContain(CARD_PAYMENTS_FOOTNOTE.replace("'", "&#x27;"));
  });

  it("drafts and voids are never in a sum; a missing amount is listed", () => {
    const out = render(view("ready"));
    const collected = out.slice(out.indexOf('data-cash-line="Collected"'), out.indexOf('data-cash-line="Outstanding due"'));
    expect(collected).not.toContain("$999");
    expect(collected).not.toContain("$888");
    expect(out).toContain('data-cash-list="Amount missing"');
  });

  it("every figure opens a details list", () => {
    const out = render(view("ready"));
    expect(out.split("<details").length - 1).toBeGreaterThanOrEqual(5);
  });
});

describe("CashPulsePanel headline", () => {
  it("shows collected and overdue and links to Operations", () => {
    const out = render(view("ready"), "headline");
    expect(out).toContain("$1,920.00 collected, $1,197.00 overdue");
    expect(out).toContain('href="?mode=operations&amp;window=30"');
  });
});
