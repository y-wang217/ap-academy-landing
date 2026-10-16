import type { ReactNode } from "react";
import { Card, Empty } from "@/components/ui";
import type { BillingView, Pill } from "@/lib/view/parent-billing";

// Tones per ADR 0049: Paid ok, Due warn, Overdue error; Open warn, Applied and Made up ok, Forfeited error. Every pill has its word.
const TONE: Record<string, string> = {
  paid: "bg-ok-bg text-ok",
  due: "bg-warn-bg text-warn",
  overdue: "bg-error-bg text-error",
  open: "bg-warn-bg text-warn",
  applied: "bg-ok-bg text-ok",
  "made-up": "bg-ok-bg text-ok",
  forfeited: "bg-error-bg text-error",
};

function StatePill({ pill }: { pill: Pill }) {
  return <span data-state={pill.state} className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[pill.state] ?? ""}`}>{pill.label}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/** The parent Billing tab (REQ-25). Read-only: links to the tracker's PDF route, nothing to type or press. */
export function ParentBilling({ view }: { view: BillingView }) {
  const { card } = view;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div>
          <h1 className="text-xl font-semibold">{view.header.name}</h1>
          {view.header.grade && <p className="text-sm text-text-muted">{view.header.grade}</p>}
        </div>
        {card ? (
          <div data-invoice-card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-text-muted">{card.title}</p>
                <p className="text-3xl font-semibold">{card.amount}</p>
                {card.shared && <p className="text-sm text-text-muted">{card.shared}</p>}
              </div>
              <div className="flex min-w-[9rem] flex-col gap-1">
                <Row label="Issued">{card.issued}</Row>
                <Row label="Due">{card.due}</Row>
                <Row label="Status"><StatePill pill={card.pill} /></Row>
              </div>
            </div>
            {card.credit && (
              <div className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
                <p className="font-medium">{card.credit.total}</p>
                <ul>
                  {card.credit.lines.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}
            {card.pdfHref && <a href={card.pdfHref} className="text-sm text-accent underline underline-offset-2">View PDF</a>}
          </div>
        ) : (
          <Empty>No invoice yet this month</Empty>
        )}
      </Card>

      <Card title="Credits">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-text-muted">Open total</span>
          <span data-open-total className="text-2xl font-semibold">{view.openTotal}</span>
        </div>
        {view.credits.length === 0 ? (
          <Empty>No credits</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {view.credits.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{[c.date, c.course].filter(Boolean).join(" · ")}</p>
                  <p className="text-text-muted">{[c.hours, c.amount].filter(Boolean).join(" · ")}</p>
                </div>
                <StatePill pill={c.pill} />
              </li>
            ))}
          </ul>
        )}
        {view.hasOpen && <p className="text-xs text-text-muted">Open credits come off your next invoice.</p>}
      </Card>

      <Card title="Past invoices">
        {view.past.length === 0 ? (
          <Empty>No past invoices</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {view.past.map((p) => {
              const body = (
                <>
                  <div className="min-w-0">
                    <p className="font-medium">{p.month}</p>
                    {p.shared && <p className="text-text-muted">{p.shared}</p>}
                  </div>
                  <span className="flex items-center gap-2">
                    <span>{p.amount}</span>
                    <StatePill pill={p.pill} />
                  </span>
                </>
              );
              return (
                <li key={p.key} className="text-sm">
                  {p.pdfHref ? (
                    <a href={p.pdfHref} className="flex items-center justify-between gap-2 py-2">{body}</a>
                  ) : (
                    <div className="flex items-center justify-between gap-2 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {view.rateLine && <p className="text-xs text-text-muted">{view.rateLine}</p>}
    </div>
  );
}
