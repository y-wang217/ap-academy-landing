import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Notice, Page, secondaryButtonClass } from "@/components/ui";
import { getViewer } from "@/lib/data/queries";
import { getDb } from "@/lib/data/client";
import { createPeopleStore } from "@/lib/data/people";
import { irisMailbox } from "@/lib/iris/config";
import { realIrisAdminDeps } from "@/lib/iris/deps";
import { loadInbox, type InboxRow } from "@/lib/iris/handlers";
import { SCHEDULE_FLAGS } from "@/lib/iris/policy";
import { IRIS_TEXT, ageText, confidenceText, flagLabel, gmailThreadUrl, intentLabel, stateLabel } from "@/lib/view/iris-text";

export const dynamic = "force-dynamic";

function Row({ row, now, mailbox }: { row: InboxRow; now: number; mailbox: string | null }) {
  return (
    <li className="flex flex-col gap-1 py-2 text-sm" data-message={row.id}>
      {/* Same app: next/link to the message page (REQ-43). */}
      <Link href={`/iris/messages/${row.id}`} className="font-medium underline-offset-2 hover:underline">
        {row.family}{row.child ? ` (${row.child})` : ""} · {row.subject ?? "(no subject)"} · {ageText(row.receivedAt, now)} · {row.intent ? `${intentLabel(row.intent)} · ` : ""}
        {row.confidence !== null ? `${confidenceText(row.confidence)} · ` : ""}
        {stateLabel(row.state, row.escalationReason, { flags: row.flags, intent: row.intent })}
      </Link>
      {/* The schedule flag never escalates, so it is shown beside the state (REQ-46). */}
      {row.flags.filter((f) => (SCHEDULE_FLAGS as readonly string[]).includes(f)).map((f) => (
        <span key={f} className="text-xs text-text-muted" data-flag={f}>{flagLabel(f)}</span>
      ))}
      {row.pushFailed && <span className="text-xs font-medium text-error" data-push-failed>{IRIS_TEXT.phoneCopyFailed}</span>}
      {row.snippet && <span className="text-text-muted">&ldquo;{row.snippet}&rdquo;</span>}
      {/* Plain anchor: Gmail is outside the app. */}
      <a href={gmailThreadUrl(mailbox, row.gmailThreadId)} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
        {IRIS_TEXT.openInGmail}
      </a>
    </li>
  );
}

function Section({ title, rows, empty, now, mailbox }: { title: string; rows: InboxRow[]; empty: string; now: number; mailbox: string | null }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? <Empty>{empty}</Empty> : (
        <ul className="flex flex-col divide-y divide-border">{rows.map((r) => <Row key={r.id} row={r} now={now} mailbox={mailbox} />)}</ul>
      )}
    </Card>
  );
}

/**
 * Charlie's Iris queue (REQ-42 AC26, REQ-44 AC13): Needs you, Drafts waiting,
 * Sent today and Failed, then Recent. Owner only: anyone else goes home
 * before any Iris read.
 */
export default async function IrisInboxPage() {
  // Names come from the local people copy on the owner's own client (REQ-38); the page never reads Notion.
  const studentNames = async (orgId: string) => {
    const db = await getDb();
    return db ? createPeopleStore(db.tracker, orgId).studentNames() : new Map<string, string>();
  };
  const inbox = await loadInbox({ ...realIrisAdminDeps(), studentNames });
  if (inbox.kind === "denied") redirect("/");
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;
  const mailbox = irisMailbox();

  return (
    <>
      {email && <TopBar email={email} />}
      <Page title={IRIS_TEXT.title} back={{ href: "/", label: "Home" }} aside={<Link href="/iris/settings" className={secondaryButtonClass}>Settings</Link>}>
        {inbox.kind === "error" ? (
          <Notice tone="error">{IRIS_TEXT.loadError}</Notice>
        ) : (
          <>
            {inbox.paused && <Notice tone="warn">{IRIS_TEXT.paused}</Notice>}
            <Section title={IRIS_TEXT.needsYou} rows={inbox.needsYou} empty={IRIS_TEXT.nothingNeedsYou} now={inbox.nowMs} mailbox={mailbox} />
            <Section title={IRIS_TEXT.draftsWaiting} rows={inbox.drafts} empty={IRIS_TEXT.noDraftsWaiting} now={inbox.nowMs} mailbox={mailbox} />
            <Section title={IRIS_TEXT.sentToday} rows={inbox.sentToday} empty={IRIS_TEXT.nothingSentToday} now={inbox.nowMs} mailbox={mailbox} />
            <Section title={IRIS_TEXT.failedSection} rows={inbox.failed} empty={IRIS_TEXT.nothingFailed} now={inbox.nowMs} mailbox={mailbox} />
            <Section title={IRIS_TEXT.recent} rows={inbox.recent} empty={IRIS_TEXT.noMail} now={inbox.nowMs} mailbox={mailbox} />
          </>
        )}
      </Page>
    </>
  );
}
