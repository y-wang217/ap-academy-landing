import { unstable_cache } from "next/cache";
import { createBillingReader, schemaLookup, type BillingReader } from "./billing";
import { readBillingConfig, readNotionConfig, readStudentsConfig } from "./config";
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

/**
 * Property name to ID for one billing data source (REQ-25), cached five minutes.
 * Schema only, no row data; billing rows themselves are never cached (ADR 0049).
 */
const cachedBillingPropertyIds = unstable_cache(
  async (dataSourceId: string): Promise<Record<string, string>> => {
    const config = readBillingConfig();
    if (!config) throw new NotionError("Notion is not configured");
    return schemaLookup(config)(dataSourceId);
  },
  ["notion-billing-property-ids"],
  { revalidate: 300, tags: ["notion-billing-property-ids"] },
);

export function getBillingPropertyIds(dataSourceId: string): Promise<Record<string, string>> {
  return cachedBillingPropertyIds(dataSourceId);
}

/** The billing reads for one request, or null without NOTION_TOKEN (the tab then says Billing not available yet). */
export function getBillingReader(): BillingReader | null {
  const config = readBillingConfig();
  return config ? createBillingReader(config, { lookup: getBillingPropertyIds }) : null;
}
