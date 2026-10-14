import { unstable_cache } from "next/cache";
import { readNotionConfig, readStudentsConfig } from "./config";
import { fetchStudentNames } from "./students";
import { fetchStaff, NotionError, type StaffRecord } from "./staff";

/** Staff list, cached five minutes so a page load does not hit Notion. */
const cachedStaff = unstable_cache(
  async (): Promise<StaffRecord[]> => {
    const config = readNotionConfig();
    if (!config) throw new NotionError("Notion is not configured");
    return fetchStaff(config);
  },
  ["notion-staff"],
  { revalidate: 300, tags: ["notion-staff"] },
);

export function getStaffList(): Promise<StaffRecord[]> {
  return cachedStaff();
}

/** Student names for the calendar, cached five minutes. Names only, never Weekly Schedule text. [id, name][] so the cache holds plain data. */
const cachedStudentNames = unstable_cache(
  async (): Promise<[string, string][]> => {
    const config = readStudentsConfig();
    if (!config) throw new NotionError("Notion is not configured");
    return [...(await fetchStudentNames(config))];
  },
  ["notion-student-names"],
  { revalidate: 300, tags: ["notion-student-names"] },
);

export function getStudentNames(): Promise<[string, string][]> {
  return cachedStudentNames();
}
