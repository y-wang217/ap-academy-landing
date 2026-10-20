import { describe, expect, it } from "vitest";
import { peopleFreshness, peopleSyncLine } from "./people-freshness";

const NOW = new Date("2026-10-19T18:00:00Z");
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("peopleFreshness (REQ-38 AC11)", () => {
  it("is null while the copy is fresh", () => {
    expect(peopleFreshness(before(0), NOW)).toBeNull();
    expect(peopleFreshness(before(119), NOW)).toBeNull();
  });
  it("counts hours from 120 minutes, rounded down", () => {
    expect(peopleFreshness(before(120), NOW)).toBe("Names last updated 2 hours ago");
    expect(peopleFreshness(before(180), NOW)).toBe("Names last updated 3 hours ago");
    expect(peopleFreshness(before(47 * 60 + 59), NOW)).toBe("Names last updated 47 hours ago");
  });
  it("never says 1 hour below the threshold", () => {
    for (let m = 0; m < 120; m += 7) expect(peopleFreshness(before(m), NOW)).toBeNull();
  });
  it("counts days from 48 hours", () => {
    expect(peopleFreshness(before(48 * 60), NOW)).toBe("Names last updated 2 days ago");
    expect(peopleFreshness(before(10 * 24 * 60 + 5), NOW)).toBe("Names last updated 10 days ago");
  });
  it("says so when there has never been a good sync", () => {
    expect(peopleFreshness(null, NOW)).toBe("Names have not been loaded yet.");
  });
});

describe("peopleSyncLine (REQ-38 AC15)", () => {
  it("ok", () => {
    expect(peopleSyncLine({ lastOk: { finishedAt: before(3) }, lastFailure: null }, NOW)).toBe("Names synced 3 minutes ago.");
    expect(peopleSyncLine({ lastOk: { finishedAt: before(1) }, lastFailure: null }, NOW)).toBe("Names synced 1 minute ago.");
    expect(peopleSyncLine({ lastOk: { finishedAt: before(0) }, lastFailure: null }, NOW)).toBe("Names synced just now.");
    expect(peopleSyncLine({ lastOk: { finishedAt: before(180) }, lastFailure: { finishedAt: before(240) } }, NOW)).toBe("Names synced 3 hours ago.");
  });
  it("failed after ok gives both local times", () => {
    // 18:00Z is 14:00 in Toronto (EDT).
    expect(peopleSyncLine({ lastOk: { finishedAt: before(180) }, lastFailure: { finishedAt: before(5) } }, NOW))
      .toBe("Last sync failed at 13:55. Names are from 11:00.");
  });
  it("failed and never ok, and never run", () => {
    expect(peopleSyncLine({ lastOk: null, lastFailure: { finishedAt: before(5) } }, NOW)).toBe("Last sync failed at 13:55. Names have not been loaded yet.");
    expect(peopleSyncLine({ lastOk: null, lastFailure: null }, NOW)).toBe("Names have not been synced yet.");
  });
  it("has no em-dash (AC17)", () => {
    const all = [
      peopleFreshness(null, NOW), peopleFreshness(before(200), NOW), peopleFreshness(before(5000), NOW),
      peopleSyncLine({ lastOk: { finishedAt: before(180) }, lastFailure: { finishedAt: before(5) } }, NOW),
      peopleSyncLine({ lastOk: null, lastFailure: null }, NOW),
    ].join(" ");
    expect(all).not.toContain("—");
  });
});
