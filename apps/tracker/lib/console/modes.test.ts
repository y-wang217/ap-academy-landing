import { describe, expect, it } from "vitest";
import { CONSOLE_MODES, MODE_LABELS, parseMode, tabKeyTarget } from "./modes";

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
