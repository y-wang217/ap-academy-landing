import "server-only";
import { z } from "zod";
import type { LeadSource, ReadResult } from "../console/contracts";
import type { NotionConfig } from "./config";
import { pagedQuery, parseRows, prop, propertyFilter, type ReaderOptions, val } from "./paged";

/**
 * Students & Parents lead fields for the Founder Console (REQ-54, ADR 0065).
 * Read-only, through the shared pager. It asks Notion for exactly LEAD_PROPS
 * and drops everything else at the parse step: no parent contact field and no
 * private note is ever requested (Decision 4). REQ-57 (ADR 0071) adds the
 * dedupe key, Grade, Subjects and the Major Gaps and Trial Summary text, cut
 * to 1000 characters; the dedupe key never leaves the server.
 */
export const LEAD_PROPS = [
  "Student Name", "Stage", "Owner", "Next Action", "Next Action Due", "Attempts", "Last Contact", "Source", "Lost Reason",
  "Contacted At", "Trial Booked At", "Trial Attended At", "Closed At", "Trial Time", "Trial Teacher", "Level", "Major Gaps",
  "Recommended Plan", "Trial Summary", "Parent Name", "Lead ID", "Grade", "Subjects",
] as const;

const TEXT_CHARS = 1000;
const cut = (s: string | null) => (s === null ? null : s.slice(0, TEXT_CHARS));

const Page = z.object({
  id: z.guid(),
  created_time: z.string().optional(),
  // REQ-61: sent back by the outcome form as the stale check.
  last_edited_time: z.string().optional(),
  properties: z.object({
    "Student Name": prop.title,
    Stage: prop.select,
    Owner: prop.relation,
    "Next Action": prop.select,
    "Next Action Due": prop.date,
    Attempts: prop.number,
    "Last Contact": prop.date,
    Source: prop.select,
    "Lost Reason": prop.select,
    "Contacted At": prop.date,
    "Trial Booked At": prop.date,
    "Trial Attended At": prop.date,
    "Closed At": prop.date,
    "Trial Time": prop.date,
    "Trial Teacher": prop.relation,
    Level: prop.select,
    "Major Gaps": prop.text,
    "Recommended Plan": prop.select,
    "Trial Summary": prop.text,
    "Parent Name": prop.text,
    "Lead ID": prop.text,
    Grade: prop.select,
    Subjects: prop.multi,
  }),
});

function toLead(page: z.output<typeof Page>): LeadSource {
  const p = page.properties;
  return {
    id: page.id,
    createdAt: page.created_time ?? null,
    lastEditedAt: page.last_edited_time ?? null,
    name: p["Student Name"].title.trim(),
    stage: val.select(p.Stage),
    ownerStaffId: val.firstId(p.Owner),
    nextAction: val.select(p["Next Action"]),
    nextActionDue: val.date(p["Next Action Due"]),
    attempts: val.number(p.Attempts),
    lastContact: val.date(p["Last Contact"]),
    source: val.select(p.Source),
    lostReason: val.select(p["Lost Reason"]),
    contactedAt: val.date(p["Contacted At"]),
    trialBookedAt: val.date(p["Trial Booked At"]),
    trialAttendedAt: val.date(p["Trial Attended At"]),
    closedAt: val.date(p["Closed At"]),
    trialTime: val.date(p["Trial Time"]),
    trialTeacherId: val.firstId(p["Trial Teacher"]),
    level: val.select(p.Level),
    hasMajorGaps: val.present(p["Major Gaps"]),
    recommendedPlan: val.select(p["Recommended Plan"]),
    hasTrialSummary: val.present(p["Trial Summary"]),
    parentName: val.text(p["Parent Name"]),
    leadId: val.text(p["Lead ID"])?.toLowerCase() ?? null,
    grade: val.select(p.Grade),
    subjects: val.multi(p.Subjects),
    majorGaps: cut(val.text(p["Major Gaps"])),
    trialSummary: cut(val.text(p["Trial Summary"])),
  };
}

/** Every Students & Parents row, every stage, newest first. */
export async function fetchLeads(config: NotionConfig, opts: ReaderOptions): Promise<ReadResult<LeadSource>> {
  const fetcher = opts.fetcher ?? fetch;
  const filterQuery = await propertyFilter(config.token, fetcher, config.dataSourceId, LEAD_PROPS, "Leads");
  const read = await pagedQuery({
    token: config.token, fetcher, dataSourceId: config.dataSourceId, filterQuery, maxPages: opts.maxPages,
    body: { sorts: [{ timestamp: "created_time", direction: "descending" }] },
  });
  return { ...parseRows(read.rows, Page, toLead), complete: read.complete, pages: read.pages };
}
