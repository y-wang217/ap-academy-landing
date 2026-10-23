import { z } from "zod";
import type { OutcomeBodyInput } from "./outcome-schema";
import type { Outcome } from "./outcomes";
import type { SalesLead } from "./sales-view";

/**
 * The outcome form's client logic (REQ-61, tracker ADR 0076), pure so it is
 * tested in node: the request body from the form, and what each answer of
 * POST /api/console/outcomes means on screen. The note stays in the form
 * until a done answer; an uncertain answer is retried with the same body.
 */
export type FormStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done"; cadenceUsedUp: boolean; staffLinked: boolean }
  | { kind: "stale" }
  | { kind: "refused"; message: string; missing: string[]; notionUrl: string | null }
  | { kind: "uncertain"; message: string; retryAfterSeconds: number | null }
  | { kind: "failed"; message: string }
  | { kind: "not_ready" }
  | { kind: "blocked"; message: string };

export type FormInput = { outcome: Outcome; note: string; nextAction: string; due: string };

export const FORM_TEXT = {
  saving: "Saving to Notion...",
  done: "Logged. Next lead.",
  cadence: "Cadence used up. Send the final approved text from your phone.",
  noStaff: "Logged without Staff: your login has no staff link.",
  stale: "This lead changed in Notion since the queue loaded. Refresh, then log again.",
  notReady: "Add the Txn ID and Last Txn properties in Notion before logging outcomes.",
  noEdited: "Refresh the queue before logging an outcome for this lead.",
  contract: "Fill these in Notion first:",
  inProgress: "This outcome is still saving. Wait a moment, then Retry.",
  reused: "This save was already used for a different outcome. Start over.",
  unresolved: "An earlier outcome for this lead is not confirmed yet. Check the lead in Notion; the console logs no other outcome for it until that one is resolved.",
  network: "The console could not reach the server. Retry to check and finish the save.",
} as const;

/** The body to send, or null when the lead has no last_edited_time to check against. */
export function outcomeBody(lead: SalesLead, input: FormInput, requestId: string): OutcomeBodyInput | null {
  if (!lead.lastEditedAt) return null;
  const withTime = input.outcome === "call_back" || input.outcome === "follow_up";
  const due = withTime && input.due ? new Date(input.due) : null;
  return {
    requestId,
    pageId: lead.id,
    outcome: input.outcome,
    expected: { stage: lead.stage === "" ? null : lead.stage, attempts: lead.attempts, lastEditedAt: lead.lastEditedAt },
    note: input.note,
    ...(input.outcome === "follow_up" && input.nextAction ? { nextAction: input.nextAction as OutcomeBodyInput["nextAction"] } : {}),
    ...(due && !Number.isNaN(due.getTime()) ? { due: due.toISOString() } : {}),
  };
}

const Answer = z.object({
  status: z.string().optional(), error: z.string().optional(), message: z.string().optional(), missing: z.array(z.string()).optional(),
  notionUrl: z.string().optional(), retryAfterSeconds: z.number().nullable().optional(), cadenceUsedUp: z.boolean().optional(), staffLinked: z.boolean().optional(),
});

/** What an answer means for the form. Anything unexpected is uncertain: the save may have landed. */
export function statusOf(httpStatus: number, raw: unknown): FormStatus {
  const a = Answer.safeParse(raw);
  const body = a.success ? a.data : {};
  if (httpStatus === 200 && body.status === "done") return { kind: "done", cadenceUsedUp: body.cadenceUsedUp === true, staffLinked: body.staffLinked !== false };
  switch (body.error) {
    case "uncertain":
      return { kind: "uncertain", message: body.message ?? FORM_TEXT.network, retryAfterSeconds: body.retryAfterSeconds ?? null };
    case "stale":
      return { kind: "stale" };
    case "contract_missing":
      return { kind: "refused", message: FORM_TEXT.contract, missing: body.missing ?? [], notionUrl: body.notionUrl ?? null };
    case "disallowed":
    case "bad_form":
      return { kind: "refused", message: body.message ?? "Not allowed.", missing: [], notionUrl: body.notionUrl ?? null };
    case "failed":
      return { kind: "failed", message: body.message ?? "Notion refused the save." };
    case "notion_not_ready":
      return { kind: "not_ready" };
    case "in_progress":
      return { kind: "uncertain", message: FORM_TEXT.inProgress, retryAfterSeconds: null };
    case "unresolved_transition":
      return { kind: "blocked", message: FORM_TEXT.unresolved };
    case "request_id_reused":
      return { kind: "failed", message: FORM_TEXT.reused };
    case "bad_request":
      return { kind: "failed", message: "The form sent something the server could not read. Start over." };
    default:
      return { kind: "uncertain", message: FORM_TEXT.network, retryAfterSeconds: null };
  }
}

/** Inputs lock while a save is in flight or unconfirmed, so a Retry resends exactly what was sent. */
export const locked = (s: FormStatus) => s.kind === "saving" || s.kind === "uncertain";
