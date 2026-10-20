import { describe, expect, it } from "vitest";
import { LessonLinkError } from "../../../lib/domain/schedule/lesson-link";
import {
  handleClearOutcome, handleLinkLesson, handleLogClass, handleNoShow, handleUnlinked,
} from "../../../lib/scheduler/lesson-handlers";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import type { ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import { admin, fixture, KUBY, RYAN, S1, S2, teacher } from "./booking-world.fake";
import { fakeLessons, memoryOutcomes } from "./lesson-world.fake";

// REQ-39: Log this class, Mark no-show, owner clear, Unlinked lessons and Link.
// Today is Mon 2026-10-19. P is Ryan's weekly for S1 from Mon 2026-09-28, K is
// Kuby's weekly for S2 from Tue 2026-09-29.
const L_FORM = "f0000000-0000-4000-8000-000000000001";
const L_OTHER = "f0000000-0000-4000-8000-000000000002";

async function setup(opts: { ready?: boolean } = {}) {
  const f = await fixture();
  let now = Date.parse("2026-10-19T18:00:00Z");
  const outcomes = memoryOutcomes(() => now);
  const lessons = fakeLessons(opts);
  const p = await f.seed({ startDate: "2026-09-28", durationMinutes: 50 });
  const k = await f.seed({ staffId: KUBY, studentId: S2, startDate: "2026-09-29", startTime: "17:00" });
  const deps = (identity: SchedulerIdentity = admin): ScheduleDeps => ({ ...f.deps(identity), lessons: lessons.port, outcomes: outcomes.store, now: () => now });
  f.begin();
  return { ...f, p, k, outcomes, lessons, deps, advance: (ms: number) => { now += ms; } };
}
const read = async (r: Response) => ({ status: r.status, body: await r.json() });
const log = (deps: ScheduleDeps, seriesId: string, originalDate: string) => handleLogClass(deps, { seriesId, originalDate });

describe("POST /lessons: Log this class", () => {
  it("AC3: a past class makes one find and one create, then answers 201 delivered", async () => {
    const w = await setup();
    const r = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(true);
    expect(r.body.outcome).toMatchObject({ state: "delivered", lessonDate: "2026-10-12" });
    expect(r.body.outcome.lessonUrl).toBe(`https://www.notion.so/${r.body.outcome.lessonId.replaceAll("-", "")}`);
    expect(w.lessons.calls.map((c) => c.name)).toEqual(["findLessonFor", "createLesson"]);
    expect(w.lessons.calls[1].args[0]).toEqual({ ref: `sched:${w.p.id}:2026-10-12`, date: "2026-10-12", staffId: RYAN, studentId: S1, durationMinutes: 50 });
    const row = [...w.outcomes.rows.values()][0];
    expect(row).toMatchObject({ outcome: "delivered", linkSource: "logged", notionLessonId: r.body.outcome.lessonId, claimedAt: null });
  });

  it("AC4: a Notion row already holding the ref is recorded with created false and no create", async () => {
    const w = await setup();
    w.lessons.formRow(L_FORM, "2026-10-12", RYAN, S1, `sched:${w.p.id}:2026-10-12`);
    const r = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ created: false, outcome: { state: "delivered", lessonId: L_FORM } });
    expect(w.lessons.writes()).toEqual([]);
  });

  it("AC4: two rows with the ref answer 409 duplicate_link and store no lesson", async () => {
    const w = await setup();
    const ref = `sched:${w.p.id}:2026-10-12`;
    w.lessons.formRow(L_FORM, "2026-10-12", RYAN, S1, ref);
    w.lessons.formRow(L_OTHER, "2026-10-12", RYAN, S1, ref);
    const r = await read(await log(w.deps(), w.p.id, "2026-10-12"));
    expect(r).toEqual({ status: 409, body: { error: "duplicate_link" } });
    expect([...w.outcomes.rows.values()].every((x) => x.notionLessonId === null)).toBe(true);
  });

  it("AC6: a second log answers 200 from the stored row and makes zero port calls", async () => {
    const w = await setup();
    const first = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    w.lessons.calls.length = 0;
    const again = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ created: false, outcome: first.body.outcome });
    expect(w.lessons.calls).toEqual([]);
  });

  it("AC6: two parallel logs make one create; the other gets 409 log_in_progress or 200", async () => {
    const w = await setup();
    const [a, b] = await Promise.all([log(w.deps(teacher), w.p.id, "2026-10-12"), log(w.deps(), w.p.id, "2026-10-12")]);
    expect(w.lessons.calls.filter((c) => c.name === "createLesson")).toHaveLength(1);
    const statuses = [a.status, b.status].sort();
    expect([[201, 409], [200, 201]]).toContainEqual(statuses);
    const loser = a.status === 201 ? b : a;
    if (loser.status === 409) expect(await loser.json()).toEqual({ error: "log_in_progress" });
  });

  it("AC6: a create that fails gives 502 with the row pending; after the claim lapses the next log finds the committed row", async () => {
    const w = await setup();
    w.lessons.failNext("createLesson", undefined, true);
    const first = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(first).toEqual({ status: 502, body: { error: "notion_failed" } });
    const row = [...w.outcomes.rows.values()][0];
    expect(row).toMatchObject({ outcome: "delivered", notionLessonId: null });
    expect(row.claimedAt).not.toBeNull();

    const busy = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(busy).toEqual({ status: 409, body: { error: "log_in_progress" } });

    w.advance(61_000);
    w.lessons.calls.length = 0;
    const retry = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(retry.status).toBe(200);
    expect(retry.body.created).toBe(false);
    expect(w.lessons.calls.map((c) => c.name)).toEqual(["findLessonFor"]);
    expect(w.lessons.pages.size).toBe(1);
  });

  it("AC5: cancelled, future and non-pattern occurrences give 422 not_linkable with zero port calls", async () => {
    const w = await setup();
    w.exceptions.push({ seriesId: w.p.id, originalDate: "2026-10-05", kind: "cancelled", newDate: null, newStartTime: null, requestId: "x" });
    for (const date of ["2026-10-05", "2026-10-26", "2026-10-13"]) {
      expect(await read(await log(w.deps(), w.p.id, date))).toEqual({ status: 422, body: { error: "not_linkable" } });
    }
    expect(w.lessons.calls).toEqual([]);
    expect(w.outcomes.rows.size).toBe(0);
  });

  it("AC10: a moved occurrence links under its original date, with its new date on the lesson", async () => {
    const w = await setup();
    w.exceptions.push({ seriesId: w.p.id, originalDate: "2026-10-12", kind: "moved", newDate: "2026-10-14", newStartTime: "16:00", requestId: "x" });
    const r = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    expect(r.status).toBe(201);
    expect(w.lessons.calls[1].args[0]).toMatchObject({ ref: `sched:${w.p.id}:2026-10-12`, date: "2026-10-14" });
    expect(r.body.outcome.lessonDate).toBe("2026-10-14");
  });

  it("a teacher logging Kuby's class gets 403 with zero outcome and port calls", async () => {
    const w = await setup();
    expect((await log(w.deps(teacher), w.k.id, "2026-10-13")).status).toBe(403);
    expect(w.outcomes.calls).toEqual([]);
    expect(w.lessons.calls).toEqual([]);
  });

  it("AC2: a Lessons database without Class occurrence answers 503 lessons_not_ready", async () => {
    const w = await setup({ ready: false });
    expect(await read(await log(w.deps(teacher), w.p.id, "2026-10-12"))).toEqual({ status: 503, body: { error: "lessons_not_ready" } });
  });

  it("not wired: 503 lessons_not_ready before any read", async () => {
    const w = await setup();
    const deps = { ...w.deps(), lessons: undefined, outcomes: undefined };
    expect(await read(await log(deps, w.p.id, "2026-10-12"))).toEqual({ status: 503, body: { error: "lessons_not_ready" } });
  });

  it("rejects a malformed body", async () => {
    const w = await setup();
    expect((await handleLogClass(w.deps(), { seriesId: "x", originalDate: "2026-10-12" })).status).toBe(400);
    expect((await handleLogClass(w.deps(), { seriesId: w.p.id, originalDate: "2026-10-12", extra: 1 })).status).toBe(400);
  });
});

