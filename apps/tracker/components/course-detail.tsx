import { STATE_LABEL } from "@/lib/domain/assessment-state";
import { gap, percent, points, whenText, stamp } from "@/lib/format";
import { TREND_TONE } from "@/lib/view/pill-text";
import type { CourseView } from "@/lib/view/student-view";
import { DoneButton } from "./done-button";
import { FlagControl } from "./flag-control";
import { TrendChart } from "./trend-chart";
import { TrendPill } from "./trend-pill";
import { Card, Empty, GradeNote, StateBadge } from "./ui";

/**
 * Subject drill-down: current vs target with the grade over time, category
 * breakdown, past scores, to-dos, upcoming work, and supplemental work kept
 * separate.
 */
export function CourseDetail({ view, interactive, today }: { view: CourseView; interactive: boolean; today: string }) {
  const { course, result } = view;
  const lastUpdated = [course.updatedAt, ...view.assessments.map((a) => a.updatedAt)].sort().at(-1) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Current grade">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold">{percent(result.grade)}</p>
            <p className="text-sm text-text-muted">
              {course.targetGrade !== null ? `Target ${percent(course.targetGrade)}` : "No target set"}
              {gap(view.gapToTarget) ? ` · ${gap(view.gapToTarget)}` : ""}
            </p>
            {result.grade !== null && <p className="text-sm text-text-muted">{points(view.markedWeight)}% of this course is marked so far.</p>}
          </div>
          <TrendPill trend={view.trend} />
        </div>
        <TrendChart
          points={view.history}
          target={course.targetGrade}
          tone={TREND_TONE[view.trend]}
          marks={view.graded.map((a) => ({ id: a.id, title: a.title, scoreEarned: a.scoreEarned as number, scorePossible: a.scorePossible }))}
          today={today}
          label={`${course.code} grade over time`}
        />
        <GradeNote />
      </Card>

      <Card title="Categories">
        {result.categories.length === 0 ? (
          <Empty>No syllabus categories yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {result.categories.map((c) => (
              <li key={c.categoryId} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-text-muted">
                    {points(c.weight)}% of the grade · {c.scoredCount} marked
                  </span>
                </span>
                <span className="font-semibold">{percent(c.percent, "None yet")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Upcoming">
        {view.upcoming.length === 0 && view.awaiting.length === 0 ? (
          <Empty>No upcoming work.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {[...view.upcoming, ...view.awaiting].map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-sm text-text-muted">
                    {a.categoryName} · {whenText(a)} · about {Math.round(a.share)}% of the grade
                    {a.state === "awaiting_result" ? " · Awaiting result" : ""}
                  </span>
                  {interactive && a.state === "awaiting_result" && (
                    <FlagControl key={`${a.id}-${a.openFlag?.reason ?? ""}`} assessmentId={a.id} state={a.state} reason={a.openFlag?.reason ?? null} label={a.title} />
                  )}
                </span>
                {interactive && a.state !== "awaiting_result" ? (
                  <DoneButton kind="assessment" id={a.id} done={a.studentDoneAt !== null} label={a.title} />
                ) : (
                  <StateBadge state={a.state} label={STATE_LABEL[a.state]} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="To do">
        {view.todos.length === 0 ? (
          <Empty>Nothing to do for this course right now.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.todos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{t.title}</span>
                  {t.reason && <span className="block text-sm text-text-muted">{t.reason}</span>}
                </span>
                {interactive ? <DoneButton kind="task" id={t.id} done={t.doneAt !== null} label={t.title} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Past scores">
        {view.graded.length === 0 ? (
          <Empty>No marked work yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.graded.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-xs text-text-muted">
                    {a.categoryName} · {whenText(a)}
                  </span>
                  {interactive && (
                    <FlagControl key={`${a.id}-${a.openFlag?.reason ?? ""}`} assessmentId={a.id} state={a.state} reason={a.openFlag?.reason ?? null} label={a.title} />
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold">
                    {points(a.scoreEarned as number)} / {points(a.scorePossible)}
                  </span>
                  <span className="block text-xs text-text-muted">{percent(((a.scoreEarned as number) / a.scorePossible) * 100)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Extra practice">
        <p className="text-xs text-text-muted">Supplemental work. It does not count toward your grade.</p>
        {view.supplemental.length === 0 ? (
          <Empty>No extra practice right now.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.supplemental.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{t.title}</span>
                  {t.reason && <span className="block text-sm text-text-muted">{t.reason}</span>}
                </span>
                {interactive ? <DoneButton kind="task" id={t.id} done={t.doneAt !== null} label={t.title} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-text-muted">Last updated {stamp(lastUpdated)}</p>
    </div>
  );
}
