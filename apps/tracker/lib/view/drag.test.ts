import { describe, expect, it } from "vitest";
import { dropTarget, isSameSlot } from "./drag";

const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const grid = { startMinutes: 480, rowPx: 17.6, colWidth: 100, left: 0, top: 0 };

describe("dropTarget (AC16)", () => {
  it("maps pointer position to the column's date and a 15-minute snapped start", () => {
    // 16:00 is (960-480)/15 = 32 rows down; 32 * 17.6 = 563.2px. 3 px past a row boundary still snaps down.
    const t = dropTarget({ x: 250, y: 563.2 + 3 }, { ...grid, days, duration: 60, offsetY: 0 });
    expect(t).toEqual({ date: "2026-10-21", startTime: "16:00" });
  });
  it("snaps to the nearest 15 minutes", () => {
    const t = dropTarget({ x: 10, y: 563.2 + 14 }, { ...grid, days, duration: 60, offsetY: 0 });
    expect(t?.startTime).toBe("16:15");
  });
  it("accounts for where inside the card the pointer grabbed it", () => {
    const t = dropTarget({ x: 10, y: 563.2 + 35.2 }, { ...grid, days, duration: 60, offsetY: 35.2 });
    expect(t?.startTime).toBe("16:00");
  });
  it("clamps so the class ends by 24:00 and never starts before 00:00", () => {
    expect(dropTarget({ x: 10, y: 10_000 }, { ...grid, days, duration: 90, offsetY: 0 })?.startTime).toBe("22:30");
    expect(dropTarget({ x: 10, y: -5000 }, { ...grid, days, duration: 60, offsetY: 0 })?.startTime).toBe("00:00");
  });
  it("is limited to the seven displayed days", () => {
    expect(dropTarget({ x: -5, y: 100 }, { ...grid, days, duration: 60, offsetY: 0 })?.date).toBe("2026-10-19");
    expect(dropTarget({ x: 5000, y: 100 }, { ...grid, days, duration: 60, offsetY: 0 })?.date).toBe("2026-10-25");
  });
});

describe("isSameSlot", () => {
  it("compares date and start time", () => {
    expect(isSameSlot({ date: "2026-10-19", startTime: "16:00" }, { date: "2026-10-19", startTime: "16:00" })).toBe(true);
    expect(isSameSlot({ date: "2026-10-19", startTime: "16:00" }, { date: "2026-10-21", startTime: "16:00" })).toBe(false);
  });
});
