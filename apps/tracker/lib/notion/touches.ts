import "server-only";
import { z } from "zod";
import type { ReadResult, TouchSource } from "../console/contracts";
import { normalId } from "../domain/billing";
import type { NotionConfig } from "./config";
import { pagedQuery, parseRows, prop, propertyFilter, type ReaderOptions, val } from "./paged";

/**
 * Touches for the Founder Console (REQ-54, ADR 0065): the call and text log
 * written through the "Log a Touch" form. Read-only, through the shared pager.
 * The title is never requested; the Note is cut to 280 characters here.
 */
export const TOUCH_PROPS = ["Type", "Outcome", "Student", "Staff", "Note", "When"] as const;
const NOTE_CHARS = 280;

const Page = z.object({
  id: z.guid(),
  properties: z.object({
    Type: prop.select,
    Outcome: prop.select,
    Student: prop.relation,
    Staff: prop.relation,
    Note: prop.text,
    When: prop.created,
  }),
});

const toTouch = (page: z.output<typeof Page>): TouchSource => ({
  id: page.id,
  when: page.properties.When?.created_time ?? null,
  type: val.select(page.properties.Type),
  outcome: val.select(page.properties.Outcome),
  studentId: val.firstId(page.properties.Student),
  staffId: val.firstId(page.properties.Staff),
  note: (val.text(page.properties.Note) ?? "").slice(0, NOTE_CHARS),
});

/** Touches created on or after `since` (YYYY-MM-DD), newest first. */
export async function fetchRecentTouches(config: NotionConfig, opts: ReaderOptions & { since: string }): Promise<ReadResult<TouchSource>> {
  const fetcher = opts.fetcher ?? fetch;
  const filterQuery = await propertyFilter(config.token, fetcher, config.dataSourceId, TOUCH_PROPS, "Touches");
  const read = await pagedQuery({
    token: config.token, fetcher, dataSourceId: config.dataSourceId, filterQuery, maxPages: opts.maxPages,
    body: {
      filter: { timestamp: "created_time", created_time: { on_or_after: opts.since } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
    },
  });
  return { ...parseRows(read.rows, Page, toTouch), complete: read.complete, pages: read.pages };
}

/** The newest `n` touches of each student, keyed by page id. A touch with no student is dropped. Newest first. */
export function lastTouchesByStudent(rows: TouchSource[], n: number): TouchSource[] {
  const sorted = [...rows].sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""));
  const kept = new Map<string, number>();
  return sorted.filter((t) => {
    if (!t.studentId) return false;
    const key = normalId(t.studentId);
    const seen = kept.get(key) ?? 0;
    kept.set(key, seen + 1);
    return seen < n;
  });
}
