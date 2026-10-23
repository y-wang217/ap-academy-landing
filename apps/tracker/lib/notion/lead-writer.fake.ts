import { CONTRACT_FIELDS, type ContractField, type LeadPatch, type LeadSnapshot } from "../console/outcomes";
import { NotionUncertain, type FoundTouch, type LeadWriter, type NewTouch } from "./lead-writer";
import { NotionError } from "./staff";

/**
 * An in-memory Notion for the outcome writer (REQ-61): one lead page and the
 * Touches database, a request log, and fault injection. `faults` holds the
 * next failure per operation: "timeout-before" fails without applying,
 * "timeout-after" applies then fails, "500" and "400" fail without applying.
 * `queryLag` hides touches created less than that many ms ago from findTouches.
 */
export type Fault = "timeout-before" | "timeout-after" | "500" | "400";
type Op = "patch" | "create" | "read" | "find" | "getTouch";

const allPresent = () => Object.fromEntries(CONTRACT_FIELDS.map((f) => [f, true])) as Record<ContractField, boolean>;

export function fakeLeadWriter(initial: Partial<LeadSnapshot> & { id: string }, clock: () => Date = () => new Date()) {
  let tick = 0;
  const stamp = () => new Date(clock().getTime() + tick++ * 60_000).toISOString();
  const lead: LeadSnapshot = {
    stage: "Working", lostReason: null, attempts: 1, nextAction: "Call", nextActionDue: null, owner: null, lastContact: null, contactedAt: null,
    trialBookedAt: null, closedAt: null, trialTime: null, lastEditedAt: "2026-10-26T13:00:00.000Z", lastTxn: null, present: allPresent(), ...initial,
  };
  const touches: (FoundTouch & { createdAt: number; input: NewTouch })[] = [];
  const log: { op: Op; detail?: unknown }[] = [];
  const faults: Partial<Record<Op, Fault[]>> = {};
  const state = { missing: [] as string[], queryLag: 0, readBackOverride: null as Partial<LeadSnapshot> | null };

  const fault = (op: Op): Fault | undefined => faults[op]?.shift();
  const fail = (f: Fault): never => {
    if (f === "400") throw new NotionError("Notion returned 400", 400);
    if (f === "500") throw new NotionUncertain("Notion returned 500", 500);
    throw new NotionUncertain("Notion did not answer");
  };
  const run = async <T,>(op: Op, apply: () => T, detail?: unknown): Promise<T> => {
    log.push({ op, detail });
    const f = fault(op);
    if (f && f !== "timeout-after") fail(f);
    const out = apply();
    if (f === "timeout-after") fail(f);
    return out;
  };

  const writer: LeadWriter = {
    async checkReady() {
      return [...state.missing];
    },
    async readLead() {
      return run("read", () => ({ ...structuredClone(lead), ...(state.readBackOverride ?? {}) }));
    },
    async patchLead(_pageId, patch: LeadPatch, requestId) {
      return run("patch", () => {
        Object.assign(lead, patch, { lastTxn: requestId, lastEditedAt: stamp() });
      }, patch);
    },
    async findTouches(requestId) {
      return run("find", () => touches
        .filter((t) => t.txnId === requestId && clock().getTime() - t.createdAt >= state.queryLag)
        .map(({ id, studentIds, txnId }) => ({ id, studentIds, txnId })));
    },
    async createTouch(input) {
      return run("create", () => {
        const id = `99999999-9999-4999-8999-${String(touches.length + 1).padStart(12, "0")}`;
        touches.push({ id, studentIds: [input.studentId], txnId: input.requestId, createdAt: clock().getTime(), input });
        return { id };
      }, input);
    },
    async getTouch(id) {
      return run("getTouch", () => {
        const t = touches.find((x) => x.id === id);
        return t ? { id: t.id, studentIds: t.studentIds, txnId: t.txnId } : null;
      });
    },
  };

  const count = (op: Op) => log.filter((l) => l.op === op).length;
  return { writer, lead, touches, log, faults, state, count };
}
