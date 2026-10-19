import { addDays } from "./schedule/wallclock";

/**
 * Setup checklist for the org owner (REQ-33): what is still missing before teachers are
 * invited. Pure: no React, Next, Supabase or Notion imports. The loader
 * (lib/data/setup.ts) turns reads into counts; this decides each row's state.
 * A failed read is its own state, never a zero.
 */
export const ROW_ORDER = ["teachers", "availability", "schedules", "parents", "notionRecords", "dailyTask", "guard"] as const;
export type RowKey = (typeof ROW_ORDER)[number];
export type SetupState = "done" | "partial" | "missing" | "unknown";
export type Failure = { failed: "notion" | "db" };
export type NamedStudent = { id: string; name: string };
export type DailyTaskCheck = { name: "notion_token" | "cron_secret" | "org_id"; problem: "not_set" | "other_org" };

export type Facts = {
  teachers: { linked: number; total: number; signedIn: number; missing: string[] };
  availability: { entered: number; linked: number };
  schedules: { adopted: number; scheduled: number; failedSync: number };
  parents: { students: number; claimed: number; invitedOnly: number; anyLink: boolean; missing: NamedStudent[] };
  notionRecords: { students: number; linked: number; missing: NamedStudent[] };
  dailyTask: { missingConfig: DailyTaskCheck[]; readyDates: string[] };
  guard: { ok: boolean };
};
export type SetupInput = { [K in RowKey]: Facts[K] | Failure };
export type SetupRow = { [K in RowKey]: { key: K; state: SetupState; failed: Failure["failed"] | null; facts: Facts[K] | null } }[RowKey];

const isFailure = (v: object): v is Failure => "failed" in v;

/** Missing when nothing is done or there is nothing to do, Done when all is done, Partial otherwise. */
function countState(done: number, of: number): SetupState {
  if (done === 0 || of === 0) return "missing";
  return done >= of ? "done" : "partial";
}

const decide: { [K in RowKey]: (f: Facts[K], today: string) => SetupState } = {
  teachers: (f) => countState(f.linked, f.total),
  availability: (f) => countState(f.entered, f.linked),
  schedules: (f) => {
    const s = countState(f.adopted, f.scheduled);
    return s === "done" && f.failedSync > 0 ? "partial" : s;
  },
  parents: (f) => {
    if (f.students === 0 || !f.anyLink) return "missing";
    return f.claimed >= f.students ? "done" : "partial";
  },
  notionRecords: (f) => countState(f.linked, f.students),
  dailyTask: (f, today) => {
    if (f.missingConfig.length > 0) return "missing";
    const recent = [today, addDays(today, -1)];
    return f.readyDates.some((d) => recent.includes(d)) ? "done" : "partial";
  },
  guard: (f) => (f.ok ? "done" : "missing"),
};

function row<K extends RowKey>(key: K, value: Facts[K] | Failure, today: string): SetupRow {
  if (isFailure(value)) return { key, state: "unknown", failed: value.failed, facts: null } as SetupRow;
  return { key, state: decide[key](value, today), failed: null, facts: value } as SetupRow;
}

/** `today` is the America/Toronto date (todayIso), computed once per request by the page. */
export function buildSetupStatus(input: SetupInput, today: string): SetupRow[] {
  return ROW_ORDER.map((key) => row(key, input[key], today));
}

/** Which daily task settings are not in place. Never carries a value. */
export function dailyTaskConfig(env: { workConfigured: boolean; cronSecretSet: boolean; orgIdEnv: string | undefined }, orgId: string): DailyTaskCheck[] {
  const out: DailyTaskCheck[] = [];
  if (!env.workConfigured) out.push({ name: "notion_token", problem: "not_set" });
  if (!env.cronSecretSet) out.push({ name: "cron_secret", problem: "not_set" });
  if (!env.orgIdEnv) out.push({ name: "org_id", problem: "not_set" });
  else if (env.orgIdEnv !== orgId) out.push({ name: "org_id", problem: "other_org" });
  return out;
}
