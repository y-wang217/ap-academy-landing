import { describe, expect, it } from "vitest";
import { localDateOf } from "./time";

// REQ-54 AC8: due dates and day boundaries in America/Toronto, across both DST changes.
describe("localDateOf", () => {
  it("DST end day (2026-11-01): 04:30Z is the 1st, 03:30Z is still the 31st", () => {
    expect(localDateOf("2026-11-01T04:30:00Z")).toBe("2026-11-01");
    expect(localDateOf("2026-11-01T03:30:00Z")).toBe("2026-10-31");
  });

  it("DST start day (2026-03-08): 05:30Z is the 8th, 04:30Z is the 7th", () => {
    expect(localDateOf("2026-03-08T05:30:00Z")).toBe("2026-03-08");
    expect(localDateOf("2026-03-08T04:30:00Z")).toBe("2026-03-07");
  });

  it("a Notion datetime with an offset is read as an instant", () => {
    expect(localDateOf("2026-11-01T00:30:00.000-04:00")).toBe("2026-11-01");
  });

  it("a date-only value keeps its date, and null or garbage is null", () => {
    expect(localDateOf("2026-11-01")).toBe("2026-11-01");
    expect(localDateOf(null)).toBeNull();
    expect(localDateOf("soon")).toBeNull();
  });
});
