import Link from "next/link";
import { Card, Empty, Notice, Page, buttonClass, secondaryButtonClass } from "@/components/ui";
import { StudentDashboard } from "@/components/student-dashboard";
import { TopBar } from "@/components/top-bar";
import { getViewer, listStudents, loadBundle, openFlagCounts } from "@/lib/data/queries";
import { studentName } from "@/lib/format";
import { addDays } from "@/lib/domain/schedule/wallclock";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { loadConflicts } from "@/lib/scheduler/schedule-handlers";
import { todayIso } from "@/lib/time";
import { buildStudentView } from "@/lib/view/student-view";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/**
 * Owner only: null hides the link, a number is the badge count (0 shows no
 * badge). Any failure means no badge; it must never break the student list.
 */
async function outsideAvailability(): Promise<number | null> {
  try {
    const deps = realScheduleDeps();
    const who = await deps.identity();
    if (who.scope !== "admin") return null;
    const today = todayIso();
    try {
      return (await loadConflicts(deps, who, { from: today, to: addDays(today, 91) })).conflicts.length;
    } catch {
      return 0;
    }
  } catch {
    return null;
  }
}

const STATUS_LABEL = { setup: "In setup", active: "Active", archived: "Archived" } as const;

export default async function TrackerHome() {
  const viewer = await getViewer();

  if (viewer.kind === "not_configured") {
    return (
      <Page title="Student Tracker">
        <Notice>Sign-in is not configured for this deployment.</Notice>
      </Page>
    );
  }
  if (viewer.kind === "signed_out") {
    // The proxy normally redirects first. Plain <a>: /login belongs to landing.
    return (
      <Page title="Student Tracker">
        <a href="/login?next=/tracker" className="text-accent underline">
          Sign in
        </a>
      </Page>
    );
  }

  if (viewer.kind === "none") {
    // A scheduler teacher has a staff link but no membership: send them to their availability.
    const who = await realScheduleDeps().identity().catch(() => null);
    if (who?.scope === "teacher") {
      return (
        <>
          <TopBar email={viewer.email} />
          <Page title={`Hi ${who.staff.name}`}>
            <Card>
              <Link href="/schedule/availability" className={buttonClass}>
                Set your availability
              </Link>
            </Card>
          </Page>
        </>
      );
    }
    return (
      <>
        <TopBar email={viewer.email} />
        <Page title="Nothing here yet">
          <Card>
            <p>Your tracker isn&apos;t ready yet.</p>
            <p className="text-sm text-text-muted">
              If your teacher has set one up for you, make sure you signed in with the email they used. You are signed in as{" "}
              <strong>{viewer.email}</strong>.
            </p>
          </Card>
        </Page>
      </>
    );
  }

  if (viewer.kind === "student") {
    const bundle = await loadBundle(viewer.db, viewer.studentId);
    if (!bundle) {
      return (
        <>
          <TopBar email={viewer.email} />
          <Page title="Nothing here yet">
            <Empty>Your tracker isn&apos;t available right now.</Empty>
          </Page>
        </>
      );
    }
    const today = todayIso();
    const view = buildStudentView(bundle, today);
    return (
      <>
        <TopBar email={viewer.email} />
        <Page title={`Hi ${bundle.student.firstName}`}>
          <StudentDashboard view={view} interactive courseHref={(id) => `/courses/${id}`} today={today} />
        </Page>
      </>
    );
  }

  const [students, flags, outside] = await Promise.all([listStudents(viewer.db, viewer.orgId), openFlagCounts(viewer.db, viewer.orgId), outsideAvailability()]);
  return (
    <>
      <TopBar email={viewer.email} />
      <Page
        title="Students"
        aside={
          <span className="flex flex-wrap items-center gap-2">
            {outside !== null && (
              <Link href="/schedule/availability" className={secondaryButtonClass}>
                Teacher availability
                {outside > 0 && (
                  <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">
                    {outside} {outside === 1 ? "class" : "classes"} outside availability
                  </span>
                )}
              </Link>
            )}
            <Link href="/students/new" className={buttonClass}>
              Add a student
            </Link>
          </span>
        }
      >
        <Card>
          {students.length === 0 ? (
            <Empty>No students yet. Add one to start setup.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {students.map((s) => (
                <li key={s.id}>
                  <Link href={s.status === "setup" ? `/students/${s.id}/setup/goal` : `/students/${s.id}`} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block font-medium">{studentName(s)}</span>
                      <span className="block text-sm text-text-muted">Grade {s.gradeLevel}</span>
                    </span>
                    <span className="text-sm text-text-muted">
                      {STATUS_LABEL[s.status]}
                      {s.status !== "setup" && !s.userId ? " · Not signed in yet" : ""}
                      {flags.get(s.id) ? <span className="block text-right font-medium text-warn">{flags.get(s.id) === 1 ? "1 flag" : `${flags.get(s.id)} flags`}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Page>
    </>
  );
}
