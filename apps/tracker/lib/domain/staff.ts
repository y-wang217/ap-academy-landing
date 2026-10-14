/**
 * Who counts as active teaching staff. Pure: no Next, Supabase or Notion
 * imports. "Active teaching" comes from Status + Function, never Role (Role is
 * seniority). Anything unknown or missing counts as not active, so a renamed
 * option in Notion fails closed instead of widening access.
 */
export const ACTIVE_STATUSES = ["Active", "Onboarding"] as const;
export const TEACHING_FUNCTIONS = ["Teacher", "Trial Teacher"] as const;

export function isActiveTeachingStaff(staff: { status: string | null; functions: readonly string[] }): boolean {
  if (!staff.status || !(ACTIVE_STATUSES as readonly string[]).includes(staff.status)) return false;
  return staff.functions.some((f) => (TEACHING_FUNCTIONS as readonly string[]).includes(f));
}
