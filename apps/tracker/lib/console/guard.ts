import type { Viewer } from "../data/queries";

/** The fixed denial bodies of every console JSON route (REQ-53 AC5). Tests compare against these byte for byte. */
export const CONSOLE_DENIALS = {
  unauthenticated: { error: "unauthenticated" },
  forbidden: { error: "forbidden" },
  notConfigured: { error: "console_not_configured" },
  unavailable: { error: "console_unavailable" },
} as const;

export type OwnerViewer = Extract<Viewer, { kind: "staff" }> & { role: "owner" };
export type ConsoleDenial =
  | { ok: false; status: 401; body: typeof CONSOLE_DENIALS.unauthenticated }
  | { ok: false; status: 403; body: typeof CONSOLE_DENIALS.forbidden }
  | { ok: false; status: 503; body: typeof CONSOLE_DENIALS.notConfigured | typeof CONSOLE_DENIALS.unavailable };
export type ConsoleAllowed = { ok: true; viewer: OwnerViewer };

/**
 * The guard every console route calls first (tracker ADR 0062). Only the org
 * owner passes; it reads nothing itself, so a denial costs no database call.
 */
export function requireOwner(viewer: Viewer): ConsoleAllowed | ConsoleDenial {
  switch (viewer.kind) {
    case "not_configured":
      return { ok: false, status: 503, body: CONSOLE_DENIALS.notConfigured };
    case "signed_out":
      return { ok: false, status: 401, body: CONSOLE_DENIALS.unauthenticated };
    case "staff":
      if (viewer.role === "owner") return { ok: true, viewer: { ...viewer, role: "owner" } };
      return { ok: false, status: 403, body: CONSOLE_DENIALS.forbidden };
    default:
      return { ok: false, status: 403, body: CONSOLE_DENIALS.forbidden };
  }
}
