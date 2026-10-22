import type { ClassPurpose, Occurrence } from "../schedule/recurrence";

/**
 * The charge rules of the structured billing input (REQ-40, tracker ADR 0060).
 * Pure: no React, Next, Supabase, Notion or clock. This records whether a
 * class is chargeable; it never computes an amount or writes an invoice.
 * Changing a rule bumps BILLING_RULES_VERSION (docs/billing-input.md).
 */
export const BILLING_RULES_VERSION = 1;

export type ChargeStateName = "chargeable" | "credit_owed" | "made_up" | "forfeit_pending" | "not_charged";
export type ChargeInput = {
  status: Occurrence["status"];
  kind: Occurrence["kind"];
  purpose: ClassPurpose | null;
  /** The class has ended. */
  past: boolean;
  outcome: "delivered" | "no_show" | "none";
  /** A delivered claim with no Lessons page yet (the log is in flight or stale). */
  outcomePending: boolean;
  /** For a cancelled class: the makeup that replaces it. Always "none" otherwise. */
  makeup: "none" | "linked" | "delivered";
};
export type ChargeResult = { state: ChargeStateName; unconfirmed: boolean };

/** The rules table of the design, first match wins. */
export function chargeState(i: ChargeInput): ChargeResult {
  if (i.status === "cancelled") return { state: i.makeup === "delivered" ? "not_charged" : "credit_owed", unconfirmed: false };
  if (i.outcome === "no_show") return { state: "forfeit_pending", unconfirmed: false };
  if (i.purpose === "makeup") {
    return i.outcome === "delivered" ? { state: "made_up", unconfirmed: i.outcomePending } : { state: "not_charged", unconfirmed: i.past };
  }
  if (i.outcome === "delivered") return { state: "chargeable", unconfirmed: i.outcomePending };
  return i.past ? { state: "chargeable", unconfirmed: true } : { state: "not_charged", unconfirmed: false };
}