describe("POST /outcomes: Mark no-show (AC7)", () => {
  const noShow = (deps: ScheduleDeps, seriesId: string, originalDate: string) => handleNoShow(deps, { seriesId, originalDate, outcome: "no_show" });
  it("stores a no_show with no Notion request, then 409 already_recorded", async () => {
    const w = await setup();
    expect(await read(await noShow(w.deps(teacher), w.p.id, "2026-10-12"))).toEqual({ status: 201, body: { outcome: { state: "no_show" } } });
    expect(await read(await noShow(w.deps(teacher), w.p.id, "2026-10-12"))).toEqual({ status: 409, body: { error: "already_recorded" } });
    expect(await read(await log(w.deps(teacher), w.p.id, "2026-10-12"))).toEqual({ status: 409, body: { error: "already_recorded" } });
    expect(w.lessons.calls).toEqual([]);
  });
  it("a logged class cannot be marked no-show", async () => {
    const w = await setup();
    await log(w.deps(teacher), w.p.id, "2026-10-12");
    expect(await read(await noShow(w.deps(teacher), w.p.id, "2026-10-12"))).toEqual({ status: 409, body: { error: "already_recorded" } });
  });
  it("refuses a future class and another teacher's class", async () => {
    const w = await setup();
    expect((await noShow(w.deps(teacher), w.p.id, "2026-10-26")).status).toBe(422);
    expect((await noShow(w.deps(teacher), w.k.id, "2026-10-13")).status).toBe(403);
    expect(w.outcomes.rows.size).toBe(0);
  });
  it("the owner can mark any teacher's class", async () => {
    const w = await setup();
    expect((await noShow(w.deps(admin), w.k.id, "2026-10-13")).status).toBe(201);
  });
});

