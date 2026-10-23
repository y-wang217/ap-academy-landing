import { z } from "zod";
import type { Db } from "../data/client";
import { OUTCOMES, type LeadPatch, type Outcome } from "./outcomes";

/**
 * The console transition log (REQ-61, migration 0029, tracker ADR 0076) over
 * the owner's own client: RLS decides, no service role. Every row is parsed
 * with Zod (ADR 0017). Reads and writes throw on a query error, so a failed
 * read never looks like "no transition yet". The note is never stored: only
 * its length and SHA-256, inside `touch`.
 */
export type TransitionState = "running" | "done" | "failed" | "uncertain";
/** The Touch to create, and the form values that, with the note's hash, identify the request on a retry. Never the note. */
export type TouchRecord = {
  type: string; outcome: string; title: string; staffId: string | null; noteChars: number; noteSha256: string; formNextAction: string | null; formDue: string | null;
};
export type Expected = { stage: string | null; attempts: number | null; lastEditedAt: string };
export type OutcomeResult = { stage: string | null; nextAction: string | null; nextActionDue: string | null; attempts: number | null; touchId: string; readBackAt: string };

export type Transition = {
  requestId: string; pageId: string; outcome: Outcome; patch: LeadPatch; touch: TouchRecord; expected: Expected; state: TransitionState;
  attempts: number; leaseUntil: string | null; patchSentAt: string | null; patchVerifiedAt: string | null; touchSentAt: string | null;
  touchPageId: string | null; result: OutcomeResult | null; lastError: string | null; createdAt: string;
};
export type NewTransition = Pick<Transition, "requestId" | "pageId" | "outcome" | "patch" | "touch" | "expected"> & { leaseSeconds: number };
export type TransitionMarks = Partial<Pick<Transition, "patchSentAt" | "patchVerifiedAt" | "touchSentAt" | "touchPageId">>;
export type InsertResult = { ok: true; row: Transition } | { ok: false; conflict: "request_id" } | { ok: false; conflict: "open"; openRequestId: string | null };

export interface OutcomeStore {
  get(requestId: string): Promise<Transition | null>;
  /** The page's running or uncertain transition, if any. */
  openFor(pageId: string): Promise<Transition | null>;
  insert(row: NewTransition): Promise<InsertResult>;
  /** Takes an uncertain row, or a running one whose lease ran out; null when it is not claimable. */
  claim(requestId: string, leaseSeconds: number): Promise<Transition | null>;
  mark(requestId: string, marks: TransitionMarks): Promise<void>;
  finish(requestId: string, state: Exclude<TransitionState, "running">, result: OutcomeResult | null, error: string | null): Promise<void>;
}

const uuid = z.guid();
const str = z.string().nullable();
const COLUMNS = "request_id, notion_page_id, outcome, patch, touch, expected, state, attempts, lease_until, patch_sent_at, patch_verified_at, touch_sent_at, touch_page_id, result, last_error, created_at";
const Touch = z.object({
  type: z.string(), outcome: z.string(), title: z.string(), staff_id: uuid.nullable(), note_chars: z.number(), note_sha256: z.string(),
  form_next_action: str.default(null), form_due: str.default(null),
});
const Result = z.object({ stage: str, next_action: str, next_action_due: str, attempts: z.number().nullable(), touch_id: uuid, read_back_at: z.string() });
const Row = z.object({
  request_id: uuid, notion_page_id: uuid, outcome: z.enum(OUTCOMES), patch: z.record(z.string(), z.unknown()), touch: Touch,
  expected: z.object({ stage: str, attempts: z.number().nullable(), last_edited_at: z.string() }),
  state: z.enum(["running", "done", "failed", "uncertain"]), attempts: z.number(), lease_until: str, patch_sent_at: str, patch_verified_at: str,
  touch_sent_at: str, touch_page_id: uuid.nullable(), result: Result.nullable(), last_error: str, created_at: z.string(),
}).transform((r): Transition => ({
  requestId: r.request_id, pageId: r.notion_page_id, outcome: r.outcome, patch: r.patch as LeadPatch,
  touch: {
    type: r.touch.type, outcome: r.touch.outcome, title: r.touch.title, staffId: r.touch.staff_id, noteChars: r.touch.note_chars, noteSha256: r.touch.note_sha256,
    formNextAction: r.touch.form_next_action, formDue: r.touch.form_due,
  },
  expected: { stage: r.expected.stage, attempts: r.expected.attempts, lastEditedAt: r.expected.last_edited_at }, state: r.state, attempts: r.attempts,
  leaseUntil: r.lease_until, patchSentAt: r.patch_sent_at, patchVerifiedAt: r.patch_verified_at, touchSentAt: r.touch_sent_at, touchPageId: r.touch_page_id,
  result: r.result && {
    stage: r.result.stage, nextAction: r.result.next_action, nextActionDue: r.result.next_action_due, attempts: r.result.attempts, touchId: r.result.touch_id, readBackAt: r.result.read_back_at,
  },
  lastError: r.last_error, createdAt: r.created_at,
}));

