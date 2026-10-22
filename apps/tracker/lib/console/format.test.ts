import { describe, expect, it } from "vitest";
import { bridgeClock, formatReadout, hhmm } from "./format";

// REQ-55 AC1, AC9: the header clock is Toronto wall time, readouts are en-CA.
describe("bridgeClock", () => {
  it("formats weekday, day, month and 24 h time in Toronto", () => {
    expect(bridgeClock(new Date("2026-10-22T18:05:00Z"))).toBe("Thu 22 Oct, 14:05");
  });

  it("crosses the March 2026 spring-forward", () => {
    expect(bridgeClock(new Date("2026-03-08T06:59:00Z"))).toBe("Sun 8 Mar, 01:59");
    expect(bridgeClock(new Date("2026-03-08T07:00:00Z"))).toBe("Sun 8 Mar, 03:00");
  });

  it("crosses the November 2026 fall-back", () => {
    expect(bridgeClock(new Date("2026-11-01T05:59:00Z"))).toBe("Sun 1 Nov, 01:59");
    expect(bridgeClock(new Date("2026-11-01T06:00:00Z"))).toBe("Sun 1 Nov, 01:00");
  });

  it("is local midnight, not UTC", () => {
    expect(bridgeClock(new Date("2026-10-23T03:30:00Z"))).toBe("Thu 22 Oct, 23:30");
  });
});

describe("hhmm", () => {
  it("is Toronto HH:MM", () => {
    expect(hhmm("2026-10-22T18:05:00.000Z")).toBe("14:05");
  });
});

describe("formatReadout", () => {
  it("formats CAD with no cents", () => {
    expect(formatReadout(1234, { currency: "CAD" })).toBe("$1,234");
  });

  it("appends a unit", () => {
    expect(formatReadout(18, { unit: "h" })).toBe("18 h");
  });

  it("groups thousands en-CA and keeps a decimal", () => {
    expect(formatReadout(12345.5, {})).toBe("12,345.5");
  });
});
