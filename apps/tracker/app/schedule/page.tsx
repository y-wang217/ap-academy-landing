import { notFound } from "next/navigation";
import { AllTeachersWeek } from "@/components/scheduler/all-teachers-week";
import { WeekControls } from "@/components/scheduler/week-controls";
import { WeekEditor } from "@/components/scheduler/week-editor";
import { WeekGrid } from "@/components/scheduler/week-grid";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Notice, Page } from "@/components/ui";
import { isActiveTeachingStaff } from "@/lib/domain/staff";
import { getViewer } from "@/lib/data/queries";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { loadWeek } from "@/lib/scheduler/schedule-handlers";
import { formatDayHeading } from "@/lib/view/availability-text";
import { formatHours } from "@/lib/view/week-text";

export const dynamic = "force-dynamic";

type Search = { date?: string; staffId?: string; view?: string };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const query = { date: one(sp.date) || null, staffId: one(sp.staffId) || null, view: one(sp.view) || null };
  const [viewer, deps] = [await getViewer(), realScheduleDeps()];
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;
  const shell = (body: React.ReactNode, title = "Schedule") => (
    <>
      {email && <TopBar email={email} />}
      <Page title={title} back={{ href: "/", label: "Home" }} wide>{body}</Page>
    </>
  );

  const who = await deps.identity();
  if (who.scope === "none" || who.scope === "signed_out") return notFound();

  // The same loader as the route, so this is the server-side check.
  const result = await loadWeek(deps, query).catch(() => null);
  if (!result) return shell(<Notice tone="error">Could not load the schedule. <a className="underline" href="">Try again</a></Notice>);
  if (!result.ok) {
    if (result.status === 403) return shell(<Notice>This page is not available for your account.</Notice>);
    if (result.status === 400 || result.status === 422) return shell(<Notice>That week or teacher could not be shown.</Notice>);
    return shell(<Notice>Scheduling is not available right now.</Notice>);
  }

  const { body } = result;
  const all = query.view === "all";
  let teachers: { id: string; name: string }[] | undefined;
  if (who.scope === "admin") {
    teachers = (await deps.fetchStaff().catch(() => [])).filter(isActiveTeachingStaff).map((s) => ({ id: s.id, name: s.name }));
  }
  // Charlie's per-teacher week can book and move classes; his student picker is names only, loaded on the server.
  let students: { id: string; name: string }[] | null = null;
  if (who.scope === "admin" && !all) {
    try {
      const names = deps.studentNames ? await deps.studentNames() : null;
      students = names ? [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) : null;
    } catch {
      students = null;
    }
  }
  const rows = body.teachers.map((t) => ({
    staff: { id: t.staff.id, name: t.staff.name },
    days: t.days,
    totals: t.totals,
    occurrences: t.occurrences.map((o) => ({ ...o })),
  }));
  const shown = rows[0];
  const title = who.scope === "teacher" ? "Your week" : all ? "All teachers" : shown ? `${shown.staff.name}'s week` : "Schedule";

  return shell(
    <>
      <WeekControls weekStart={body.weekStart} today={body.today} staffId={shown?.staff.id} all={all} teachers={teachers} />
      <h2 className="text-lg font-medium">Week of {formatDayHeading(body.weekStart)}, {body.weekStart.slice(0, 4)}</h2>
      {!body.namesLoaded && <Notice tone="warn">Student names could not be loaded.</Notice>}
      {all ? (
        <AllTeachersWeek teachers={rows} weekStart={body.weekStart} />
      ) : !shown ? (
        <Card><Empty>No teacher selected.</Empty></Card>
      ) : (
        <>
          <p className="text-sm">
            Scheduled {formatHours(shown.totals.scheduledMinutes)} ·{" "}
            {shown.totals.remainingMinutes === null ? "No availability entered" : `${formatHours(shown.totals.remainingMinutes)} available left`}
            {shown.occurrences.some((o) => o.conflict) && <span className="font-medium"> · <span aria-hidden="true">⚠ </span>{shown.occurrences.filter((o) => o.conflict).length} outside hours</span>}
          </p>
          {shown.occurrences.length === 0 && <p className="text-sm text-text-muted">No classes this week.</p>}
          {who.scope === "admin" && teachers ? (
            <WeekEditor days={shown.days} occurrences={shown.occurrences} today={body.today} teacher={shown.staff} teachers={teachers} students={students} />
          ) : (
            <WeekGrid days={shown.days} occurrences={shown.occurrences} today={body.today} />
          )}
        </>
      )}
    </>,
    title,
  );
}
