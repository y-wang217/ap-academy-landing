import Link from "next/link";
import { notFound } from "next/navigation";
import { addCourse, deleteCourse, publishStudent, saveGoal, saveTarget, updateCourse } from "@/app/actions/teacher";
import { ActionButton, ActionForm } from "@/components/action-form";
import { StudentDashboard } from "@/components/student-dashboard";
import { ComposerCard } from "@/components/teacher/composer-card";
import { COURSE_LABELS, CourseFields, GOAL_LABELS, GoalFields } from "@/components/teacher/fields";
import { InvitePanel, SyllabusEditor } from "@/components/teacher/panels";
import { STEPS, WizardNav, type StepKey } from "@/components/teacher/wizard-nav";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Field, Notice, Page, buttonClass, linkClass, numberInputClass } from "@/components/ui";
import { checkCourseTargets } from "@/lib/domain/progress";
import { TUNING } from "@/lib/domain/tuning";
import { percent, points, studentName, studentNumber } from "@/lib/format";
import { staffStudent } from "@/lib/pages";

export const dynamic = "force-dynamic";
// An AI draft (server action on this page) can take most of a minute.
export const maxDuration = 120;

/**
 * Onboarding wizard (build step 4): goal, six courses, targets, syllabus
 * categories, starting grades and upcoming work, review, publish.
 */
export default async function SetupPage({ params }: { params: Promise<{ studentId: string; step: string }> }) {
  const { studentId, step } = await params;
  if (!STEPS.some((s) => s.key === step)) notFound();
  const { viewer, view, orgName } = await staffStudent(studentId);
  const current = step as StepKey;
  const name = studentName(view.student);

  return (
    <>
      <TopBar email={viewer.email} />
      <Page title={`Set up ${name}`} back={{ href: view.student.publishedAt ? `/students/${studentId}` : "/", label: view.student.publishedAt ? "Back to student" : "Back to students" }}>
        <WizardNav studentId={studentId} current={current} />
        {current !== "review" && (
          <ComposerCard
            scope={{ studentId }}
            title="Fill in from the trial lesson"
            placeholder={`Attach your notes (written for ${studentNumber(view.student.studentNumber)}), the Zoom transcript or a course outline, or type what you know. The draft fills in the goal, courses, targets and syllabus; you check it before anything is saved.`}
          />
        )}
        {current === "goal" && <GoalStep view={view} />}
        {current === "courses" && <CoursesStep view={view} />}
        {current === "targets" && <TargetsStep view={view} />}
        {current === "syllabus" && <SyllabusStep view={view} />}
        {current === "work" && <WorkStep view={view} />}
        {current === "review" && <ReviewStep view={view} orgName={orgName} />}
      </Page>
    </>
  );
}

type V = Awaited<ReturnType<typeof staffStudent>>["view"];

function GoalStep({ view }: { view: V }) {
  return (
    <Card title="Goal">
      <p className="text-sm text-text-muted">The program they are aiming for and the six-course average you are targeting.</p>
      <ActionForm action={saveGoal.bind(null, view.student.id)} labels={GOAL_LABELS} submitLabel="Save goal">
        <GoalFields defaults={view.goal} />
      </ActionForm>
    </Card>
  );
}

