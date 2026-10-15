import { describe, expect, it } from "vitest";
import { CategoryInput, CourseInput, ScoreInput, TaskInput, UnlinkInput, formObject } from "./schemas";

/** A browser leaves an unchecked checkbox out of the form entirely. */
function form(fields: Record<string, string>): Record<string, string> {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return formObject(f);
}

describe("checkbox fields", () => {
  const cases = [
    { name: "CourseInput.inSixPlan", schema: CourseInput, key: "inSixPlan", base: { code: "mhf4u", name: "Advanced Functions", term: "", status: "active" } },
    { name: "CategoryInput.needsReview", schema: CategoryInput, key: "needsReview", base: { name: "Tests", weight: "50", aggregationMethod: "mean_of_percentages" } },
    { name: "ScoreInput.excused", schema: ScoreInput, key: "excused", base: { scoreEarned: "", scorePossible: "10" } },
    { name: "TaskInput.pinned", schema: TaskInput, key: "pinned", base: { title: "Practice set 4", kind: "supplemental", courseId: "", reason: "" } },
  ] as const;

  for (const { name, schema, key, base } of cases) {
    it(`${name} reads an unchecked (absent) box as false`, () => {
      const r = schema.safeParse(form(base));
      expect(r.success).toBe(true);
      expect((r.data as Record<string, unknown>)[key]).toBe(false);
    });

    it(`${name} reads a checked box as true`, () => {
      const r = schema.safeParse(form({ ...base, [key]: "on" }));
      expect(r.success).toBe(true);
      expect((r.data as Record<string, unknown>)[key]).toBe(true);
    });
  }

  it("refuses a value that is not a checkbox value", () => {
    expect(CategoryInput.safeParse(form({ name: "Tests", weight: "50", aggregationMethod: "mean_of_percentages", needsReview: "nope" })).success).toBe(false);
  });
});

describe("UnlinkInput (AC13)", () => {
  it("rejects an invalid email", () => {
    expect(UnlinkInput.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("trims and lowercases a valid one", () => {
    expect(UnlinkInput.parse({ email: "  Sam.Real@Example.com " })).toEqual({ email: "sam.real@example.com" });
  });
});
