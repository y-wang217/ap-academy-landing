import { isActiveTeachingStaff } from "../domain/staff";
import type { StaffRecord } from "../notion/staff";

/**
 * Who is calling the scheduler. Admin is the tracker org owner; teacher is a
 * login linked (by Charlie's approval) to an active teaching Staff record.
 * Dependencies are injected so this runs under Vitest with no Supabase or
 * Notion. Fails closed: if Notion can't be read, a teacher gets "unavailable",
 * never a widened or a denied-by-guess scope.
 */
export type SchedulerIdentity =
  | { scope: "admin"; orgId: string; staff: StaffRecord | null }
  | { scope: "teacher"; orgId: string; staff: StaffRecord }
  | { scope: "none" }
  | { scope: "signed_out" }
  | { scope: "unconfigured" }
  | { scope: "unavailable" };

export type IdentityDeps = {
  configured: boolean;
  getUser: () => Promise<{ id: string; email: string } | null>;
  /** tracker.claim_staff_link(): links this login to an approved row. */
  claimLink: () => Promise<void>;
  /** The org the caller owns, or null. */
  isOwnerOf: () => Promise<string | null>;
  /** The caller's own live link, or null. */
  getLink: () => Promise<{ orgId: string; notionStaffId: string } | null>;
  fetchStaff: () => Promise<StaffRecord[]>;
};

export async function resolveSchedulerIdentity(deps: IdentityDeps): Promise<SchedulerIdentity> {
  if (!deps.configured) return { scope: "unconfigured" };
  const user = await deps.getUser();
  if (!user) return { scope: "signed_out" };

  try {
    await deps.claimLink();
  } catch {
    // A failed claim only means no link yet; the reads below decide.
  }

  const [ownerOrg, link] = await Promise.all([deps.isOwnerOf(), deps.getLink()]);

  if (ownerOrg) {
    let staff: StaffRecord | null = null;
    if (link) {
      try {
        staff = (await deps.fetchStaff()).find((s) => s.id === link.notionStaffId) ?? null;
      } catch {
        staff = null;
      }
    }
    return { scope: "admin", orgId: ownerOrg, staff };
  }

  if (!link) return { scope: "none" };
  let list: StaffRecord[];
  try {
    list = await deps.fetchStaff();
  } catch {
    return { scope: "unavailable" };
  }
  const staff = list.find((s) => s.id === link.notionStaffId);
  if (!staff || !isActiveTeachingStaff(staff)) return { scope: "none" };
  return { scope: "teacher", orgId: link.orgId, staff };
}