function CoursesStep({ view }: { view: V }) {
  const inPlan = view.courses.filter((c) => c.course.inSixPlan).length;
  return (
    <>
      <Card title="Courses">
        <p className={`text-sm font-medium ${inPlan === TUNING.sixCourseCount ? "text-ok" : "text-warn"}`}>
          {inPlan} of {TUNING.sixCourseCount} courses in the six-course plan.
        </p>
        {view.courses.length === 0 && <Empty>No courses yet.</Empty>}
        {view.courses.map(({ course, version }) => (
          <div key={course.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <ActionForm action={updateCourse.bind(null, course.id)} labels={COURSE_LABELS} secondary submitLabel="Save course">
              <CourseFields idPrefix={`c-${course.id}`} defaults={course} />
            </ActionForm>
            {!version?.confirmedAt && (
              <div>
                <ActionButton
                  action={deleteCourse.bind(null, course.id)}
                  label="Remove course"
                  confirm={`Remove ${course.code} and everything in it?`}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium"
                />
              </div>
            )}
          </div>
        ))}
      </Card>
      <Card title="Add a course">
        <ActionForm action={addCourse.bind(null, view.student.id)} labels={COURSE_LABELS} submitLabel="Add course" resetOnSuccess>
          <CourseFields idPrefix="new-course" />
        </ActionForm>
      </Card>
    </>
  );
}

function TargetsStep({ view }: { view: V }) {
  const plan = view.courses.filter((c) => c.course.inSixPlan);
  const goalTarget = view.goal?.targetSixAvg ?? null;
  const check = goalTarget === null ? null : checkCourseTargets(plan.map((c) => c.course.targetGrade), goalTarget);
  return (
    <Card title="Targets">
      {goalTarget === null ? (
        <Notice tone="warn">Set the goal first. Course targets are checked against its six-course target.</Notice>
      ) : (
        <p className="text-sm">Six-course target: <strong>{goalTarget}%</strong></p>
      )}
      {check?.kind === "mismatch" && (
        <Notice tone="warn">
          Course targets average {points(Math.round(check.average * 10) / 10)}%, which is {points(Math.abs(Math.round(check.difference * 10) / 10))} points{" "}
          {check.difference < 0 ? "below" : "above"} the six-course target. You can still continue.
        </Notice>
      )}
      {check?.kind === "ok" && <Notice tone="ok">Course targets average {points(Math.round(check.average * 10) / 10)}%, in line with the goal.</Notice>}
      {check?.kind === "incomplete" && <Notice>{check.missing} of the six courses still need a target.</Notice>}
      {view.courses.length === 0 && <Empty>Add courses first.</Empty>}
      <ul className="flex flex-col gap-3">
        {view.courses.map(({ course }) => (
          <li key={course.id} className="rounded-xl border border-border p-3">
            <ActionForm action={saveTarget.bind(null, course.id)} labels={{ targetGrade: "Target" }} secondary submitLabel="Save" className="flex flex-wrap items-end gap-3">
              <Field label={`${course.code} target (%)`} name={`target-${course.id}`} hint={course.inSixPlan ? undefined : "Not in the six-course plan"}>
                <input id={`target-${course.id}`} name="targetGrade" inputMode="decimal" defaultValue={course.targetGrade ?? ""} className={numberInputClass} />
              </Field>
            </ActionForm>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SyllabusStep({ view }: { view: V }) {
  if (view.courses.length === 0) return <Card title="Syllabus"><Empty>Add courses first.</Empty></Card>;
  return (
    <>
      {view.courses.map((c) => (
        <Card key={c.course.id} title={`${c.course.code} syllabus`}>
          <SyllabusEditor view={c} />
        </Card>
      ))}
    </>
  );
}

function WorkStep({ view }: { view: V }) {
  return (
    <Card title="Starting grades and upcoming work">
      <p className="text-sm text-text-muted">
        For each course, add marks already returned and the work coming up. Later, enter each score on the same item.
      </p>
      {view.courses.length === 0 && <Empty>Add courses first.</Empty>}
      <ul className="flex flex-col divide-y divide-border">
        {view.courses.map((c) => (
          <li key={c.course.id} className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block font-medium">{c.course.code}</span>
              <span className="block text-sm text-text-muted">
                {c.graded.length} marked · {c.upcoming.length} upcoming · current {percent(c.result.grade)}
              </span>
            </span>
            <Link className={linkClass} href={`/students/${view.student.id}/courses/${c.course.id}`}>
              Add work
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReviewStep({ view, orgName }: { view: V; orgName: string }) {
  const problems: string[] = [];
  if (!view.goal) problems.push("Add a goal.");
  if (view.courses.length === 0) problems.push("Add at least one course.");
  for (const c of view.courses) {
    if (c.syllabusErrors.length > 0) problems.push(`${c.course.code}: category weights must add up to 100.`);
  }
  const warnings: string[] = [];
  const inPlan = view.courses.filter((c) => c.course.inSixPlan).length;
  if (inPlan !== TUNING.sixCourseCount) warnings.push(`${inPlan} of ${TUNING.sixCourseCount} courses are in the six-course plan.`);
  const missingTargets = view.courses.filter((c) => c.course.targetGrade === null).length;
  if (missingTargets > 0) warnings.push(`${missingTargets} course${missingTargets === 1 ? " has" : "s have"} no target.`);
  for (const c of view.courses) {
    for (const w of c.result.warnings) if (w.kind === "needs_review") warnings.push(`${c.course.code}: ${w.categoryName} is flagged for review.`);
  }

  const published = view.student.publishedAt !== null;
  return (
    <>
      <Card title={published ? "Published" : "Before publishing"}>
        {published ? (
          <Notice tone="ok">
            {view.student.firstName} can see this. <Link className={linkClass} href={`/students/${view.student.id}`}>Go to the student page</Link>
          </Notice>
        ) : (
          <>
            {problems.length > 0 ? (
              <Notice tone="error">
                {problems.map((p) => (
                  <span key={p} className="block">{p}</span>
                ))}
              </Notice>
            ) : (
              <Notice tone="ok">Ready to publish.</Notice>
            )}
            {warnings.length > 0 && (
              <Notice tone="warn">
                {warnings.map((w) => (
                  <span key={w} className="block">{w}</span>
                ))}
              </Notice>
            )}
            <p className="text-sm text-text-muted">
              Publishing confirms each course&apos;s syllabus (weights become read-only) and lets {view.student.firstName} sign in and see the dashboard below.
            </p>
            <div>
              <ActionButton action={publishStudent.bind(null, view.student.id)} label="Publish" pendingLabel="Publishing..." className={buttonClass} />
            </div>
          </>
        )}
      </Card>
      <InvitePanel view={view} orgName={orgName} />
      <h2 className="text-lg font-semibold">What {view.student.firstName} will see</h2>
      <StudentDashboard view={view} interactive={false} courseHref={(id) => `/students/${view.student.id}/courses/${id}`} />
    </>
  );
}
