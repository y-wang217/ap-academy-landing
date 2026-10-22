import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MarkHandled } from "@/components/iris/mark-handled";
import { TopBar } from "@/components/top-bar";
import { Card, Notice, Page } from "@/components/ui";
import { getDb } from "@/lib/data/client";
import { createPeopleStore } from "@/lib/data/people";
import { getViewer } from "@/lib/data/queries";
import { irisMailbox } from "@/lib/iris/config";
import { realIrisAdminDeps } from "@/lib/iris/deps";
import { loadMessage } from "@/lib/iris/handlers";
import { IRIS_TEXT, confidenceText, flagLabel, gmailThreadUrl, intentLabel, stateLabel } from "@/lib/view/iris-text";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="text-sm">
      <span className="text-text-muted">{label}:</span> {children}
    </p>
  );
}

/** One Iris message (REQ-43 AC14): what Iris read, the body, and Mark handled. Owner only, checked before any Iris read. */
export default async function IrisMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentNames = async (orgId: string) => {
    const db = await getDb();
    return db ? createPeopleStore(db.tracker, orgId).studentNames() : new Map<string, string>();
  };
  const r = await loadMessage({ ...realIrisAdminDeps(), studentNames }, id);
  if (r.kind === "denied") redirect("/");
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;

  return (
    <>
      {email && <TopBar email={email} />}
      <Page title={r.kind === "ok" ? (r.message.subject ?? "(no subject)") : IRIS_TEXT.title} back={{ href: "/iris", label: IRIS_TEXT.inbox }}>
        {r.kind === "error" && <Notice tone="error">{IRIS_TEXT.messageLoadError}</Notice>}
        {r.kind === "not_found" && <Notice tone="warn">{IRIS_TEXT.messageNotFound}</Notice>}
        {r.kind === "ok" && (
          <>
            <Card>
              <p className="text-sm font-medium" data-family>{r.message.family}</p>
              <Field label={IRIS_TEXT.from}>{r.message.fromName ? `${r.message.fromName} <${r.message.fromEmail}>` : r.message.fromEmail}</Field>
              <Field label={IRIS_TEXT.received}>{when(r.message.receivedAt)}</Field>
              <Field label={IRIS_TEXT.state}>
                <span data-state={r.message.state}>{stateLabel(r.message.state, r.message.escalationReason, { flags: r.message.flags, intent: r.message.intent })}</span>
              </Field>
              {r.message.state === "escalated" && r.message.handledAt === null && <MarkHandled id={r.message.id} />}
            </Card>
            <Card title={IRIS_TEXT.whatIrisRead}>
              <Field label={IRIS_TEXT.intent}><span data-intent>{intentLabel(r.message.intent)}</span></Field>
              <Field label={IRIS_TEXT.confidence}><span data-confidence>{confidenceText(r.message.confidence)}</span></Field>
              <Field label={IRIS_TEXT.flags}>
                {r.message.flags.length === 0 ? IRIS_TEXT.none : (
                  <span className="inline-flex flex-wrap gap-1">
                    {r.message.flags.map((f) => <span key={f} className="rounded border border-border px-1.5 text-xs" data-flag={f}>{flagLabel(f)}</span>)}
                  </span>
                )}
              </Field>
              {r.message.escalationReason && <Field label={IRIS_TEXT.reason}>{stateLabel("escalated", r.message.escalationReason, { flags: r.message.flags, intent: r.message.intent })}</Field>}
              {r.message.policyVersion !== null && <Field label={IRIS_TEXT.policyVersion}>{r.message.policyVersion}</Field>}
            </Card>
            <Card>
              {r.message.bodyText === null ? (
                <p className="text-sm text-text-muted">{IRIS_TEXT.bodyNotStored}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm" data-body>{r.message.bodyText}</pre>
              )}
              {/* Plain anchor: Gmail is outside the app. */}
              <a href={gmailThreadUrl(irisMailbox(), r.message.gmailThreadId)} target="_blank" rel="noreferrer" className="text-sm text-accent underline underline-offset-2">
                {IRIS_TEXT.openInGmail}
              </a>
            </Card>
          </>
        )}
      </Page>
    </>
  );
}
