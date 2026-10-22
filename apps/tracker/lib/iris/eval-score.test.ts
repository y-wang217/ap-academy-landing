import { describe, expect, it } from "vitest";
import { scoreEval, type ScoreRow } from "./eval-score";

// REQ-45 AC8, AC9: the eval aggregates, pinned definition by definition.
const row = (
  gold: { replyType: string | null; escalate: boolean },
  predicted: { replyType: string | null; escalate: boolean },
  rating: number | null = null,
): ScoreRow => ({ goldIntent: gold.replyType ?? "other", goldReplyType: gold.replyType, goldEscalate: gold.escalate, predictedReplyType: predicted.replyType, predictedEscalate: predicted.escalate, rating });

const send = (t: string) => ({ replyType: t, escalate: false });
const esc = { replyType: null, escalate: true };

describe("scoreEval", () => {
  it("counts every labelled row", () => {
    expect(scoreEval([]).labelledCount).toBe(0);
    expect(scoreEval([row(send("cancellation"), send("cancellation")), row(esc, esc)]).labelledCount).toBe(2);
  });

  it.each([
    {
      name: "all right",
      rows: [row(send("cancellation"), send("cancellation")), row(send("cancellation"), send("cancellation"))],
      type: "cancellation", precision: 1, recall: 1, count: 2,
    },
    {
      name: "one false positive from another gold type",
      rows: [row(send("cancellation"), send("cancellation")), row(send("general_question"), send("cancellation"))],
      type: "cancellation", precision: 0.5, recall: 1, count: 1,
    },
    {
      name: "a gold escalation predicted sendable is a false positive",
      rows: [row(send("cancellation"), send("cancellation")), row(esc, send("cancellation"))],
      type: "cancellation", precision: 0.5, recall: 1, count: 1,
    },
    {
      name: "a predicted escalation is a miss for recall, not for precision",
      rows: [row(send("cancellation"), send("cancellation")), row(send("cancellation"), esc)],
      type: "cancellation", precision: 1, recall: 0.5, count: 2,
    },
    {
      name: "nothing predicted as the type: precision null",
      rows: [row(send("cancellation"), esc)],
      type: "cancellation", precision: null, recall: 0, count: 1,
    },
    {
      name: "predicted but never gold: recall null and count 0",
      rows: [row(send("general_question"), send("cancellation"))],
      type: "cancellation", precision: 0, recall: null, count: 0,
    },
  ])("per type: $name", ({ rows, type, precision, recall, count }) => {
    expect(scoreEval(rows).perType[type]).toEqual({ precision, recall, count });
  });

  it("sensitive recall: gold escalations predicted escalated, null when there are none", () => {
    expect(scoreEval([row(send("cancellation"), send("cancellation"))]).sensitiveRecall).toBeNull();
    expect(scoreEval([row(esc, esc), row(esc, send("cancellation"))]).sensitiveRecall).toBe(0.5);
    expect(scoreEval([row(esc, esc), row(send("cancellation"), esc)]).sensitiveRecall).toBe(1);
  });

  it("mean rating is grouped by predicted type and ignores unrated rows", () => {
    const s = scoreEval([
      row(send("cancellation"), send("cancellation"), 5),
      row(send("general_question"), send("cancellation"), 3),
      row(send("cancellation"), send("cancellation"), null),
      row(send("general_question"), send("general_question"), 4),
      row(esc, esc, 2),
    ]);
    expect(s.meanRatingPerType).toEqual({ cancellation: 4, general_question: 4 });
  });

  it("confusion counts gold against predicted, with escalate and none as labels", () => {
    const s = scoreEval([
      row(send("cancellation"), send("cancellation")),
      row(send("cancellation"), esc),
      row(esc, esc),
      row({ replyType: null, escalate: false }, send("general_question")),
    ]);
    expect(s.confusion).toEqual({
      cancellation: { cancellation: 1, escalate: 1 },
      escalate: { escalate: 1 },
      none: { general_question: 1 },
    });
  });
});
