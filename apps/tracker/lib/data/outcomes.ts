import { z } from "zod";
import type { Inserted, OccurrenceKey, OutcomeRecord, OutcomeStore } from "../scheduler/outcome-store";
import type { ScheduleContext } from "./schedule";

/**
 * Class outcomes (migration 0023) over the signed-in user's Supabase client,
 * so RLS decides: the owner, or the series' teacher for their own rows. Every
 * row is parsed with Zod (ADR 0017). Reads throw on any query error, so a
 * failed read never looks like "nothing logged".
 */
const uuid = z.guid();
const Row = z.object({
  id: uuid, series_id: uuid, original_date: z.string(), outcome: z.enum(["delivered", "no_show"]),
  link_source: z.enum(["logged", "reconciled"]).nullable(), notion_lesson_id: uuid.nullable(), lesson_date: z.string().nullable(),
  claimed_at: z.string().nullable(),
}).transform((r): OutcomeRecord => ({
  id: r.id, seriesId: r.series_id, originalDate: r.original_date, outcome: r.outcome, linkSource: r.link_source,
  notionLessonId: r.notion_lesson_id, lessonDate: r.lesson_date, claimedAt: r.claimed_at,
}));
const COLUMNS = "id, series_id, original_date, outcome, link_source, notion_lesson_id, lesson_date, claimed_at";

export function createOutcomeStore(context: () => Promise<ScheduleContext | null>): OutcomeStore {
  const ctx = async () => {
    const c = await context();
    if (!c) throw new Error("scheduler storage unavailable");
    return c;
  };
  const insert = async (key: OccurrenceKey, values: Record<string, unknown>): Promise<Inserted> => {
    const { db, orgId, userId } = await ctx();
    const { data, error } = await db.tracker.from("occurrence_outcomes")
      .insert({ org_id: orgId, series_id: key.seriesId, original_date: key.originalDate, created_by: userId, ...values })
      .select(COLUMNS).single();
    if (error?.code === "23505") return { ok: false, error: "exists" };
    if (error || !data) throw new Error("unavailable");
    return { ok: true, row: Row.parse(data) };
  };
  return {
    async listForOccurrences(keys) {
      if (keys.length === 0) return [];
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("occurrence_outcomes").select(COLUMNS)
        .in("series_id", [...new Set(keys.map((k) => k.seriesId))])
        .in("original_date", [...new Set(keys.map((k) => k.originalDate))]);
      if (error) throw new Error("unavailable");
      const wanted = new Set(keys.map((k) => `${k.seriesId}:${k.originalDate}`));
      return z.array(Row).parse(data ?? []).filter((r) => wanted.has(`${r.seriesId}:${r.originalDate}`));
    },
    async get(seriesId, originalDate) {
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("occurrence_outcomes").select(COLUMNS).eq("series_id", seriesId).eq("original_date", originalDate).maybeSingle();
      if (error) throw new Error("unavailable");
      return data ? Row.parse(data) : null;
    },
    claim: (input) => insert(input, { outcome: "delivered", link_source: input.linkSource, claimed_at: new Date().toISOString() }),
    async takeOver(id, seen) {
      const { db } = await ctx();
      let q = db.tracker.from("occurrence_outcomes").update({ claimed_at: new Date().toISOString() }).eq("id", id).is("notion_lesson_id", null);
      q = seen === null ? q.is("claimed_at", null) : q.eq("claimed_at", seen);
      const { data, error } = await q.select(COLUMNS);
      if (error) throw new Error("unavailable");
      const rows = z.array(Row).parse(data ?? []);
      return rows[0] ?? null;
    },
    async complete(id, lessonId, lessonDate) {
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("occurrence_outcomes")
        .update({ notion_lesson_id: lessonId, lesson_date: lessonDate, claimed_at: null }).eq("id", id).select(COLUMNS).single();
      if (error || !data) throw new Error("unavailable");
      return Row.parse(data);
    },
    insertNoShow: (input) => insert(input, { outcome: "no_show" }),
    async remove(id) {
      const { db } = await ctx();
      const { data, error } = await db.tracker.from("occurrence_outcomes").delete().eq("id", id).select("id");
      if (error) throw new Error("unavailable");
      return (data ?? []).length > 0;
    },
  };
}
