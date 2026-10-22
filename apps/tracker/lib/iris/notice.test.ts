import { describe, expect, it } from "vitest";
import type { ClassException, ClassSeries } from "../domain/schedule/recurrence";
import { resolveCancellation } from "./notice";

// REQ-46 AC1 to AC6: which class a cancellation is about, and how much notice it gave.
const STUDENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005";
const series = (o: Partial<ClassSeries> = {}): ClassSeries => ({
  id: "s1", staffId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0009", studentId: STUDENT, subject: "MPM2D", kind: "weekly",
  startDate: "2026-10-06", startTime: "17:00", durationMinutes: 60, effectiveUntil: null, ...o,
});
const TUE = [series()];
const cancelled20: ClassException = { seriesId: "s1", originalDate: "2026-10-20", kind: "cancelled", newDate: null, newStartTime: null };
const moved20: ClassException = { seriesId: "s1", originalDate: "2026-10-20", kind: "moved", newDate: "2026-10-22", newStartTime: "16:00" };
const resolve = (receivedAt: string, o: { earlier?: string[]; series?: ClassSeries[]; exceptions?: ClassException[] } = {}) =>
  resolveCancellation({ receivedAt, earlierInbound: o.earlier ?? [], series: o.series ?? TUE, exceptions: o.exceptions ?? [] });

// October 2026 is EDT (UTC-4): Tue 2026-10-20 17:00 local is 21:00Z.
const CLASS_20 = "2026-10-20T21:00:00.000Z";

describe("resolveCancellation: notice (AC1, AC2)", () => {
  it("21 h before is with notice, naming the missed and the next class", () => {
    expect(resolve("2026-10-20T00:00:00.000Z")).toEqual({
      kind: "cancel_with_notice", missedDate: "2026-10-20", missedStartsAt: CLASS_20, nextDate: "2026-10-27", noticeMinutes: 21 * 60,
    });
  });

  it.each([
    ["Tue 06:00 (11 h)", "2026-10-20T10:00:00.000Z", "late_cancel", 11 * 60],
    ["Tue 05:00 (exactly 12 h)", "2026-10-20T09:00:00.000Z", "cancel_with_notice", 12 * 60],
    ["Tue 05:01 (11 h 59)", "2026-10-20T09:01:00.000Z", "late_cancel", 12 * 60 - 1],
  ])("%s", (_label, at, kind, minutes) => {
    expect(resolve(at)).toMatchObject({ kind, missedDate: "2026-10-20", nextDate: "2026-10-27", noticeMinutes: minutes });
  });
});

describe("resolveCancellation: after the start (AC3)", () => {
  it.each([
    ["17:20, during class", "2026-10-20T21:20:00.000Z"],
    ["18:30, after it ended", "2026-10-20T22:30:00.000Z"],
  ])("%s with nothing earlier is a no-show", (_label, at) => {
    expect(resolve(at)).toEqual({ kind: "no_show", missedDate: "2026-10-20", missedStartsAt: CLASS_20 });
  });

  it("an earlier message at Mon 20:00 makes it a cancellation with notice, counted from that message", () => {
    expect(resolve("2026-10-20T21:20:00.000Z", { earlier: ["2026-10-20T00:00:00.000Z"] })).toMatchObject({ kind: "cancel_with_notice", missedDate: "2026-10-20", noticeMinutes: 21 * 60 });
  });

  it("an earlier message at Tue 16:00 makes it a late cancellation", () => {
    expect(resolve("2026-10-20T21:20:00.000Z", { earlier: ["2026-10-20T20:00:00.000Z"] })).toMatchObject({ kind: "late_cancel", noticeMinutes: 60 });
  });

  it("an earlier message more than 7 days before the class is ignored", () => {
    expect(resolve("2026-10-20T21:20:00.000Z", { earlier: ["2026-10-13T10:00:00.000Z"] })).toMatchObject({ kind: "no_show" });
  });

  it("notice before the start counts from the earliest message in the window", () => {
    expect(resolve("2026-10-20T10:00:00.000Z", { earlier: ["2026-10-19T21:00:00.000Z", "2026-10-13T10:00:00.000Z"] })).toMatchObject({ kind: "cancel_with_notice", noticeMinutes: 24 * 60 });
  });
});

