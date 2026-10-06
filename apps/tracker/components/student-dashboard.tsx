import Link from "next/link";
import { STATE_LABEL } from "@/lib/domain/assessment-state";
import { gap, percent, points, stamp, whenText } from "@/lib/format";
import type { CourseView, StudentView } from "@/lib/view/student-view";
import { ChartHint } from "./chart-hint";
import { DoneButton } from "./done-button";
import { TREND_TONE } from "@/lib/view/pill-text";
import { TrendChart } from "./trend-chart";
import { TrendPill } from "./trend-pill";
import { Card, Empty, GradeNote, StateBadge } from "./ui";

const h2 = "sr-only";

/** Scored marks of a course, for the chart's reveal. Components pass data through; the view computed it. */
function chartMarks(c: CourseView) {
  return c.graded.map((a) => ({ id: a.id, title: a.title, scoreEarned: a.scoreEarned as number, scorePossible: a.scorePossible }));
}

/**
 * The student dashboard (step 10), in the required order: target, progress,
 * subjects, next priorities, upcoming. Also the teacher's review preview, with
 * Done buttons shown as plain states. Every number here was computed in
 * lib/view; this file only lays it out.
 */
export function StudentDashboard({
  view,
  interactive,
  courseHref,
  today,
}: {
  view: StudentView;
  interactive: boolean;
  courseHref: (courseId: string) => string;
  /** ISO date, the right edge of every chart. */
  today: string;
}) {
  const { goal, progress, story } = view;
  const courseCode = new Map(view.courses.map((c) => [c.course.id, c.course.code]));
  const gapText = gap(progress.gapToTarget);
  const gapTone = progress.gapToTarget === null ? "" : progress.gapToTarget < 0 ? "text-warn" : "text-ok";

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="dash-target" className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1.4fr_1fr]">
        <h2 id="dash-target" className={h2}>Target</h2>
        <div>
          <p className="text-sm text-text-muted">Grade {view.student.gradeLevel}</p>
        </div>
        {goal ? (
          <>
            <div className="sm:border-l sm:border-border sm:pl-3">
              <p className="font-semibold">{goal.school}</p>
              <p className="text-sm text-text-muted">
                {goal.program}
                {goal.applicationYear ? ` · ${goal.applicationYear}` : ""}
              </p>
              {goal.benchmarkNote && <p className="mt-1 text-xs text-text-muted">{goal.benchmarkNote}</p>}
            </div>
            <div className="sm:border-l sm:border-border sm:pl-3">
              <p className="text-sm text-text-muted">Target top-6 average</p>
              <p className="text-3xl font-semibold">{percent(goal.targetSixAvg)}</p>
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Empty>No goal set yet.</Empty>
          </div>
        )}
      </section>

      <section aria-labelledby="dash-progress" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="dash-progress" className={h2}>Progress</h2>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-sm text-text-muted">{progress.label}</p>
            <p className="text-4xl font-semibold">{percent(progress.averageOfGraded)}</p>
          </div>
          {gapText && <p className={`pb-1 text-xl font-semibold ${gapTone}`}>{gapText}</p>}
        </div>
        <p className="text-sm text-text-muted">
          {progress.gradedCount} of {progress.planCount} courses graded
          {progress.target !== null ? ` · Target ${percent(progress.target)}` : ""}
        </p>
        <p className="font-semibold">{story.headline}</p>
        {story.aside && <p className="text-sm text-text-muted">{story.aside}</p>}
        <GradeNote />
      </section>

      <section aria-labelledby="dash-subjects" className="flex flex-col gap-3">
        <h2 id="dash-subjects" className={h2}>Subjects</h2>
        {view.planCourses.length > 0 && <ChartHint />}
        {view.planCourses.length === 0 && view.otherActive.length === 0 ? (
          <Card>
            <Empty>No courses yet.</Empty>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.planCourses.map((c) => (
              <li key={c.course.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid sm:grid-cols-[150px_1fr_96px] sm:items-start">
                <Link href={courseHref(c.course.id)} className="flex items-start justify-between gap-3 sm:block">
                  <span className="min-w-0">
                    <span className="block font-semibold">{c.course.name}</span>
                    <span className="block text-sm text-text-muted">
                      {c.course.code}
                      {c.course.status !== "active" ? ` · ${c.course.status === "completed" ? "Completed" : "Planned"}` : ""}
                    </span>
                    <span className="mt-1 block">
                      <TrendPill trend={c.trend} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right sm:hidden">
                    {c.result.grade !== null && <span className="block text-2xl font-semibold">{percent(c.result.grade)}</span>}
                    <span className="block text-xs text-text-muted">{c.course.targetGrade !== null ? `Target ${percent(c.course.targetGrade)}` : "No target"}</span>
                    {c.result.grade !== null && <span className="block text-xs text-text-muted">{points(c.markedWeight)}% marked</span>}
                  </span>
                </Link>
                <TrendChart
                  points={c.history}
                  target={c.course.targetGrade}
                  tone={TREND_TONE[c.trend]}
                  marks={chartMarks(c)}
                  today={today}
                  label={`${c.course.code} grade over time`}
                />
                {/* The pill already says "No grades yet"; the big slot stays empty until there is a grade. */}
                <div className="hidden text-right sm:block">
                  <p className="text-xs text-text-muted">{c.course.targetGrade !== null ? `Target ${percent(c.course.targetGrade)}` : "No target"}</p>
                  {c.result.grade !== null && <p className="text-2xl font-semibold">{percent(c.result.grade)}</p>}
                  {c.result.grade !== null && <p className="text-xs text-text-muted">{points(c.markedWeight)}% marked</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {view.otherActive.length > 0 && (
          <Card title="Also taking">
            <p className="text-xs text-text-muted">Not counted in the six-course average.</p>
            <ul className="flex flex-col divide-y divide-border">
              {view.otherActive.map((c) => (
                <li key={c.course.id}>
                  <Link href={courseHref(c.course.id)} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{c.course.code}</span>
                      <span className="block truncate text-sm text-text-muted">{c.course.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold">{percent(c.result.grade)}</span>
                      <TrendPill trend={c.trend} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
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
                      {a.courseCode} · {whenText(a)}
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
      </div>

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
