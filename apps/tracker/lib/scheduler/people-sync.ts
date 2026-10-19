/**
 * The people sync (REQ-38, workspace ADR 0004): read Staff and Students &
 * Parents from Notion, then hand what was read to tracker.apply_people_sync,
 * which upserts by Notion id, archives missing rows and records the run in one
 * transaction. Pure: no Next, Supabase or Notion imports, so it runs under
 * Vitest with fakes. A Notion failure is passed on as a short reason, never
 * the response body, and the RPC then keeps every existing row.
 */
export const ACTIVE_STAGES: readonly string[] = ["Active", "Onboarding"];

export type SyncTrigger = "schedule" | "owner";
export type SyncCounts = { staffUpserted: number; staffArchived: number; studentsUpserted: number; studentsArchived: number };
export type SyncRun = { id: string; result: "ok" | "failed"; startedAt: string; finishedAt: string; error: string | null } & SyncCounts;

export type ApplyInput = {
  trigger: SyncTrigger;
  startedAt: string;
  staff: { id: string; name: string; subjects: string[]; active: boolean }[] | null;
  students: { id: string; name: string; stage: string; active: boolean }[] | null;
  error: string | null;
};

export type PeopleSyncDeps = {
  readStaff: () => Promise<{ id: string; name: string; subjects: string[]; active: boolean }[]>;
  readStudents: () => Promise<{ id: string; name: string; stage: string }[]>;
  apply: (input: ApplyInput) => Promise<SyncRun>;
  now: () => Date;
};

export type PeopleSyncResult = { result: "ok" | "failed"; counts: SyncCounts };

const ZERO: SyncCounts = { staffUpserted: 0, staffArchived: 0, studentsUpserted: 0, studentsArchived: 0 };

/** A short reason for the run row. Network errors, 429 and 5xx are "unavailable"; anything else is "unexpected". */
export function syncErrorReason(err: unknown): "notion_unavailable" | "notion_unexpected" {
  if (err instanceof Error && err.name === "NotionError") {
    const status = (err as Error & { status?: number }).status;
    if (status === undefined) return err.message === "Notion request failed" ? "notion_unavailable" : "notion_unexpected";
    if (status === 429 || status >= 500) return "notion_unavailable";
  }
  return "notion_unexpected";
}

export async function runPeopleSync(deps: PeopleSyncDeps, trigger: SyncTrigger): Promise<PeopleSyncResult> {
  const startedAt = deps.now().toISOString();
  let input: ApplyInput;
  try {
    const [staff, students] = await Promise.all([deps.readStaff(), deps.readStudents()]);
    input = {
      trigger,
      startedAt,
      staff: staff
        .map((s) => ({ id: s.id, name: s.name.trim(), subjects: s.subjects, active: s.active }))
        .filter((s) => s.name.length > 0),
      students: students
        .map((s) => ({ id: s.id, name: s.name.trim(), stage: s.stage, active: ACTIVE_STAGES.includes(s.stage) }))
        .filter((s) => s.name.length > 0),
      error: null,
    };
  } catch (err) {
    input = { trigger, startedAt, staff: null, students: null, error: syncErrorReason(err) };
  }
  try {
    const run = await deps.apply(input);
    const { staffUpserted, staffArchived, studentsUpserted, studentsArchived } = run;
    return { result: run.result, counts: { staffUpserted, staffArchived, studentsUpserted, studentsArchived } };
  } catch {
    return { result: "failed", counts: ZERO };
  }
}
