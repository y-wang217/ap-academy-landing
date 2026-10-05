import Link from "next/link";
import { Card, Empty, Notice, Page, buttonClass } from "@/components/ui";
import { StudentDashboard } from "@/components/student-dashboard";
import { TopBar } from "@/components/top-bar";
import { getViewer, listStudents, loadBundle, openFlagCounts } from "@/lib/data/queries";
import { studentName } from "@/lib/format";
import { todayIso } from "@/lib/time";
import { buildStudentView } from "@/lib/view/student-view";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

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
    const view = buildStudentView(bundle, todayIso());
    return (
      <>
        <TopBar email={viewer.email} />
        <Page title={`Hi ${bundle.student.firstName}`}>
          <StudentDashboard view={view} interactive courseHref={(id) => `/courses/${id}`} />
        </Page>
      </>
    );
  }

  const [students, flags] = await Promise.all([listStudents(viewer.db, viewer.orgId), openFlagCounts(viewer.db, viewer.orgId)]);
  return (
    <>
      <TopBar email={viewer.email} />
      <Page
        title="Students"
        aside={
          <Link href="/students/new" className={buttonClass}>
            Add a student
          </Link>
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
