import { redirect } from "next/navigation";
import { LinkLessonButton } from "@/components/scheduler/link-lesson-button";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Notice, Page, linkClass } from "@/components/ui";
import { addDays } from "@/lib/domain/schedule/wallclock";
import { getViewer } from "@/lib/data/queries";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { loadUnlinked } from "@/lib/scheduler/lesson-handlers";
import { formatDayHeading } from "@/lib/view/availability-text";
import { LESSON_TEXT, lessonErrorText } from "@/lib/view/lesson-text";

export const dynamic = "force-dynamic";

type Search = { from?: string; to?: string };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SPAN = 14;

/**
 * Unlinked lessons (REQ-39 AC12), owner only. Classes that happened with no
 * outcome, each with the Notion rows logged through the form for the same
 * teacher, student and date; and possible double logs. Loading writes nothing.
 */
export default async function UnlinkedLessonsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const deps = realScheduleDeps();
  const who = await deps.identity();
  if (who.scope !== "admin") redirect("/schedule");
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;
  const result = await loadUnlinked(deps, { from: one(sp.from) ?? null, to: one(sp.to) ?? null }).catch(() => null);

  const shell = (body: React.ReactNode) => (
    <>
      {email && <TopBar email={email} />}
      <Page title="Unlinked lessons" back={{ href: "/schedule", label: "Schedule" }}>{body}</Page>
    </>
  );
  if (!result || !result.ok) {
    const text = result && result.status === 503 && result.error === "lessons_not_ready" ? lessonErrorText("lessons_not_ready") : LESSON_TEXT.listError;
    return shell(<Notice tone="error">{text}</Notice>);
  }
  const { body } = result;
  const shift = (days: number) => `?from=${addDays(body.from, days)}&to=${addDays(body.to, days)}`;
  const who_ = (x: { staffName: string | null; studentName: string | null }) => `${x.staffName ?? "Teacher"} · ${x.studentName ?? "Student"}`;

  return shell(
    <>
      <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label="Dates">
        <a className={linkClass} href={shift(-SPAN)}>‹ Earlier</a>
        <span>{formatDayHeading(body.from)} to {formatDayHeading(body.to)}</span>
        <a className={linkClass} href={shift(SPAN)}>Later ›</a>
      </nav>
      <Card title="Unlinked classes">
        {body.unlinked.length === 0 ? <Empty>{LESSON_TEXT.listEmpty}</Empty> : (
          <ul className="flex flex-col gap-3" data-testid="unlinked-classes">
            {body.unlinked.map((u) => (
              <li key={`${u.seriesId}:${u.originalDate}`} className="text-sm">
                <p className="font-medium">{formatDayHeading(u.date)} · {u.startTime}-{u.endTime} · {who_(u)} · {u.subject}</p>
                {u.candidates.length === 0 ? <p className="text-text-muted">{LESSON_TEXT.noMatch}</p> : (
                  <ul className="mt-1 flex flex-col gap-1 pl-4">
                    {u.candidates.map((c) => (
                      <li key={c.lessonId} className="flex flex-wrap items-center gap-3">
                        <span>Lesson in Notion on {c.date ? formatDayHeading(c.date) : "no date"}</span>
                        <a className={linkClass} href={c.lessonUrl} target="_blank" rel="noopener">{LESSON_TEXT.open}</a>
                        <LinkLessonButton seriesId={u.seriesId} originalDate={u.originalDate} lessonId={c.lessonId} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Possible double logs">
        {body.doubles.length === 0 ? <Empty>No same-day lessons next to a logged class.</Empty> : (
          <ul className="flex flex-col gap-2 text-sm">
            {body.doubles.map((d) => (
              <li key={d.lessonId} className="flex flex-wrap items-center gap-3">
                <span>{formatDayHeading(d.date)} · {who_(d)} · already logged</span>
                <a className={linkClass} href={d.lessonUrl} target="_blank" rel="noopener">{LESSON_TEXT.open}</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>,
  );
}
