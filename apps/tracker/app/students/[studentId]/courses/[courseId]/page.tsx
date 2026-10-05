import Link from "next/link";
import { notFound } from "next/navigation";
import { saveTarget } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { ComposerCard } from "@/components/teacher/composer-card";
import { AssessmentManager, SyllabusEditor } from "@/components/teacher/panels";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Field, GradeNote, Page, linkClass, numberInputClass } from "@/components/ui";
import { gap, percent, points, stamp, studentName } from "@/lib/format";
import { staffStudent } from "@/lib/pages";

export const dynamic = "force-dynamic";
// An AI draft (server action on this page) can take most of a minute.
export const maxDuration = 120;

/** Teacher course view (build step 5): assessments, scores, syllabus, target. */
export default async function TeacherCoursePage({ params }: { params: Promise<{ studentId: string; courseId: string }> }) {
  const { studentId, courseId } = await params;
  const { viewer, view } = await staffStudent(studentId);
  const course = view.courses.find((c) => c.course.id === courseId);
  if (!course) notFound();
  const lastUpdated = [course.course.updatedAt, ...course.assessments.map((a) => a.updatedAt)].sort().at(-1) ?? null;

  return (
    <>
      <TopBar email={viewer.email} />
      <Page
        title={`${course.course.code} ${course.course.name}`}
        back={{ href: view.student.publishedAt ? `/students/${studentId}` : `/students/${studentId}/setup/work`, label: `Back to ${studentName(view.student)}` }}
      >
        <Card title="Current grade">
          <p className="text-3xl font-semibold">{percent(course.result.grade)}</p>
          <p className="text-sm text-text-muted">
            {course.course.targetGrade !== null ? `Target ${course.course.targetGrade}%` : "No target"}
            {gap(course.gapToTarget) ? ` · ${gap(course.gapToTarget)}` : ""}
          </p>
          <GradeNote />
          <ul className="flex flex-col divide-y divide-border text-sm">
            {course.result.categories.map((c) => (
              <li key={c.categoryId} className="flex justify-between py-1.5">
                <span>
                  {c.name} ({points(c.weight)}%)
                </span>
                <span>{percent(c.percent, "None yet")}</span>
              </li>
            ))}
          </ul>
          <ActionForm action={saveTarget.bind(null, course.course.id)} labels={{ targetGrade: "Target" }} secondary submitLabel="Save target" className="flex flex-wrap items-end gap-3">
            <Field label="Course target (%)" name="course-target">
              <input id="course-target" name="targetGrade" inputMode="decimal" defaultValue={course.course.targetGrade ?? ""} className={numberInputClass} />
            </Field>
          </ActionForm>
        </Card>

        <ComposerCard
          scope={{ studentId, courseId: course.course.id }}
          placeholder={`Say what changed in ${course.course.code}, paste marks from the portal, or attach a screenshot. The AI drafts the changes; you check them before anything is saved.`}
        />

        <Card title="Assessments">
          <AssessmentManager view={course} />
        </Card>

        <Card title="Syllabus">
          {course.version ? <SyllabusEditor view={course} /> : <Empty>No syllabus version.</Empty>}
        </Card>

        <p className="text-xs text-text-muted">
          Last updated {stamp(lastUpdated)} · <Link className={linkClass} href={`/students/${studentId}`}>Priorities for this student</Link>
        </p>
      </Page>
    </>
  );
}
