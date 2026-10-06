/**
 * The message pool for the story line (ADR 0032). Every sentence is a fact
 * with its numbers; none forecasts an outcome or mentions admission. This is
 * the only file that words these facts. Plain, short, no em-dashes.
 */
import type { StoryAside, StoryFact, StoryHeadline } from "../domain/story";
import { percent, shortDate } from "../format";

/** "1.8", never signed: the sentence says above or below. */
const pts = (n: number) => Math.abs(n).toFixed(1);
/** "A", "A and B", "A, B and C". */
export const listText = (items: readonly string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const onTarget = (gap: number) => pts(gap) === "0.0";

export function headlineText(h: StoryHeadline): string {
  switch (h.kind) {
    case "no_goal":
      return "No target set yet. Your teacher sets it with you.";
    case "no_marks":
      return "No marks yet. The first marked test or assignment starts your averages.";
    case "six_on_target":
      return onTarget(h.gap) ? `Six-course average is ${percent(h.average)}, on target.` : `Six-course average is ${percent(h.average)}, ${pts(h.gap)} above target.`;
    case "partial_on_target": {
      const first = `${h.graded} of ${h.plan} courses graded. The average so far is ${onTarget(h.gap) ? "on target" : `${pts(h.gap)} above target`}.`;
      return h.unmarked.length === 0 ? first : `${first} ${listText(h.unmarked)} ${h.unmarked.length === 1 ? "has" : "have"} no marks yet.`;
    }
    case "all_courses_on_target":
      return `Every course is at or above its own target. The course targets average ${percent(h.targetsAverage)}, below the ${percent(h.target)} goal.`;
    case "below_target":
      return `${h.graded} of ${h.plan} courses graded. The average so far is ${pts(h.gap)} below target.`;
    case "one_course_below":
      return `${h.code} is the one course below its target, ${pts(h.gap)} below. The others are at or above theirs.`;
    case "dominant_gap":
      return `${h.code} is the biggest gap, ${pts(h.gap)} below its target.`;
    case "several_below":
      return `${h.codes.length} courses are below their targets: ${listText(h.codes)}.`;
  }
}

export function asideText(a: StoryAside): string {
  switch (a.kind) {
    case "big_test_soon":
      return `${a.title} on ${shortDate(a.date)} is about ${Math.round(a.share)}% of ${a.code}.`;
    case "rising":
      return `${a.code} rose ${pts(a.delta)} over the last ${a.window} marks.`;
    case "awaiting_many":
      return `${a.count} results are waiting to be entered.`;
  }
}

export type StoryText = { headline: string; aside: string | null };

export function storyText(fact: StoryFact): StoryText {
  return { headline: headlineText(fact.headline), aside: fact.aside ? asideText(fact.aside) : null };
}
