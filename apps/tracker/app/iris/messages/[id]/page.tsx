import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CopyReply } from "@/components/iris/copy-reply";
import { DraftEditor } from "@/components/iris/draft-editor";
import { MarkHandled } from "@/components/iris/mark-handled";
import { TopBar } from "@/components/top-bar";
import { Card, Notice, Page } from "@/components/ui";
import { getDb } from "@/lib/data/client";
import { createPeopleStore } from "@/lib/data/people";
import { getViewer } from "@/lib/data/queries";
import { irisMailbox } from "@/lib/iris/config";
import { realIrisAdminDeps } from "@/lib/iris/deps";
import { withSignature } from "@/lib/iris/draft-rules";
import { loadMessage } from "@/lib/iris/handlers";
import { POLICY, SIGNATURE } from "@/lib/iris/policy";
import type { DraftView } from "@/lib/iris/schemas";
import { DRAFT_STATE_LABELS, IRIS_TEXT, confidenceText, flagLabel, gmailThreadUrl, intentLabel, stateLabel } from "@/lib/view/iris-text";

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

const policySection = (type: string) => (POLICY as Record<string, { title: string; text: string } | undefined>)[type] ?? null;

/** The Draft card (REQ-44 AC14): the policy used, the editor on the latest proposed version or Copy after Approve, and earlier versions. */
function DraftCard({ drafts, current, editable }: { drafts: DraftView[]; current: number; editable: boolean }) {
  const latest = drafts[0];
  if (!latest) return <Card title={IRIS_TEXT.draft}><p className="text-sm text-text-muted">{IRIS_TEXT.noDraft}</p></Card>;
  const policy = policySection(latest.replyType);
  const older = drafts.slice(1);
  return (
    <Card title={IRIS_TEXT.draft}>
      {policy && (
        <div className="flex flex-col gap-1 text-sm" data-policy-used>
          <p><span className="text-text-muted">{IRIS_TEXT.policyUsed}:</span> {policy.title}</p>
          <p>{policy.text}</p>
          {latest.policyVersion !== current && <p className="text-text-muted">{IRIS_TEXT.policyVersionNote(latest.policyVersion, current)}</p>}
        </div>
      )}
      {latest.replyType === "reschedule_offer" && (
        <p className="text-sm" data-offer-note>
          {IRIS_TEXT.offerNote}{" "}
          <Link href="/schedule" className="underline">{IRIS_TEXT.bookInSchedule}</Link>
        </p>
      )}
      {latest.state === "proposed" && editable && (
        <DraftEditor key={latest.id} id={latest.id} version={latest.version} body={latest.bodyText} signature={SIGNATURE} />
      )}
      {(latest.state === "approved" || latest.state === "sent") && <CopyReply text={withSignature(latest.bodyText)} />}
      {latest.state !== "proposed" && latest.state !== "approved" && latest.state !== "sent" && (
        <p className="text-sm" data-draft-state={latest.state}>
          {IRIS_TEXT.versionLine(latest.version, DRAFT_STATE_LABELS[latest.state] ?? latest.state, latest.createdBy === "owner" ? IRIS_TEXT.charlie : "Iris")}
          {latest.rejectedReason ? `: ${latest.rejectedReason}` : ""}
        </p>
      )}
      {older.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-muted">{IRIS_TEXT.olderVersions}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {older.map((d) => (
              <li key={d.id} data-draft-version={d.version}>
                <p className="text-text-muted">{IRIS_TEXT.versionLine(d.version, DRAFT_STATE_LABELS[d.state] ?? d.state, d.createdBy === "owner" ? IRIS_TEXT.charlie : "Iris")}</p>
                <pre className="whitespace-pre-wrap break-words font-sans">{d.bodyText}</pre>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** One Iris message (REQ-43 AC14, REQ-44 AC14): what Iris read, the thread, the draft, and Mark handled. Owner only, checked before any Iris read. */
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
              {/* After a refresh the handled state comes from the row, so it never flickers away. */}
              {r.message.state === "escalated" && r.message.handledAt !== null && <p className="text-sm font-medium" data-handled>{IRIS_TEXT.handled}</p>}
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
            <Card title={IRIS_TEXT.thread}>
              {r.view.thread.length === 0 ? (
                <p className="text-sm text-text-muted">{IRIS_TEXT.noEarlierMessages}</p>
              ) : (
                <ul className="flex flex-col gap-2" data-thread>
                  {r.view.thread.map((t) => (
                    <li key={t.id} className="text-sm">
                      <p className="text-text-muted">{when(t.receivedAt)} · {t.direction === "inbound" ? IRIS_TEXT.parent : IRIS_TEXT.charlie}</p>
                      <pre className="whitespace-pre-wrap break-words font-sans">{t.text ?? IRIS_TEXT.bodyNotStored}</pre>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <DraftCard drafts={r.view.drafts} current={r.currentPolicyVersion} editable={r.message.state === "drafted" || r.message.state === "escalated"} />
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