describe("DELETE /outcomes: owner clear (AC8)", () => {
  const clear = (deps: ScheduleDeps, seriesId: string, originalDate: string) => handleClearOutcome(deps, { seriesId, originalDate });
  it("a no-show is deleted with no Notion request", async () => {
    const w = await setup();
    await handleNoShow(w.deps(teacher), { seriesId: w.p.id, originalDate: "2026-10-12", outcome: "no_show" });
    expect(await read(await clear(w.deps(), w.p.id, "2026-10-12"))).toEqual({ status: 200, body: { cleared: true, lesson: null } });
    expect(w.outcomes.rows.size).toBe(0);
    expect(w.lessons.calls).toEqual([]);
  });
  it("a delivered row is unlinked in Notion first, then deleted", async () => {
    const w = await setup();
    const logged = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    w.lessons.calls.length = 0;
    expect(await read(await clear(w.deps(), w.p.id, "2026-10-12"))).toEqual({ status: 200, body: { cleared: true, lesson: "cleared" } });
    expect(w.lessons.calls.map((c) => c.name)).toEqual(["unlinkLesson"]);
    expect(w.lessons.pages.get(logged.body.outcome.lessonId)!.ref).toBe("");
    expect(w.outcomes.rows.size).toBe(0);
  });
  it("a lesson that is gone or carries another ref is left; only the row is deleted", async () => {
    const w = await setup();
    const logged = await read(await log(w.deps(teacher), w.p.id, "2026-10-12"));
    w.lessons.pages.get(logged.body.outcome.lessonId)!.ref = "sched:else";
    expect(await read(await clear(w.deps(), w.p.id, "2026-10-12"))).toEqual({ status: 200, body: { cleared: true, lesson: "kept" } });
    expect(w.lessons.pages.get(logged.body.outcome.lessonId)!.ref).toBe("sched:else");
  });
  it("a Notion failure on unlink keeps the row and answers 502", async () => {
    const w = await setup();
    await log(w.deps(teacher), w.p.id, "2026-10-12");
    w.lessons.port.unlinkLesson = async () => { throw new Error("down"); };
    expect((await clear(w.deps(), w.p.id, "2026-10-12")).status).toBe(502);
    expect(w.outcomes.rows.size).toBe(1);
  });
  it("a teacher gets 403 and nothing is read or written", async () => {
    const w = await setup();
    await handleNoShow(w.deps(teacher), { seriesId: w.p.id, originalDate: "2026-10-12", outcome: "no_show" });
    w.outcomes.calls.length = 0;
    w.calls.length = 0;
    expect((await clear(w.deps(teacher), w.p.id, "2026-10-12")).status).toBe(403);
    expect(w.outcomes.calls).toEqual([]);
    expect(w.calls).toEqual([]);
    expect(w.outcomes.rows.size).toBe(1);
  });
  it("no outcome answers 404", async () => {
    const w = await setup();
    expect((await clear(w.deps(), w.p.id, "2026-10-12")).status).toBe(404);
  });
});

