import { describe, expect, it } from "vitest";
import { CONSOLE_MODES, MODE_LABELS, parseMode, parseWeek, tabKeyTarget } from "./modes";

// REQ-55 AC2: the mode switch.
describe("parseMode", () => {
  it.each(CONSOLE_MODES)("keeps %s", (mode) => {
    expect(parseMode(mode)).toBe(mode);
  });

  it.each([[undefined], [null], [""], ["bogus"], ["SALES"], [3]])("falls back to sales for %j", (value) => {
    expect(parseMode(value)).toBe("sales");
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseMode(["operations", "creation"])).toBe("operations");
    expect(parseMode([])).toBe("sales");
  });

  it("labels each mode", () => {
    expect(CONSOLE_MODES.map((m) => MODE_LABELS[m])).toEqual(["Sales", "Creation", "Operations"]);
  });
});

describe("tabKeyTarget", () => {
  it("ArrowRight moves on and wraps", () => {
    expect(tabKeyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(tabKeyTarget("ArrowRight", 2, 3)).toBe(0);
  });

  it("ArrowLeft moves back and wraps", () => {
    expect(tabKeyTarget("ArrowLeft", 1, 3)).toBe(0);
    expect(tabKeyTarget("ArrowLeft", 0, 3)).toBe(2);
  });

  it("Home and End go to the ends", () => {
    expect(tabKeyTarget("Home", 2, 3)).toBe(0);
    expect(tabKeyTarget("End", 0, 3)).toBe(2);
  });

  it.each(["Enter", " ", "Tab", "a", "ArrowDown"])("%j is not a move", (key) => {
    expect(tabKeyTarget(key, 1, 3)).toBeNull();
  });
});

// REQ-56 AC9: ?week= picks the Toronto week of a date, never a future one.
describe("parseWeek", () => {
  const today = "2026-10-22";
  it.each([[undefined], [""], ["bogus"], ["2026-13-01"], ["2026-02-30"], ["2026-10-2"], [["x"]]])("falls back to the current week for %j", (raw) => {
    expect(parseWeek(raw, today)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
  it("a Wednesday gives its Monday", () => {
    expect(parseWeek("2026-03-04", today)).toEqual({ from: "2026-03-02", to: "2026-03-08" });
  });
  it("a future date gives the current week", () => {
    expect(parseWeek("2026-11-04", today)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(parseWeek("2026-10-25", today)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
  it("takes the first value of a repeated parameter", () => {
    expect(parseWeek(["2026-10-12", "2026-10-05"], today)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
});
