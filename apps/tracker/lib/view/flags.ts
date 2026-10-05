/** Words for grade flags (ADR 0025). Students pick one; no typing. */
import type { AssessmentState } from "../domain/assessment-state";
import type { FlagReason } from "../data/schemas";

export const FLAG_LABEL: Record<FlagReason, string> = {
  score_differs: "My mark is different",
  returned: "I got this back",
  other: "Something looks wrong",
};

/** Which reasons fit an assessment in this state. Nothing to flag on work not yet due. */
export function flagChoices(state: AssessmentState): FlagReason[] {
  if (state === "graded") return ["score_differs", "other"];
  if (state === "awaiting_result") return ["returned", "other"];
  return [];
}
