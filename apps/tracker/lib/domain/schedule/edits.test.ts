import { describe, expect, it } from "vitest";
import { checkClassShape, checkOccurrenceEditable } from "./edits";

describe("checkOccurrenceEditable", () => {
  it("AC7: a past original date is rejected, today and future are fine", () => {
    expect(checkOccurrenceEditable("2026-10-13", "2026-10-14")).toEqual({ ok: false, status: 422, error: "past_occurrence" });
    expect(checkOccurrenceEditable("2026-10-14", "2026-10-14")).toEqual({ ok: true });
    expect(checkOccurrenceEditable("2026-10-15", "2026-10-14")).toEqual({ ok: true });
  });
});

describe("checkClassShape", () => {
  it("AC14: duration 15..480 in multiples of 5", () => {
    expect(checkClassShape("17:00", 60)).toEqual({ ok: true });
    for (const d of [10, 481, 62, 0]) expect(checkClassShape("17:00", d)).toEqual({ ok: false, status: 400, error: "invalid_duration" });
  });
  it("AC14: may not cross local midnight, but may end at 24:00", () => {
    expect(checkClassShape("23:30", 60)).toEqual({ ok: false, status: 400, error: "crosses_midnight" });
    expect(checkClassShape("23:00", 60)).toEqual({ ok: true });
  });
});