const unavailable = () => new Error("unavailable");
const one = (data: unknown) => (data === null || data === undefined ? null : Row.parse(data));
const MARK_COLUMNS = { patchSentAt: "patch_sent_at", patchVerifiedAt: "patch_verified_at", touchSentAt: "touch_sent_at", touchPageId: "touch_page_id" } as const;

export function createOutcomeStore(tracker: Db["tracker"], orgId: string): OutcomeStore {
  const table = () => tracker.from("console_transitions");
  const store: OutcomeStore = {
    async get(requestId) {
      const { data, error } = await table().select(COLUMNS).eq("request_id", requestId).maybeSingle();
      if (error) throw unavailable();
      return one(data);
    },
    async openFor(pageId) {
      const { data, error } = await table().select(COLUMNS).eq("org_id", orgId).eq("notion_page_id", pageId).in("state", ["running", "uncertain"]).maybeSingle();
      if (error) throw unavailable();
      return one(data);
    },
    async insert(row) {
      const { data, error } = await table().insert({
        org_id: orgId, request_id: row.requestId, notion_page_id: row.pageId, outcome: row.outcome, patch: row.patch,
        touch: {
          type: row.touch.type, outcome: row.touch.outcome, title: row.touch.title, staff_id: row.touch.staffId, note_chars: row.touch.noteChars,
          note_sha256: row.touch.noteSha256, form_next_action: row.touch.formNextAction, form_due: row.touch.formDue,
        },
        expected: { stage: row.expected.stage, attempts: row.expected.attempts, last_edited_at: row.expected.lastEditedAt },
        lease_until: new Date(Date.now() + row.leaseSeconds * 1000).toISOString(),
      }).select(COLUMNS).single();
      if (error?.code === "23505") {
        if ((error.message ?? "").includes("request_id")) return { ok: false, conflict: "request_id" };
        const open = await store.openFor(row.pageId);
        return { ok: false, conflict: "open", openRequestId: open?.requestId ?? null };
      }
      if (error) throw unavailable();
      return { ok: true, row: Row.parse(data) };
    },
    async claim(requestId, leaseSeconds) {
      const { data, error } = await tracker.rpc("claim_console_transition", { p_request_id: requestId, p_lease_seconds: leaseSeconds });
      if (error) throw unavailable();
      const rows = z.array(Row).parse(data ?? []);
      return rows[0] ?? null;
    },
    async mark(requestId, marks) {
      const update = Object.fromEntries(Object.entries(marks).map(([k, v]) => [MARK_COLUMNS[k as keyof TransitionMarks], v]));
      const { error } = await table().update(update).eq("request_id", requestId);
      if (error) throw unavailable();
    },
    async finish(requestId, state, result, lastError) {
      const { error } = await table().update({
        state, lease_until: null, finished_at: state === "uncertain" ? null : new Date().toISOString(),
        result: result && {
          stage: result.stage, next_action: result.nextAction, next_action_due: result.nextActionDue, attempts: result.attempts, touch_id: result.touchId, read_back_at: result.readBackAt,
        },
        last_error: lastError === null ? null : lastError.slice(0, 300),
      }).eq("request_id", requestId);
      if (error) throw unavailable();
    },
  };
  return store;
}