describe("resolveCancellation: real elapsed time across DST (AC4)", () => {
  it("Mon 2026-11-02 20:00 for Tue 11-03 17:00 EST is with notice", () => {
    expect(resolve("2026-11-03T01:00:00.000Z")).toMatchObject({ kind: "cancel_with_notice", missedDate: "2026-11-03", missedStartsAt: "2026-11-03T22:00:00.000Z", noticeMinutes: 21 * 60 });
  });

  it("fall back: 01:00 EDT to 12:30 EST is 12.5 h, with notice", () => {
    const s = [series({ kind: "one_off", startDate: "2026-11-01", startTime: "12:30" })];
    expect(resolve("2026-11-01T05:00:00.000Z", { series: s })).toMatchObject({ kind: "cancel_with_notice", missedDate: "2026-11-01", noticeMinutes: 750, nextDate: null });
  });

  it("spring forward: 01:00 EST to 13:30 EDT is 11.5 h, late", () => {
    const s = [series({ kind: "one_off", startDate: "2026-03-08", startTime: "13:30" })];
    expect(resolve("2026-03-08T06:00:00.000Z", { series: s })).toMatchObject({ kind: "late_cancel", missedDate: "2026-03-08", noticeMinutes: 690 });
  });
});

describe("resolveCancellation: scheduler exceptions (AC5)", () => {
  it("a cancelled occurrence is never the target", () => {
    expect(resolve("2026-10-20T10:00:00.000Z", { exceptions: [cancelled20] })).toMatchObject({
      kind: "cancel_with_notice", missedDate: "2026-10-27", missedStartsAt: "2026-10-27T21:00:00.000Z", nextDate: "2026-11-03",
    });
  });

  it("a moved occurrence is the target at its new date and time", () => {
    expect(resolve("2026-10-22T10:00:00.000Z", { exceptions: [moved20] })).toMatchObject({
      kind: "late_cancel", missedDate: "2026-10-22", missedStartsAt: "2026-10-22T20:00:00.000Z", nextDate: "2026-10-27", noticeMinutes: 600,
    });
  });

  it("with the class moved away, Tue 18:00 is not a no-show", () => {
    expect(resolve("2026-10-20T22:00:00.000Z", { exceptions: [moved20] })).toMatchObject({ kind: "cancel_with_notice", missedDate: "2026-10-22" });
  });
});

describe("resolveCancellation: schedule unknown (AC6)", () => {
  it("no series", () => {
    expect(resolve("2026-10-20T00:00:00.000Z", { series: [] })).toEqual({ kind: "schedule_unknown" });
  });

  it("a series that ended", () => {
    expect(resolve("2026-10-20T00:00:00.000Z", { series: [series({ effectiveUntil: "2026-10-13" })] })).toEqual({ kind: "schedule_unknown" });
  });

  it("the horizon is 42 days after the receipt date", () => {
    const at = "2026-10-20T00:00:00.000Z"; // Mon 2026-10-19 local
    expect(resolve(at, { series: [series({ kind: "one_off", startDate: "2026-11-30" })] })).toMatchObject({ kind: "cancel_with_notice", missedDate: "2026-11-30" });
    expect(resolve(at, { series: [series({ kind: "one_off", startDate: "2026-12-01" })] })).toEqual({ kind: "schedule_unknown" });
  });

  it("a class that started yesterday is not today's no-show", () => {
    const s = [series({ kind: "one_off", startDate: "2026-10-19", startTime: "23:30" })];
    expect(resolve("2026-10-20T04:00:00.000Z", { series: s })).toEqual({ kind: "schedule_unknown" });
  });
});
