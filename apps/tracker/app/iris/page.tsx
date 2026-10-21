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
import { IRIS_TEXT, ageText, gmailThreadUrl, intentLabel, stateLabel } from "@/lib/view/iris-text";

export const dynamic = "force-dynamic";

function Row({ row, now, mailbox }: { row: InboxRow; now: number; mailbox: string | null }) {
  return (
    <li className="flex flex-col gap-1 py-2 text-sm" data-message={row.id}>
      {/* Same app: next/link to the message page (REQ-43). */}
      <Link href={`/iris/messages/${row.id}`} className="font-medium underline-offset-2 hover:underline">
        {row.family} · {row.subject ?? "(no subject)"} · {ageText(row.receivedAt, now)} · {row.intent ? `${intentLabel(row.intent)} · ` : ""}
        {stateLabel(row.state, row.escalationReason, { flags: row.flags, intent: row.intent })}
      </Link>
      {row.snippet && <span className="text-text-muted">&ldquo;{row.snippet}&rdquo;</span>}
      {/* Plain anchor: Gmail is outside the app. */}
      <a href={gmailThreadUrl(mailbox, row.gmailThreadId)} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
        {IRIS_TEXT.openInGmail}
      </a>
    </li>
  );
}

/** Charlie's Iris inbox (REQ-42 AC26). Owner only: anyone else goes home before any Iris read. */
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
            <Card title={IRIS_TEXT.needsYou}>
              {inbox.needsYou.length === 0 ? <Empty>{IRIS_TEXT.nothingNeedsYou}</Empty> : (
                <ul className="flex flex-col divide-y divide-border">{inbox.needsYou.map((r) => <Row key={r.id} row={r} now={inbox.nowMs} mailbox={mailbox} />)}</ul>
              )}
            </Card>
            <Card title={IRIS_TEXT.recent}>
              {inbox.recent.length === 0 ? <Empty>{IRIS_TEXT.noMail}</Empty> : (
                <ul className="flex flex-col divide-y divide-border">{inbox.recent.map((r) => <Row key={r.id} row={r} now={inbox.nowMs} mailbox={mailbox} />)}</ul>
              )}
            </Card>
          </>
        )}
      </Page>
    </>
  );
}
