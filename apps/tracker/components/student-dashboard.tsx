import Link from "next/link";
import { STATE_LABEL } from "@/lib/domain/assessment-state";
import { gap, percent, shortDate, stamp } from "@/lib/format";
import type { StudentView } from "@/lib/view/student-view";
import { DoneButton } from "./done-button";
import { Card, Empty, GradeNote, StateBadge } from "./ui";

/**
 * The student dashboard, in the required order: target, progress, active
 * subjects, next priorities, upcoming. Also the teacher's review preview, with
 * Done buttons shown as plain states.
 */
export function StudentDashboard({
  view,
  interactive,
  courseHref,
}: {
  view: StudentView;
  interactive: boolean;
  courseHref: (courseId: string) => string;
}) {
  const { goal, progress } = view;
  const courseCode = new Map(view.courses.map((c) => [c.course.id, c.course.code]));

  return (
    <div className="flex flex-col gap-4">
      <Card title="Target">
        {goal ? (
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold">
              {goal.program}, {goal.school}
            </p>
            <p className="text-sm text-text-muted">
              Target six-course average: <span className="font-semibold text-text-primary">{goal.targetSixAvg}%</span>
              {goal.applicationYear ? ` · Applying ${goal.applicationYear}` : ""}
            </p>
            {goal.benchmarkNote && <p className="text-sm text-text-muted">{goal.benchmarkNote}</p>}
          </div>
        ) : (
          <Empty>No goal set yet.</Empty>
        )}
      </Card>

      <Card title="Progress">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-muted">{progress.label}</p>
          <p className="text-3xl font-semibold">{percent(progress.averageOfGraded)}</p>
          <p className="text-sm text-text-muted">
            {progress.gradedCount} of {progress.planCount} courses graded
            {progress.target !== null ? ` · Target ${progress.target}%` : ""}
          </p>
          {gap(progress.gapToTarget) && <p className="text-sm font-medium">{gap(progress.gapToTarget)}</p>}
        </div>
        <GradeNote />
      </Card>

      <Card title="Active subjects">
        {view.activeCourses.length === 0 ? (
          <Empty>No active courses yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.activeCourses.map(({ course, result, gapToTarget }) => (
              <li key={course.id}>
                <Link href={courseHref(course.id)} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{course.code}</span>
                    <span className="block truncate text-sm text-text-muted">{course.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{percent(result.grade)}</span>
                    <span className="block text-xs text-text-muted">
                      {course.targetGrade !== null ? `Target ${course.targetGrade}%` : "No target"}
                      {gap(gapToTarget) ? ` · ${gap(gapToTarget)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Next priorities">
        {view.priorities.length === 0 ? (
          <Empty>Nothing pinned right now.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.priorities.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{task.title}</span>
                  <span className="block text-sm text-text-muted">
                    {[task.courseId ? courseCode.get(task.courseId) : null, task.reason].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {interactive ? <DoneButton kind="task" id={task.id} done={task.doneAt !== null} label={task.title} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Upcoming">
        {view.upcoming.length === 0 ? (
          <Empty>No upcoming work.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.upcoming.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-sm text-text-muted">
                    {a.courseCode} · {shortDate(a.dueDate)}
                  </span>
                </span>
                {interactive ? (
                  <DoneButton kind="assessment" id={a.id} done={a.studentDoneAt !== null} label={a.title} />
                ) : (
                  <StateBadge state={a.state} label={STATE_LABEL[a.state]} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {view.supplemental.length > 0 && (
        <Card title="Extra practice">
          <p className="text-xs text-text-muted">Supplemental work. It does not count toward your grades.</p>
          <ul className="flex flex-col divide-y divide-border">
            {view.supplemental.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{task.title}</span>
                  <span className="block text-sm text-text-muted">
                    {[task.courseId ? courseCode.get(task.courseId) : null, task.reason].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {interactive ? <DoneButton kind="task" id={task.id} done={task.doneAt !== null} label={task.title} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-text-muted">Last updated {stamp(view.lastUpdated)}</p>
    </div>
  );
}
