import { LessonLinkError, type LessonLinkPort, type LessonRow, type NewLesson } from "../../../lib/domain/schedule/lesson-link";
import { NotionError } from "../../../lib/notion/staff";
import type { NewOutcome, OutcomeRecord, OutcomeStore } from "../../../lib/scheduler/outcome-store";

/** An in-memory OutcomeStore with the database's unique key and compare-and-set takeover. Calls are logged by name. */
export function memoryOutcomes(clock: () => number) {
  const rows = new Map<string, OutcomeRecord>();
  const calls: string[] = [];
  let n = 0;
  const key = (seriesId: string, originalDate: string) => `${seriesId}:${originalDate}`;
  const insert = (input: NewOutcome): { ok: true; row: OutcomeRecord } | { ok: false; error: "exists" } => {
    if (rows.has(key(input.seriesId, input.originalDate))) return { ok: false, error: "exists" };
    const row: OutcomeRecord = {
      id: `90000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seriesId: input.seriesId, originalDate: input.originalDate, outcome: input.outcome,
      linkSource: input.linkSource, notionLessonId: null, lessonDate: null, claimedAt: input.outcome === "delivered" ? new Date(clock()).toISOString() : null,
    };
    rows.set(key(row.seriesId, row.originalDate), row);
    return { ok: true, row };
  };
  const byId = (id: string) => [...rows.values()].find((r) => r.id === id);
  const store: OutcomeStore = {
    listForOccurrences: async (keys) => { calls.push("listForOccurrences"); return keys.map((k) => rows.get(key(k.seriesId, k.originalDate))).filter((r): r is OutcomeRecord => !!r); },
    get: async (seriesId, originalDate) => { calls.push("get"); return rows.get(key(seriesId, originalDate)) ?? null; },
    claim: async (input) => { calls.push("claim"); return insert({ ...input, outcome: "delivered" }); },
    takeOver: async (id, seen) => {
      calls.push("takeOver");
      const r = byId(id);
      if (!r || r.notionLessonId || r.claimedAt !== seen) return null;
      r.claimedAt = new Date(clock()).toISOString();
      return { ...r };
    },
    complete: async (id, lessonId, lessonDate) => {
      calls.push("complete");
      const r = byId(id)!;
      if ([...rows.values()].some((x) => x.id !== id && x.notionLessonId === lessonId)) throw new Error("23505");
      Object.assign(r, { notionLessonId: lessonId, lessonDate, claimedAt: null });
      return { ...r };
    },
    insertNoShow: async (input) => { calls.push("insertNoShow"); return insert({ ...input, outcome: "no_show", linkSource: null }); },
    remove: async (id) => { calls.push("remove"); const r = byId(id); if (r) rows.delete(key(r.seriesId, r.originalDate)); return !!r; },
  };
  return { store, rows, calls };
}

export type PortCall = { name: keyof LessonLinkPort; args: unknown[] };

/** A fake Lessons database behind the LessonLinkPort contract. `fail` makes the next call of that name throw. */
export function fakeLessons(opts: { ready?: boolean } = {}) {
  const pages = new Map<string, LessonRow>();
  const calls: PortCall[] = [];
  const failures = new Map<string, { error: Error; commit?: boolean }>();
  let n = 0;
  const check = (name: keyof LessonLinkPort, args: unknown[]) => {
    calls.push({ name, args });
    if (opts.ready === false) throw new LessonLinkError("lessons_not_ready");
  };
  const failNext = (name: keyof LessonLinkPort, error: Error = new NotionError("Notion returned 504", 504), commit = false) => failures.set(name, { error, commit });
  const maybeFail = (name: string, commit: () => void) => {
    const f = failures.get(name);
    if (!f) return;
    failures.delete(name);
    if (f.commit) commit();
    throw f.error;
  };
  const port: LessonLinkPort = {
    async findLessonFor(ref) {
      check("findLessonFor", [ref]);
      const hits = [...pages.values()].filter((p) => p.ref === ref);
      if (hits.length > 1) throw new LessonLinkError("duplicate_link");
      return hits[0] ? { lessonId: hits[0].id } : null;
    },
    async linkLesson(lessonId, ref) {
      check("linkLesson", [lessonId, ref]);
      maybeFail("linkLesson", () => { pages.get(lessonId)!.ref = ref; });
      pages.get(lessonId)!.ref = ref;
    },
    async unlinkLesson(lessonId, ref) {
      check("unlinkLesson", [lessonId, ref]);
      const p = pages.get(lessonId);
      if (!p) return "gone";
      if (p.ref !== ref) return "kept";
      p.ref = "";
      return "cleared";
    },
    async getLesson(lessonId) {
      check("getLesson", [lessonId]);
      const p = pages.get(lessonId);
      return p ? { ...p } : null;
    },
    async createLesson(input: NewLesson) {
      check("createLesson", [input]);
      const id = `e0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const commit = () => { pages.set(id, { id, date: input.date, staffIds: [input.staffId], studentIds: [input.studentId], ref: input.ref }); };
      maybeFail("createLesson", commit);
      commit();
      return { lessonId: id };
    },
    async listUnlinkedLessons(range) {
      check("listUnlinkedLessons", [range]);
      return [...pages.values()].filter((p) => p.ref === "" && p.date && p.date >= range.from && p.date <= range.to);
    },
  };
  /** A row that came in through the Notion form: no ref. */
  const formRow = (id: string, date: string, staffId: string, studentId: string, ref = "") => { pages.set(id, { id, date, staffIds: [staffId], studentIds: [studentId], ref }); };
  return { port, pages, calls, failNext, formRow, writes: () => calls.filter((c) => ["createLesson", "linkLesson", "unlinkLesson"].includes(c.name)) };
}
