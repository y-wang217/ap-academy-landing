import { CHILD_SCOPED, ESCALATE_ONLY, FLAGS, SENSITIVE_TRIGGERS, type ClassifierIntent, type Flag } from "./policy";

/**
 * Where a classified message goes (REQ-43, tracker ADR 0061). Pure: no
 * imports beyond policy.ts. The rules run in order and the first match wins,
 * so anything sensitive, mixed, unsure, money-related or about an unnamed
 * sibling reaches Charlie before Iris may go on.
 */
export type Classification = { intents: ClassifierIntent[]; primary: ClassifierIntent; confidence: number; flags: Flag[]; childName: string };
export type Child = { studentId: string; firstName: string };
export type RouteContext = { threshold: number; children: Child[]; text: string };
export type EscalationReason = "flagged" | "multi_intent" | "low_confidence" | "escalate_only" | "no_reply_needed" | "ambiguous_student";
export type Routing = {
  state: "classified" | "escalated";
  reason: EscalationReason | null;
  intent: ClassifierIntent;
  intents: ClassifierIntent[];
  flags: Flag[];
  /** True only for no_reply_needed: stored with handled_at, so it never shows in Needs you. */
  handled: boolean;
  studentId: string | null;
};

const normalize = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");

/** Every flag with a trigger phrase in the text. It only ever adds escalations. */
export function backstopFlags(text: string): Flag[] {
  const t = normalize(text);
  return FLAGS.filter((f) => SENSITIVE_TRIGGERS[f].some((phrase) => t.includes(phrase)));
}

export function routeClassification(answer: Classification, ctx: RouteContext): Routing {
  const intents = [...new Set([answer.primary, ...answer.intents])];
  const found = new Set([...answer.flags, ...backstopFlags(ctx.text)]);
  const flags = FLAGS.filter((f) => found.has(f));
  const named = answer.childName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const child = named ? ctx.children.find((c) => c.firstName.toLowerCase() === named) : undefined;
  const studentId = child?.studentId ?? (ctx.children.length === 1 ? ctx.children[0].studentId : null);
  const base = { intent: answer.primary, intents, flags, handled: false, studentId };
  const escalate = (reason: EscalationReason): Routing => ({ ...base, state: "escalated", reason });

  if (flags.length > 0) return escalate("flagged");
  if (intents.length >= 2) return escalate("multi_intent");
  if (answer.confidence < ctx.threshold) return escalate("low_confidence");
  if ((ESCALATE_ONLY as readonly string[]).includes(answer.primary)) return escalate("escalate_only");
  if (answer.primary === "no_reply_needed") return { ...escalate("no_reply_needed"), handled: true };
  if (CHILD_SCOPED.includes(answer.primary) && !child && ctx.children.length !== 1) return { ...escalate("ambiguous_student"), studentId: null };
  return { ...base, state: "classified", reason: null };
}
