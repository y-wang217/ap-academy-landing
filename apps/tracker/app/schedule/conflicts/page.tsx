import Link from "next/link";
import { notFound } from "next/navigation";
import { PeopleFreshness } from "@/components/people-freshness";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Notice, Page } from "@/components/ui";
import { addDays } from "@/lib/domain/schedule/wallclock";
import { getViewer } from "@/lib/data/queries";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { loadConflicts } from "@/lib/scheduler/schedule-handlers";
import { todayIso } from "@/lib/time";
import { conflictReasonText, formatDayHeading } from "@/lib/view/availability-text";

export const dynamic = "force-dynamic";

export default async function ConflictsPage() {
  const deps = realScheduleDeps();
  const who = await deps.identity();
  if (who.scope !== "admin") notFound();
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;

  const today = todayIso();
  const [result, staff] = await Promise.all([
    loadConflicts(deps, who, { from: today, to: addDays(today, 91) }).catch(() => null),
    deps.fetchStaff().catch(() => []),
  ]);
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? "Unknown teacher";
  const byDate = new Map<string, NonNullable<typeof result>["conflicts"]>();
  for (const c of result?.conflicts ?? []) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);

  return (
    <>
      {email && <TopBar email={email} />}
      <Page title="Classes outside availability" back={{ href: "/", label: "Home" }}>
        <PeopleFreshness load={deps.peopleSyncedAt} />
        {!result ? (
          <Notice tone="error">Could not load conflicts. Try again shortly.</Notice>
        ) : (
          <>
            {result.conflicts.length === 0 ? <Card><Empty>No classes are outside availability</Empty></Card> : (
              [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => (
                <Card key={date} title={formatDayHeading(date)}>
                  <ul className="flex flex-col divide-y divide-border">
                    {rows.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((c) => (
                      <li key={c.occurrenceKey} className="flex flex-col gap-1 py-2 text-sm">
                        <span className="font-medium">{c.startTime}-{c.endTime} · {name(c.staffId)} · {c.subject}</span>
                        <span className="text-text-muted">{conflictReasonText(c.reason)}</span>
                        <Link href={`/schedule/availability?staffId=${c.staffId}`} className="text-accent underline underline-offset-2">
                          {name(c.staffId)}&apos;s availability
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))
            )}
            {result.notEntered.length > 0 && (
              <Card title="No availability entered">
                <p className="text-sm text-text-muted">These teachers have classes but no availability yet, so their classes are not checked.</p>
                <ul className="list-disc pl-5 text-sm">
                  {result.notEntered.map((id) => <li key={id}><Link href={`/schedule/availability?staffId=${id}`} className="text-accent underline underline-offset-2">{name(id)}</Link></li>)}
                </ul>
              </Card>
            )}
          </>
        )}
      </Page>
    </>
  );
}
