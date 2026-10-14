import { z } from "zod";
import { isActiveTeachingStaff } from "../domain/staff";
import type { StaffRecord } from "../notion/staff";
import { assertStaffAccess, requireScheduler, toAdminStaff, toTeacherStaff, type Denial } from "./guard";
import type { SchedulerIdentity } from "./identity";
import { MeResponse, StaffListResponse, StaffResponseAdmin, StaffResponseTeacher } from "./schemas";

/** Route logic with injected dependencies; the route files only wire the real ones. */
export type HandlerDeps = {
  identity: () => Promise<SchedulerIdentity>;
  fetchStaff: () => Promise<StaffRecord[]>;
};

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const unavailable = () => send(503, { error: "scheduler_unavailable" });

export async function handleMe(deps: HandlerDeps): Promise<Response> {
  const identity = await deps.identity();
  if (identity.scope === "none") return send(403, MeResponse.parse({ scope: "none" }));
  const gate = requireScheduler(identity, ["admin", "teacher"]);
  if (!gate.ok) return deny(gate);
  const id = gate.identity;
  if (id.scope === "teacher") return send(200, MeResponse.parse({ scope: "teacher", staff: toTeacherStaff(id.staff) }));
  return send(200, MeResponse.parse({ scope: "admin", staff: id.staff ? toAdminStaff(id.staff) : null }));
}

export async function handleStaffList(deps: HandlerDeps): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  let list: StaffRecord[];
  try {
    list = await deps.fetchStaff();
  } catch {
    return unavailable();
  }
  const staff = list.filter(isActiveTeachingStaff).map(toAdminStaff);
  return send(200, StaffListResponse.parse({ staff }));
}

export async function handleStaffById(deps: HandlerDeps, staffId: string): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin", "teacher"]);
  if (!gate.ok) return deny(gate);
  if (!z.guid().safeParse(staffId).success) return send(400, { error: "invalid_staff_id" });
  const access = assertStaffAccess(gate.identity, staffId);
  if (!access.ok) return deny(access);

  if (gate.identity.scope === "teacher") {
    return send(200, StaffResponseTeacher.parse({ staff: toTeacherStaff(gate.identity.staff) }));
  }
  let list: StaffRecord[];
  try {
    list = await deps.fetchStaff();
  } catch {
    return unavailable();
  }
  const found = list.find((s) => s.id === staffId);
  if (!found || !isActiveTeachingStaff(found)) return send(404, { error: "not_found" });
  return send(200, StaffResponseAdmin.parse({ staff: toAdminStaff(found) }));
}
