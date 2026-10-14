import { unstable_cache } from "next/cache";
import { readNotionConfig } from "./config";
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
