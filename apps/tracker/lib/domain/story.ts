/**
 * The one sentence under the progress number (ADR 0032): a fact about what
 * is happening, chosen by rule, never a forecast. Pure. Returns facts with
 * numbers; lib/view words them. First matching rule wins, for the headline
 * and again for the optional aside.
 */
import { daysBetween } from "./suggestions";
import { TUNING } from "./tuning";

export type StoryCourse = {
  code: string;
  /** null means no marks yet. */
  grade: number | null;
  targetGrade: number | null;
  /** From trendDelta(). null with fewer than two dated marks. */
  trendDelta: number | null;
};

export type StoryUpcoming = {
  title: string;
  courseCode: string;
  /** ISO date the work is due or the test is held. */
  date: string;
  /** Rough share of the course grade, 0 to 100. */
  share: number;
};

export type StoryInput = {
  hasGoal: boolean;
  progress: { gradedCount: number; planCount: number; averageOfGraded: number | null; target: number | null; gapToTarget: number | null; complete: boolean };
  /** The courses in the six-course plan. */
  courses: readonly StoryCourse[];
  upcoming: readonly StoryUpcoming[];
  /** Items past their date with no score. */
  awaitingCount: number;
  today: string;
};

export type StoryHeadline =
  | { kind: "no_goal" }
  | { kind: "no_marks" }
  | { kind: "six_on_target"; average: number; gap: number }
  | { kind: "partial_on_target"; graded: number; plan: number; gap: number; unmarked: string[] }
  | { kind: "all_courses_on_target"; gap: number; target: number; targetsAverage: number }
  | { kind: "one_course_below"; code: string; gap: number }
  | { kind: "dominant_gap"; code: string; gap: number; below: number }
  | { kind: "several_below"; codes: string[] }
  | { kind: "below_target"; graded: number; plan: number; gap: number };

export type StoryAside =
  | { kind: "big_test_soon"; title: string; date: string; share: number; code: string }
  | { kind: "rising"; code: string; delta: number; window: number }
  | { kind: "awaiting_many"; count: number };

export type StoryFact = { headline: StoryHeadline; aside: StoryAside | null };

/** Below its own target by more than display rounding would hide. */
const SHORTFALL_FLOOR = 0.05;

function headline(input: StoryInput): StoryHeadline {
  const { progress, courses } = input;
  if (!input.hasGoal) return { kind: "no_goal" };
  if (progress.gradedCount === 0 || progress.averageOfGraded === null || progress.gapToTarget === null) return { kind: "no_marks" };
  const gap = progress.gapToTarget;
  if (gap >= 0) {
    if (progress.complete) return { kind: "six_on_target", average: progress.averageOfGraded, gap };
    return { kind: "partial_on_target", graded: progress.gradedCount, plan: progress.planCount, gap, unmarked: courses.filter((c) => c.grade === null).map((c) => c.code) };
  }
  const below = courses
    .filter((c): c is StoryCourse & { grade: number; targetGrade: number } => c.grade !== null && c.targetGrade !== null && c.targetGrade - c.grade > SHORTFALL_FLOOR)
    .map((c) => ({ code: c.code, gap: c.targetGrade - c.grade }))
    .sort((a, b) => b.gap - a.gap || a.code.localeCompare(b.code));
  if (below.length === 0) {
    const targets = courses.map((c) => c.targetGrade).filter((t): t is number => t !== null);
    if (targets.length > 0 && progress.target !== null) {
      return { kind: "all_courses_on_target", gap, target: progress.target, targetsAverage: targets.reduce((s, t) => s + t, 0) / targets.length };
    }
    return { kind: "below_target", graded: progress.gradedCount, plan: progress.planCount, gap };
  }
  if (below.length === 1) return { kind: "one_course_below", code: below[0].code, gap: below[0].gap };
  if (below[0].gap >= TUNING.storyDominantRatio * below[1].gap) return { kind: "dominant_gap", code: below[0].code, gap: below[0].gap, below: below.length };
  return { kind: "several_below", codes: below.map((b) => b.code) };
}

function aside(input: StoryInput): StoryAside | null {
  const soon = input.upcoming
    .map((u) => ({ u, days: daysBetween(input.today, u.date) }))
    .filter(({ u, days }) => days >= 0 && days <= TUNING.storySoonDays && u.share >= TUNING.storyBigShare)
    .sort((a, b) => a.days - b.days || b.u.share - a.u.share);
  if (soon.length > 0) {
    const { u } = soon[0];
    return { kind: "big_test_soon", title: u.title, date: u.date, share: u.share, code: u.courseCode };
  }
  const rising = input.courses
    .filter((c): c is StoryCourse & { trendDelta: number } => c.trendDelta !== null && c.trendDelta >= TUNING.trendRisePoints)
    .sort((a, b) => b.trendDelta - a.trendDelta || a.code.localeCompare(b.code));
  if (rising.length > 0) return { kind: "rising", code: rising[0].code, delta: rising[0].trendDelta, window: TUNING.trendWindowMarks };
  if (input.awaitingCount >= TUNING.storyAwaitingMany) return { kind: "awaiting_many", count: input.awaitingCount };
  return null;
}

export function storyFacts(input: StoryInput): StoryFact {
  return { headline: headline(input), aside: aside(input) };
}
