import type { StaffRecord } from "../notion/staff";
import type { SchedulerIdentity } from "./identity";
import { StaffPublicAdmin, StaffPublicTeacher } from "./schemas";

export type { SchedulerIdentity } from "./identity";

export type Denial =
  | { ok: false; status: 401; body: { error: "unauthenticated" } }
  | { ok: false; status: 403; body: { error: "forbidden" } }
  | { ok: false; status: 503; body: { error: "scheduler_not_configured" | "scheduler_unavailable" } };
export type Allowed = { ok: true; identity: Extract<SchedulerIdentity, { scope: "admin" | "teacher" }> };

/**
 * The guard every scheduling endpoint calls first. Returns the identity when
 * its scope is allowed, else a typed denial the handler sends as is.
 */
export function requireScheduler(identity: SchedulerIdentity, scopes: ("admin" | "teacher")[]): Allowed | Denial {
  switch (identity.scope) {
    case "unconfigured":
      return { ok: false, status: 503, body: { error: "scheduler_not_configured" } };
    case "unavailable":
      return { ok: false, status: 503, body: { error: "scheduler_unavailable" } };
    case "signed_out":
      return { ok: false, status: 401, body: { error: "unauthenticated" } };
    case "none":
      return { ok: false, status: 403, body: { error: "forbidden" } };
    default:
      return scopes.includes(identity.scope)
        ? { ok: true, identity }
        : { ok: false, status: 403, body: { error: "forbidden" } };
  }
}

/** Admin: any staff ID. Teacher: only their own. */
export function assertStaffAccess(
  identity: Allowed["identity"],
  staffId: string,
): { ok: true } | { ok: false; status: 403; body: { error: "forbidden" } } {
  if (identity.scope === "admin") return { ok: true };
  if (identity.staff.id === staffId) return { ok: true };
  return { ok: false, status: 403, body: { error: "forbidden" } };
}

/** The only two ways to serialise a staff record. They pick fields explicitly. */
export function toTeacherStaff(s: StaffRecord) {
  return StaffPublicTeacher.parse({ id: s.id, name: s.name, subjects: s.subjects });
}
export function toAdminStaff(s: StaffRecord) {
  return StaffPublicAdmin.parse({ id: s.id, name: s.name, subjects: s.subjects, email: s.email });
}
