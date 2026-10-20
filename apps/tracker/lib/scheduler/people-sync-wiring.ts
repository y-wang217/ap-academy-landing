import type { Db } from "../data/client";
import { createPeopleStore } from "../data/people";
import { readNotionConfig, readStudentsConfig } from "../notion/config";
import { fetchStaffForSync } from "../notion/staff";
import { fetchStudentPeople } from "../notion/students";
import { runPeopleSync, type PeopleSyncDeps, type SyncTrigger } from "./people-sync";

/**
 * The real people sync for one org: the two Notion readers bound to their
 * configs, and tracker.apply_people_sync on the given client (the owner's own
 * for Sync now, the service client for the hourly run). The only file outside
 * lib/notion/ that reaches the Notion people readers (AC9). Null when Notion
 * is not configured.
 */
export function peopleSyncDeps(tracker: Db["tracker"], orgId: string): PeopleSyncDeps | null {
  const staffConfig = readNotionConfig();
  const studentsConfig = readStudentsConfig();
  if (!staffConfig || !studentsConfig) return null;
  const store = createPeopleStore(tracker, orgId);
  return {
    readStaff: () => fetchStaffForSync(staffConfig),
    readStudents: () => fetchStudentPeople(studentsConfig),
    apply: store.apply,
    now: () => new Date(),
  };
}

/** Runs one sync, or says the people sync is not configured. */
export async function syncPeopleFor(tracker: Db["tracker"], orgId: string, trigger: SyncTrigger): Promise<"ok" | "failed" | "not_configured"> {
  const deps = peopleSyncDeps(tracker, orgId);
  if (!deps) return "not_configured";
  return (await runPeopleSync(deps, trigger)).result;
}
