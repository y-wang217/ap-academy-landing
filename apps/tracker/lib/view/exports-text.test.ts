import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExportOutT } from "../scheduler/schemas";
import { LOAD_FAILED, REFRESH_FAILED, shouldPoll, stripLine, stripState, type StripState } from "./exports-text";

const row = (over: Partial<ExportOutT> = {}): ExportOutT => ({
  id: "0b000000-0000-4000-8000-000000000001", kind: "summary", targetId: "11111111-1111-4111-8111-111111111111", name: "Ada L.",
  status: "failed", attempts: 1, nextAttemptAt: "2026-10-19T14:58:00Z", requestedAt: "2026-10-19T14:42:00Z", lastError: "Notion returned 404", ...over,
});

describe("stripLine (AC11)", () => {
  it("a failed summary shows the student, the error and Retry", () => {
    expect(stripLine(row())).toEqual({ id: row().id, label: "Ada L. Weekly Schedule", state: "Failed. Notion returned 404.", action: "Retry" });
  });
  it("an uncertain daily task says to check Notion", () => {
    expect(stripLine(row({ kind: "daily_task", name: null, status: "uncertain" }))).toMatchObject({
      label: "Today's task", state: "May have been updated. Check it in Notion.", action: "Retry",
    });
  });
  it("a stale pending row shows when it was asked for and the next try, in Toronto time", () => {
    expect(stripLine(row({ status: "pending", name: "Bo Q." }))).toMatchObject({
      label: "Bo Q. Weekly Schedule", state: "Waiting since 10:42. Next try 10:58.", action: "Retry now",
    });
  });
  it("a student with no name in Notion still reads", () => {
    expect(stripLine(row({ name: null })).label).toBe("A student Weekly Schedule");
  });
});

describe("stripState", () => {
  const loading: StripState = { kind: "loading" };
  it("is hidden while loading and when empty", () => {
    expect(loading).toEqual({ kind: "loading" });
    expect(stripState(loading, { type: "loaded", rows: [] })).toEqual({ kind: "empty" });
  });
  it("a first load that fails shows the load error", () => {
    expect(stripState(loading, { type: "load_failed" })).toEqual({ kind: "failed" });
  });
  it("a refresh that fails keeps the last rows and flags it; the next success clears it", () => {
    const list = stripState(loading, { type: "loaded", rows: [row()] });
    const stale = stripState(list, { type: "load_failed" });
    expect(stale).toEqual({ kind: "list", rows: [row()], refreshFailed: true });
    expect(stripState(stale, { type: "loaded", rows: [row()] })).toEqual({ kind: "list", rows: [row()], refreshFailed: false });
  });
  it("polls only while something is pending or running", () => {
    expect(shouldPoll(stripState(loading, { type: "loaded", rows: [row()] }))).toBe(false);
    expect(shouldPoll(stripState(loading, { type: "loaded", rows: [row({ status: "pending" })] }))).toBe(true);
  });
  it("the copy has the exact words and no em-dash", () => {
    expect(LOAD_FAILED).toBe("Could not load Notion exports.");
    expect(REFRESH_FAILED).toBe("Could not refresh. Showing the last list.");
    for (const f of ["exports-text.ts", "save-notice.ts", "../../components/scheduler/exports-strip.tsx"]) {
      expect(readFileSync(join(__dirname, f), "utf8"), f).not.toContain("—");
    }
  });
});
