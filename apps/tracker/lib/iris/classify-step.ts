import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { ClassifyPort } from "./classify";
import { buildClassifyPrompt } from "./classify-prompt";
import { shortError } from "./intake";
import { POLICY_VERSION } from "./policy";
import { stripQuoted } from "./quote";
import { routeClassification, type Child } from "./route";
import type { ClassifiableMessage, IrisSettings, IrisStore } from "./store";

/**
 * The second half of rung 1 (REQ-43, tracker ADR 0061): each matched message
 * is classified once by Claude and routed by route.ts. Every call writes one
 * ai_calls row with tokens only; the message keeps intent, confidence, flags
 * and the reason; the event keeps ids and codes. The model's one-line gist and the
 * prompt stay in memory. Every port is injected, and it never throws.
 */
export type ClassifyStepDeps = {
  store: IrisStore;
  /** Null when ANTHROPIC_API_KEY is unset: nothing is read and no call is made. */
  classify: ClassifyPort | null;
  /** The run's memoised Students & Parents read, shared with intake. */
  directory: () => Promise<FamilyEntry[]>;
  settings: IrisSettings;
  now: () => Date;
  startedAtMs: number;
  signal?: AbortSignal;
};

export type ClassifyOutcome = { result: "ok" | "failed"; classified: number; escalated: number; failed: number; error: string | null };

const CONCURRENCY = 3;
const HISTORY_LINES = 5;
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const lastWords = (s: string) => s.trim().split(/\s+/).slice(1);

export async function runClassify(deps: ClassifyStepDeps): Promise<ClassifyOutcome> {
  const out: ClassifyOutcome = { result: "ok", classified: 0, escalated: 0, failed: 0, error: null };
  const { store, classify } = deps;
  if (!classify) return out;
  const at = () => deps.now().toISOString();
  const outOfTime = () => deps.now().getTime() - deps.startedAtMs >= TUNING.irisClassifyBudgetMs;

  let queue: ClassifiableMessage[];
  try {
    queue = await store.listClassifiable(TUNING.irisMaxRetries, TUNING.irisMaxClassifyPerRun);
  } catch {
    return { ...out, result: "failed", error: "Iris run failed" };
  }
  if (queue.length === 0 || outOfTime()) return out;

  // The family directory: a failure leaves every message at matched, with no retry spent.
  const byStudent = new Map<string, FamilyEntry>();
  try {
    for (const e of await deps.directory()) byStudent.set(e.studentId, e);
  } catch (e) {
    return { ...out, error: shortError(e, "Could not read the family directory") };
  }

  const one = async (m: ClassifiableMessage) => {
    const ctx = await store.threadContext(m.threadId, m.receivedAt, HISTORY_LINES);
    const family = ctx.studentIds.map((id) => byStudent.get(id)).filter((e): e is FamilyEntry => e !== undefined);
    const children: Child[] = family.map((e) => ({ studentId: e.studentId, firstName: firstWord(e.studentName) }));
    const parent = family[0]?.parentName ?? "";
    const text = stripQuoted(m.bodyText ?? "");
    const prompt = buildClassifyPrompt({
      parentFirstName: firstWord(parent) || null,
      childFirstNames: children.map((c) => c.firstName),
      surnames: [...lastWords(parent), ...family.flatMap((e) => lastWords(e.studentName))],
      history: ctx.history,
      body: m.bodyText ?? "",
    });

    const answer = await classify(prompt, deps.signal);
    await store.insertAiCall({
      messageId: m.id,
      purpose: "classify",
      model: answer.model,
      inputTokens: answer.ok ? answer.inputTokens : null,
      outputTokens: answer.ok ? answer.outputTokens : null,
      policyVersion: POLICY_VERSION,
      outcome: answer.ok ? "ok" : answer.outcome,
      error: answer.ok ? null : answer.error,
    });

    if (!answer.ok) {
      // A budget abort is not a failure: the message waits for the next run as it was.
      if (answer.aborted) return;
      const retryCount = m.retryCount + 1;
      if (retryCount >= TUNING.irisMaxRetries) {
        await store.updateMessage(m.id, { retryCount, state: "failed", stateChangedAt: at(), lastError: answer.error });
        await store.insertEvent({ kind: "failed", messageId: m.id, detail: { state: "failed", reason: "classify_failed" } });
        out.failed += 1;
      } else {
        await store.updateMessage(m.id, { retryCount, lastError: answer.error });
      }
      return;
    }

    // numeric(3,2): round first, so the stored value is the one that was routed.
    const confidence = Math.round(answer.output.confidence * 100) / 100;
    const routed = routeClassification({ ...answer.output, confidence }, { threshold: deps.settings.confidenceThreshold, children, text });
    const now = at();
    await store.updateMessage(m.id, {
      state: routed.state,
      stateChangedAt: now,
      intent: routed.intent,
      confidence,
      flags: routed.flags,
      escalationReason: routed.reason,
      policyVersion: POLICY_VERSION,
      lastError: null,
      ...(routed.handled ? { handledAt: now } : {}),
    });
    await store.insertEvent({
      kind: routed.state === "classified" ? "classified" : routed.handled ? "handled" : "escalated",
      messageId: m.id,
      detail: { state: routed.state, reason: routed.reason, intent: routed.intent, intents: routed.intents, flags: routed.flags, confidence, notion_student_id: routed.studentId },
    });
    if (routed.state === "classified") out.classified += 1;
    else out.escalated += 1;
  };

  // Concurrency 3. A store error stops new work and fails the run, like intake.
  let next = 0;
  let broken = false;
  const worker = async () => {
    while (!broken && next < queue.length && !outOfTime()) {
      const m = queue[next++];
      try {
        await one(m);
      } catch {
        broken = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return broken ? { ...out, result: "failed", error: "Iris run failed" } : out;
}
