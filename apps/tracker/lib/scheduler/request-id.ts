import { createHash } from "node:crypto";

/**
 * A stable UUID for an import line: SHA-1 over the org and the planner's seed,
 * shaped as a version-5 UUID. The same line always gets the same request_id,
 * so a rerun or a retry after a timeout inserts nothing new.
 */
export function importRequestId(orgId: string, seed: string): string {
  const h = createHash("sha1").update(`${orgId}:${seed}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