describe("Unlinked lessons and Link (AC12)", () => {
  const q = (from: string, to: string) => new URLSearchParams({ from, to });
  it("lists unlinked classes with exact-match candidates and possible double logs; loading writes nothing", async () => {
    const w = await setup();
    w.lessons.formRow(L_FORM, "2026-10-12", RYAN, S1);
    w.lessons.formRow(L_OTHER, "2026-10-12", RYAN, S2);
    await log(w.deps(teacher), w.p.id, "2026-10-05");
    w.lessons.formRow("f0000000-0000-4000-8000-000000000003", "2026-10-05", RYAN, S1);
    w.lessons.calls.length = 0;
    w.outcomes.calls.length = 0;
    const r = await read(await handleUnlinked(w.deps(), q("2026-10-05", "2026-10-18")));
    expect(r.status).toBe(200);
    const p12 = r.body.unlinked.find((u: { seriesId: string; originalDate: string }) => u.seriesId === w.p.id && u.originalDate === "2026-10-12");
    expect(p12.candidates.map((c: { lessonId: string }) => c.lessonId)).toEqual([L_FORM]);
    expect(p12).toMatchObject({ staffName: "Ryan", subject: "MHF4U", date: "2026-10-12" });
    const k13 = r.body.unlinked.find((u: { seriesId: string }) => u.seriesId === w.k.id);
    expect(k13.candidates).toEqual([]);
    expect(r.body.doubles.map((d: { lessonId: string; date: string }) => [d.date, d.lessonId])).toEqual([["2026-10-05", "f0000000-0000-4000-8000-000000000003"]]);
    expect(w.lessons.writes()).toEqual([]);
    expect(w.outcomes.calls).toEqual(["listForOccurrences"]);
  });

  it("defaults to the 14 days ending today and refuses more than 31 days", async () => {
    const w = await setup();
    const r = await read(await handleUnlinked(w.deps(), new URLSearchParams()));
    expect([r.body.from, r.body.to]).toEqual(["2026-10-06", "2026-10-19"]);
    expect((await handleUnlinked(w.deps(), q("2026-09-01", "2026-10-19"))).status).toBe(400);
  });

  it("Link patches Class occurrence alone and stores a reconciled delivered row", async () => {
    const w = await setup();
    w.lessons.formRow(L_FORM, "2026-10-12", RYAN, S1);
    const r = await read(await handleLinkLesson(w.deps(), { seriesId: w.p.id, originalDate: "2026-10-12", lessonId: L_FORM }));
    expect(r.status).toBe(200);
    expect(r.body.outcome).toMatchObject({ state: "delivered", lessonId: L_FORM, lessonDate: "2026-10-12" });
    expect(w.lessons.writes()).toEqual([{ name: "linkLesson", args: [L_FORM, `sched:${w.p.id}:2026-10-12`] }]);
    expect([...w.outcomes.rows.values()][0]).toMatchObject({ linkSource: "reconciled", notionLessonId: L_FORM });
    // A double click links once.
    expect((await handleLinkLesson(w.deps(), { seriesId: w.p.id, originalDate: "2026-10-12", lessonId: L_FORM })).status).toBe(409);
    expect(w.lessons.writes()).toHaveLength(1);
  });

  it("ref_in_use, lesson_linked_elsewhere and lesson_mismatch write nothing", async () => {
    const w = await setup();
    w.lessons.formRow(L_OTHER, "2026-10-12", RYAN, S1, `sched:${w.p.id}:2026-10-12`);
    w.lessons.formRow(L_FORM, "2026-10-12", RYAN, S1);
    const link = (lessonId: string, originalDate = "2026-10-12") => handleLinkLesson(w.deps(), { seriesId: w.p.id, originalDate, lessonId });
    expect(await read(await link(L_FORM))).toEqual({ status: 409, body: { error: "ref_in_use" } });
    w.lessons.formRow("f0000000-0000-4000-8000-000000000004", "2026-10-05", RYAN, S1, "sched:else");
    expect(await read(await link("f0000000-0000-4000-8000-000000000004", "2026-10-05"))).toEqual({ status: 409, body: { error: "lesson_linked_elsewhere" } });
    expect(await read(await link(L_FORM, "2026-10-05"))).toEqual({ status: 422, body: { error: "lesson_mismatch" } });
    expect(w.lessons.writes()).toEqual([]);
    expect(w.outcomes.rows.size).toBe(0);
  });

  it("a teacher gets 403 from both routes", async () => {
    const w = await setup();
    expect((await handleUnlinked(w.deps(teacher), q("2026-10-05", "2026-10-18"))).status).toBe(403);
    expect((await handleLinkLesson(w.deps(teacher), { seriesId: w.p.id, originalDate: "2026-10-12", lessonId: L_FORM })).status).toBe(403);
    expect(w.lessons.calls).toEqual([]);
  });

  it("a Lessons database without Class occurrence answers 503", async () => {
    const w = await setup({ ready: false });
    expect(await read(await handleUnlinked(w.deps(), q("2026-10-05", "2026-10-18")))).toEqual({ status: 503, body: { error: "lessons_not_ready" } });
  });

  it("duplicate_link from the port is a 409", async () => {
    const w = await setup();
    w.lessons.port.findLessonFor = async () => { throw new LessonLinkError("duplicate_link"); };
    expect(await read(await handleLinkLesson(w.deps(), { seriesId: w.p.id, originalDate: "2026-10-12", lessonId: L_FORM }))).toEqual({ status: 409, body: { error: "duplicate_link" } });
  });
});
