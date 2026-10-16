import { describe, expect, it } from "vitest";
import type { ApiResult } from "../scheduler/api-client";
import { afterDailyRetry, afterSummaryRetry, readSaveOutcome, saveNotice, type SaveOutcome } from "./save-notice";

const S1 = "11111111-1111-4111-8111-111111111111";
const base: SaveOutcome = { summarySync: undefined, dailyTask: undefined, studentId: S1, studentName: "Sam S." };
const texts = (o: SaveOutcome) => saveNotice(o).lines.map((l) => l.text);

const SUMMARY = {
  synced: "Weekly Schedule for Sam S.: Synced.",
  failed: "Weekly Schedule for Sam S.: Failed. The Notion save failed.",
  skipped: "Weekly Schedule for Sam S.: Not updated. Import this student on the Schedules page first.",
};
const DAILY = { updated: "Today's Notion task updated.", failed: "Today's Notion task could not be updated." };

describe("saveNotice: all 20 combinations (AC1, AC2)", () => {
  const summaries = ["synced", "failed", "skipped", undefined] as const;
  const dailies = ["updated", "unchanged", "skipped", "failed", undefined] as const;
  for (const summarySync of summaries) {
    for (const dailyTask of dailies) {
      it(`summary ${summarySync ?? "absent"}, daily ${dailyTask ?? "absent"}`, () => {
        const n = saveNotice({ ...base, summarySync, dailyTask });
        const expected = ["Saved."];
        if (summarySync) expected.push(SUMMARY[summarySync]);
        if (dailyTask === "updated" || dailyTask === "failed") expected.push(DAILY[dailyTask]);
        expect(n.lines.map((l) => l.text)).toEqual(expected);
        const bad = summarySync === "failed" || summarySync === "skipped" || dailyTask === "failed";
        expect(n.tone).toBe(bad ? "warn" : "ok");
        // Only failed lines carry a retry.
        expect(n.lines.filter((l) => l.retry).map((l) => l.retry)).toEqual([
          ...(summarySync === "failed" ? ["summary"] : []),
          ...(dailyTask === "failed" ? ["dailyTask"] : []),
        ]);
      });
    }
  }

  it('"Saved." alone and ok only when nothing applied or nothing changed', () => {
    const alone: string[] = [];
    for (const summarySync of summaries) {
      for (const dailyTask of dailies) {
        const n = saveNotice({ ...base, summarySync, dailyTask });
        if (n.lines.length === 1 && n.lines[0].text === "Saved.") {
          expect(n.tone).toBe("ok");
          alone.push(`${summarySync}/${dailyTask}`);
        }
      }
    }
    expect(alone.sort()).toEqual(["undefined/skipped", "undefined/undefined", "undefined/unchanged"]);
  });

  it("falls back to this student when the name is unknown", () => {
    expect(texts({ ...base, studentName: null, summarySync: "synced" })[1]).toBe("Weekly Schedule for this student: Synced.");
  });

  it("an unreadable body is warn, one line, no retry, never a bare Saved.", () => {
    const n = saveNotice({ ...base, unreadable: true });
    expect(n).toEqual({ tone: "warn", lines: [{ text: "Saved. The Notion results could not be read." }] });
  });

  it("a failed retry adds Retry did not work. and keeps the retry", () => {
    const n = saveNotice({ ...base, summarySync: "failed", dailyTask: "failed", retryFailed: { summary: true, dailyTask: true } });
    expect(n.lines).toEqual([
      { text: "Saved." },
      { text: `${SUMMARY.failed} Retry did not work.`, retry: "summary" },
      { text: `${DAILY.failed} Retry did not work.`, retry: "dailyTask" },
    ]);
    expect(n.tone).toBe("warn");
  });
});

describe("readSaveOutcome (AC2, AC3)", () => {
  const series = { id: S1, staffId: S1, studentId: S1, subject: "Math", kind: "weekly" };
  it("reads both fields and the student id from a full SeriesResponse body", () => {
    expect(readSaveOutcome({ summarySync: "failed", dailyTask: "updated", series }, "Sam S.")).toEqual({
      summarySync: "failed", dailyTask: "updated", studentId: S1, studentName: "Sam S.",
    });
  });
  it("a body with neither field is not applicable", () => {
    const o = readSaveOutcome({ series }, "Sam S.");
    expect(o).toEqual({ summarySync: undefined, dailyTask: undefined, studentId: S1, studentName: "Sam S." });
    expect(saveNotice(o)).toEqual({ tone: "ok", lines: [{ text: "Saved." }] });
  });
  it("an unreadable body gives the AC2 line", () => {
    for (const bad of [null, "ok", { summarySync: "lost", series }, { series: { studentId: "nope" } }, {}]) {
      const o = readSaveOutcome(bad, "Sam S.");
      expect(o.unreadable).toBe(true);
      expect(texts(o)).toEqual(["Saved. The Notion results could not be read."]);
    }
  });
});

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data });
const fail = (status?: number): ApiResult<unknown> => ({ ok: false, stale: false, message: "x", status });

describe("afterSummaryRetry (AC4)", () => {
  const failed: SaveOutcome = { ...base, summarySync: "failed", dailyTask: "updated" };
  it("synced turns the line to Synced and drops the retry", () => {
    const o = afterSummaryRetry(failed, ok({ results: [{ studentId: S1, summarySync: "synced" }] }));
    expect(o.summarySync).toBe("synced");
    expect(saveNotice(o)).toEqual({ tone: "ok", lines: [{ text: "Saved." }, { text: SUMMARY.synced }, { text: DAILY.updated }] });
  });
  it("a cleared retry failure goes away on success", () => {
    const o = afterSummaryRetry({ ...failed, retryFailed: { summary: true } }, ok({ results: [{ studentId: S1, summarySync: "synced" }] }));
    expect(texts(o)[1]).toBe(SUMMARY.synced);
  });
  it("failed, 404 and no network keep Failed and add Retry did not work.", () => {
    for (const r of [ok({ results: [{ studentId: S1, summarySync: "failed" }] }), fail(404), fail(), ok(null)]) {
      const o = afterSummaryRetry(failed, r);
      expect(o.summarySync).toBe("failed");
      expect(texts(o)[1]).toBe(`${SUMMARY.failed} Retry did not work.`);
      expect(saveNotice(o).tone).toBe("warn");
    }
  });
});

describe("afterDailyRetry (AC5)", () => {
  const failed: SaveOutcome = { ...base, dailyTask: "failed" };
  const run = (result: string) => ok({ result, status: { state: "ready", pageUrl: null, lastError: null, updatedAt: null } });
  it("created and updated show the updated line", () => {
    for (const result of ["created", "updated"]) {
      const o = afterDailyRetry(failed, run(result));
      expect(saveNotice(o)).toEqual({ tone: "ok", lines: [{ text: "Saved." }, { text: DAILY.updated }] });
    }
  });
  it("unchanged and skipped remove the line", () => {
    for (const result of ["unchanged", "skipped"]) {
      expect(saveNotice(afterDailyRetry(failed, run(result)))).toEqual({ tone: "ok", lines: [{ text: "Saved." }] });
    }
  });
  it("busy, failed and a non-ok response keep the line and add Retry did not work.", () => {
    for (const r of [run("busy"), run("failed"), fail(400), fail()]) {
      const o = afterDailyRetry(failed, r);
      expect(o.dailyTask).toBe("failed");
      expect(texts(o)[1]).toBe(`${DAILY.failed} Retry did not work.`);
    }
  });
});
