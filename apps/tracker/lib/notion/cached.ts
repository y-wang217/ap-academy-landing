import { unstable_cache } from "next/cache";
import { createBillingReader, schemaLookup, type BillingReader } from "./billing";
import { readBillingConfig } from "./config";
import { NotionError } from "./staff";

// Staff and student names are no longer read here: they come from the local
// people copy (REQ-38, workspace ADR 0004). Only billing schema stays cached.

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
