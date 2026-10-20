import Link from "next/link";
import { setStudentStatus, updateStudent } from "@/app/actions/teacher";
import { ActionButton, ActionForm } from "@/components/action-form";
import { STUDENT_LABELS, StudentFields } from "@/components/teacher/fields";
import { ComposerCard } from "@/components/teacher/composer-card";
import { DraftHistory } from "@/components/teacher/draft-history";
import { FlagList, InvitePanel, TaskManager } from "@/components/teacher/panels";
import { ParentPanel } from "@/components/teacher/parent-panel";
import { PeopleFreshness } from "@/components/people-freshness";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, GradeNote, Notice, Page, linkClass, secondaryButtonClass } from "@/components/ui";
import { listDrafts, listParentLinks } from "@/lib/data/queries";
import { createPeopleStore } from "@/lib/data/people";
import { gap, percent, stamp, studentName, studentNumber } from "@/lib/format";
import { staffStudent } from "@/lib/pages";

export const dynamic = "force-dynamic";
// An AI draft (server action on this page) can take most of a minute.
export const maxDuration = 120;

/**
 * Owners only. A failed lookup shows an empty section rather than breaking the
 * page. The Notion link picker lists active students from the local people
 * copy (REQ-38 AC14), plus the currently linked record so an archived link
 * still shows its name.
 */
async function loadParentPanel(db: Parameters<typeof listParentLinks>[0], studentId: string, orgId: string) {
  const people = createPeopleStore(db.tracker, orgId);
  const [links, record, active, all] = await Promise.all([
    listParentLinks(db, studentId).catch(() => []),
    db.tracker.from("students").select("notion_student_id").eq("id", studentId).maybeSingle(),
    people.activeStudents().catch(() => null),
    people.studentNames().catch(() => null),
  ]);
  const notionStudentId = (record.data as { notion_student_id: string | null } | null)?.notion_student_id ?? null;
  let names: [string, string][] | null = active ? active.map((a) => [a.id, a.name] as [string, string]) : null;
  if (names && notionStudentId && !names.some(([id]) => id === notionStudentId)) {
    const linked = all?.get(notionStudentId);
    if (linked) names = [...names, [notionStudentId, linked]];
  }
  return { links, notionStudentId, names, syncedAt: people.syncedAt };
}

/** Teacher overview of one student: courses, priorities, invite, status. */
export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { viewer, view, orgName, loginEmail } = await staffStudent(studentId);
  const s = view.student;
  const drafts = await listDrafts(viewer.db, studentId);
  const parentPanel = viewer.role === "owner" ? await loadParentPanel(viewer.db, studentId, viewer.orgId) : null;
  const courseCode = (courseId: string) => view.courses.find((c) => c.course.id === courseId)?.course.code ?? null;

  return (
    <>
      <TopBar email={viewer.email} />
      <Page title={studentName(s)} back={{ href: "/", label: "Back to students" }} aside={<span className="text-sm text-text-muted">Grade {s.gradeLevel} · {studentNumber(s.studentNumber)}</span>}>
        {s.status === "setup" && (
          <Notice tone="warn">
            Not published yet. {s.firstName} can&apos;t see anything. <Link className={linkClass} href={`/students/${s.id}/setup/goal`}>Continue setup</Link>
          </Notice>
        )}
        {s.status === "archived" && <Notice>Archived. {s.firstName} can still read their history but can&apos;t mark work done.</Notice>}

        <FlagList view={view} />

        <ComposerCard
          scope={{ studentId: s.id }}
          placeholder="Say what changed, paste marks from the portal, or attach notes, a course outline or a transcript. The AI drafts the changes; you check them before anything is saved."
        />

        <Card title="Progress">
          <p className="text-sm text-text-muted">
            {view.goal ? `${view.goal.program}, ${view.goal.school} · target ${view.goal.targetSixAvg}%` : "No goal set."}
          </p>
          <p className="text-2xl font-semibold">
            {percent(view.progress.averageOfGraded)} <span className="text-sm font-normal text-text-muted">{view.progress.label}</span>
          </p>
          <p className="text-sm text-text-muted">
            {view.progress.gradedCount} of {view.progress.planCount} graded{gap(view.progress.gapToTarget) ? ` · ${gap(view.progress.gapToTarget)}` : ""}
          </p>
          <GradeNote />
        </Card>

        <Card title="Courses" action={<Link className={linkClass} href={`/students/${s.id}/setup/courses`}>Edit courses</Link>}>
          {view.courses.length === 0 ? (
            <Empty>No courses yet.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {view.courses.map((c) => (
                <li key={c.course.id}>
                  <Link href={`/students/${s.id}/courses/${c.course.id}`} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block font-medium">{c.course.code}</span>
                      <span className="block text-sm text-text-muted">
                        {c.course.name}
                        {c.awaiting.length > 0 ? ` · ${c.awaiting.length} awaiting a score` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{percent(c.result.grade)}</span>
                      <span className="block text-xs text-text-muted">{c.course.targetGrade !== null ? `Target ${c.course.targetGrade}%` : "No target"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Priorities and extra practice">
          <TaskManager view={view} />
        </Card>

        <InvitePanel view={view} orgName={orgName} loginEmail={loginEmail} canUnlink={viewer.role === "owner"} />

        {parentPanel && <PeopleFreshness load={parentPanel.syncedAt} />}
        {parentPanel && (
          <ParentPanel
            student={{ id: s.id, firstName: s.firstName, notionStudentId: parentPanel.notionStudentId }}
            orgName={orgName}
            links={parentPanel.links}
            names={parentPanel.names}
          />
        )}

        <DraftHistory drafts={drafts} viewerId={viewer.userId} courseCode={courseCode} />

        <Card title="Student details">
          <ActionForm action={updateStudent.bind(null, s.id)} labels={STUDENT_LABELS} secondary submitLabel="Save details">
            <StudentFields defaults={s} />
          </ActionForm>
          {s.status !== "setup" && (
            <div>
              {s.status === "archived" ? (
                <ActionButton action={setStudentStatus.bind(null, s.id, "active")} label="Restore student" className={secondaryButtonClass} />
              ) : (
                <ActionButton
                  action={setStudentStatus.bind(null, s.id, "archived")}
                  label="Archive student"
                  confirm={`Archive ${s.firstName}? Nothing is deleted.`}
                  className={secondaryButtonClass}
                />
              )}
            </div>
          )}
        </Card>

        <p className="text-xs text-text-muted">Last updated {stamp(view.lastUpdated)}</p>
      </Page>
    </>
  );
}
