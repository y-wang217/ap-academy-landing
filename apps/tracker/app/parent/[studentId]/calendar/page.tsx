import { ParentCalendar } from "@/components/parent-calendar";
import { PeopleFreshness } from "@/components/people-freshness";
import { Card, Empty, Notice } from "@/components/ui";
import { loadChildCalendar, teacherNames } from "@/lib/data/parent-calendar";
import { createPeopleStore } from "@/lib/data/people";
import { createScheduleStore } from "@/lib/data/schedule";
import { buildMonth, parseMonth } from "@/lib/domain/schedule/month";
import { parentChild } from "@/lib/pages";
import { todayIso } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The child's scheduler classes for one month, read-only (REQ-24, ADR 0047). */
export default async function ParentCalendarPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ month?: string | string[] }> }) {
  const { studentId } = await params;
  const { month } = await searchParams;
  const { viewer, child } = await parentChild(studentId);
  // The layout already shows "Not ready yet"; no class read runs for an unpublished child.
  if (!child.published) return null;

  const store = createScheduleStore(async () => ({ db: viewer.db, orgId: child.orgId, userId: viewer.userId }));
  const data = await loadChildCalendar(viewer, child, store);
  if (data.kind === "not_available") {
    return (
      <Card>
        <Empty>Schedule not available yet</Empty>
      </Card>
    );
  }
  if (data.kind === "error") {
    return (
      <Card>
        <Notice tone="error">Could not load classes. Try again later.</Notice>
      </Card>
    );
  }

  const today = todayIso();
  const view = buildMonth({
    series: data.series,
    exceptions: data.exceptions,
    month: parseMonth(typeof month === "string" ? month : undefined, today),
    today,
    now: new Date().toISOString(),
  });
  const shown = [...view.weeks.flat().flatMap((d) => d.classes), ...view.thisWeek].map((c) => c.staffId);
  // Teacher names from the local people copy on the parent's own client (REQ-38): RLS gives only the child's teachers.
  const people = createPeopleStore(viewer.db.tracker, child.orgId);
  const staff = await teacherNames([...new Set(shown)], people.listStaff);

  return (
    <>
      <PeopleFreshness load={people.syncedAt} />
      <ParentCalendar
        key={view.month}
        view={view}
        path={`/parent/${child.id}/calendar`}
        names={staff.names}
        namesFailed={staff.failed}
        header={data.header}
      />
    </>
  );
}
