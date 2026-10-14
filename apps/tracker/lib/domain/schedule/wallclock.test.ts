import { describe, expect, it } from "vitest";
import { addDays, isoWeekStart, isoWeekday, localToUtc, minutesOf, timeOf } from "./wallclock";

describe("localToUtc (America/Toronto)", () => {
  it("keeps 17:00 across the 2026-11-01 DST end", () => {
    expect(localToUtc("2026-10-26", "17:00")).toBe("2026-10-26T21:00:00.000Z");
    expect(localToUtc("2026-11-02", "17:00")).toBe("2026-11-02T22:00:00.000Z");
  });
  it("keeps 17:00 across the 2027-03-14 spring change", () => {
    expect(localToUtc("2027-03-08", "17:00")).toBe("2027-03-08T22:00:00.000Z");
    expect(localToUtc("2027-03-15", "17:00")).toBe("2027-03-15T21:00:00.000Z");
  });
  it("shifts a gap time forward by the gap", () => {
    expect(localToUtc("2027-03-14", "02:30")).toBe("2027-03-14T07:30:00.000Z");
  });
  it("takes the earlier offset for an ambiguous time", () => {
    expect(localToUtc("2026-11-01", "01:30")).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("date helpers", () => {
  it("isoWeekday: Monday is 1, Sunday is 7", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-11-01")).toBe(7);
  });
  it("addDays crosses month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("isoWeekStart returns that week's Monday", () => {
    expect(isoWeekStart("2026-11-01")).toBe("2026-10-26");
    expect(isoWeekStart("2026-10-26")).toBe("2026-10-26");
  });
  it("minutesOf and timeOf round-trip", () => {
    expect(minutesOf("17:05")).toBe(1025);
    expect(timeOf(1025)).toBe("17:05");
    expect(timeOf(1440)).toBe("24:00");
  });
});
