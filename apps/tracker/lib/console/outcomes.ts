import { TUNING } from "../domain/tuning";
import { localHhmm, SCHEDULE_TIME_ZONE, todayIso, zonedIso } from "../time";

/**
 * Call outcomes the founder logs from the Sales Rolodex (REQ-61, tracker ADR
 * 0076, workspace ADR 0007). Pure: the transition table, the handoff
 * contracts and the two-slot call cadence. No I/O; the client form imports
 * allowedOutcomes, the server plans every write here before it sends one.
 * Contract fields arrive as booleans only, so no Parent Phone, Sales Notes,
 * rate or payment value ever reaches this file.
 */
export const OUTCOMES = ["no_answer", "call_back", "follow_up", "trial_booked", "not_interested", "wrong_number", "do_not_contact", "won"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  no_answer: "No answer", call_back: "Contacted, call back later", follow_up: "Follow-up scheduled", trial_booked: "Trial booked",
  not_interested: "Not interested", wrong_number: "Wrong number", do_not_contact: "Do not contact", won: "Won",
};

/** Every Students & Parents Stage option, including the legacy Trial and Churned. */
export const STAGES = ["New", "Working", "Trial Booked", "Trial Claimed", "Awaiting Close", "Onboarding", "Active", "Paused", "Lost", "Trial", "Churned"] as const;

/** Lost Reasons that end the relationship: no outcome is ever logged for them. */
const PERMANENT_LOST = ["Do not contact", "Duplicate"];

export const CONTRACT_A = ["Parent Name", "Student Name", "Parent Phone", "Subjects", "Grade", "Target Program", "Trial Time", "Sales Notes"] as const;
export const CONTRACT_C = ["Lesson Cadence", "Hourly Rate (CAD)", "Last Payment Date", "Subjects"] as const;
export type ContractField = (typeof CONTRACT_A)[number] | (typeof CONTRACT_C)[number];
export const CONTRACT_FIELDS: readonly ContractField[] = [...new Set<ContractField>([...CONTRACT_A, ...CONTRACT_C])];

export const FOLLOW_UP_ACTIONS = ["Call", "Text", "Book trial", "Close call", "Rebook trial", "Schedule first lesson"] as const;

const ALLOWED_FROM: Record<Outcome, readonly string[]> = {
  no_answer: ["New", "Working", "Awaiting Close"],
  call_back: ["New", "Working"],
  follow_up: ["Working", "Trial Booked", "Trial Claimed", "Awaiting Close", "Onboarding"],
  trial_booked: ["New", "Working"],
  not_interested: ["New", "Working", "Awaiting Close"],
  wrong_number: ["New", "Working"],
  do_not_contact: ["New", "Working", "Awaiting Close"],
  won: ["Awaiting Close"],
};

/** The lead as the writer read it. Contract fields are presence only. */
export type LeadSnapshot = {
  id: string; stage: string | null; lostReason: string | null; attempts: number | null; nextAction: string | null; nextActionDue: string | null;
  owner: string | null; lastContact: string | null; contactedAt: string | null; trialBookedAt: string | null; closedAt: string | null;
  trialTime: string | null; lastEditedAt: string; lastTxn: string | null;
  present: Record<ContractField, boolean>;
};

/** The absolute Students & Parents values one outcome writes. A key that is absent is not written. */
export type LeadPatch = Partial<{
  stage: string; owner: null; nextAction: string; nextActionDue: string | null; attempts: number; lastContact: string; lostReason: string;
  contactedAt: string; trialBookedAt: string; closedAt: string;
}>;
export type TouchPlan = { type: "Call" | "Close call"; outcome: string; title: string };
export type OutcomeForm = { nextAction?: string; due?: string };
export type PlanRefusal = { ok: false; code: "disallowed" | "contract_missing" | "bad_form"; missing?: string[]; message: string };
export type OutcomePlan = { ok: true; patch: LeadPatch; touch: TouchPlan; cadenceUsedUp: boolean };

/** The outcomes the form offers for a lead, in table order. */
export function allowedOutcomes(stage: string | null, lostReason: string | null): Outcome[] {
  if (stage === null || (lostReason !== null && PERMANENT_LOST.includes(lostReason))) return [];
  return OUTCOMES.filter((o) => ALLOWED_FROM[o].includes(stage));
}

const DAY_MS = 86_400_000;
const isBusinessDay = (dateIso: string) => {
  const day = new Date(`${dateIso}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
};
const addDays = (dateIso: string, n: number) => new Date(Date.parse(`${dateIso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * The next call slot of the two-slot cadence: 15:00 today on a business day
 * before 15:00, else 12:00 on the next business day (Monday to Friday),
 * Toronto time, as an ISO datetime with its offset.
 */
export function nextCallSlot(now: Date): string {
  const today = todayIso(now);
  if (isBusinessDay(today) && localHhmm(now) < "15:00") return zonedIso(today, "15:00");
  let day = addDays(today, 1);
  while (!isBusinessDay(day)) day = addDays(day, 1);
  return zonedIso(day, "12:00");
}

const titleTime = (now: Date) => {
  const month = new Intl.DateTimeFormat("en-US", { timeZone: SCHEDULE_TIME_ZONE, month: "short", day: "numeric" }).format(now);
  return `${month} ${localHhmm(now)}`;
};
const future = (due: string | undefined, now: Date) => due !== undefined && !Number.isNaN(Date.parse(due)) && Date.parse(due) > now.getTime();

/**
 * Exactly the side effects of the transition table for one outcome, or the
 * refusal: disallowed (the Stage or a permanent Lost Reason), bad_form (a
 * missing or past time, an unlisted next action) or contract_missing (with
 * the empty property names). Never a contract field, never billing.
 */
export function planOutcome(input: { outcome: Outcome; lead: LeadSnapshot; form: OutcomeForm; now: Date }): OutcomePlan | PlanRefusal {
  const { outcome, lead, form, now } = input;
  if (lead.lostReason !== null && PERMANENT_LOST.includes(lead.lostReason)) {
    return { ok: false, code: "disallowed", message: `This lead is closed for good (${lead.lostReason}). Nothing can be logged.` };
  }
  if (lead.stage === null || !ALLOWED_FROM[outcome].includes(lead.stage)) {
    return { ok: false, code: "disallowed", message: `${OUTCOME_LABELS[outcome]} is not allowed from ${lead.stage ?? "no Stage"}. Change the Stage in Notion first.` };
  }
  if ((outcome === "call_back" || outcome === "follow_up") && !future(form.due, now)) {
    return { ok: false, code: "bad_form", message: "Pick a time in the future." };
  }
  if (outcome === "follow_up" && !FOLLOW_UP_ACTIONS.includes(form.nextAction as (typeof FOLLOW_UP_ACTIONS)[number])) {
    return { ok: false, code: "bad_form", message: "Pick the next action." };
  }
  const contract = outcome === "trial_booked" ? CONTRACT_A : outcome === "won" ? CONTRACT_C : [];
  const missing = contract.filter((f) => !lead.present[f] || (f === "Trial Time" && lead.trialTime === null));
  if (missing.length > 0) {
    return { ok: false, code: "contract_missing", missing, message: `Fill these in Notion first: ${missing.join(", ")}.` };
  }

  const today = todayIso(now);
  const touch = (o: string): TouchPlan => {
    const type = lead.stage === "Awaiting Close" ? "Close call" : "Call";
    return { type, outcome: o, title: `${type} · ${titleTime(now)}` };
  };
  const stamp = (key: "contactedAt" | "trialBookedAt" | "closedAt", current: string | null): LeadPatch => (current === null ? { [key]: today } : {});
  const answered: LeadPatch = { lastContact: today, ...stamp("contactedAt", lead.contactedAt) };
  const done = (patch: LeadPatch, o: string, cadenceUsedUp = false): OutcomePlan => ({ ok: true, patch, touch: touch(o), cadenceUsedUp });
  const lost = (reason: string, withContact: boolean) =>
    done({ stage: "Lost", lostReason: reason, nextAction: "None", nextActionDue: null, ...(withContact ? answered : {}) }, reason);

  switch (outcome) {
    case "no_answer": {
      const attempts = (lead.attempts ?? 0) + 1;
      const usedUp = attempts >= TUNING.consoleNoAnswerCadenceAttempts;
      const stage: LeadPatch = lead.stage === "New" ? { stage: "Working" } : {};
      if (usedUp) {
        return done({ ...stage, attempts, nextAction: "Text", nextActionDue: new Date(now.getTime() + 7 * DAY_MS).toISOString() }, "No answer", true);
      }
      return done({ ...stage, attempts, nextActionDue: nextCallSlot(now), ...(lead.nextAction === null ? { nextAction: "Call" } : {}) }, "No answer");
    }
    case "call_back":
      return done({ stage: "Working", attempts: 0, nextAction: "Call", nextActionDue: form.due!, ...answered }, "Follow-up");
    case "follow_up":
      return done({ nextAction: form.nextAction!, nextActionDue: form.due!, ...answered }, "Follow-up");
    case "trial_booked":
      return done({
        stage: "Trial Booked", owner: null, nextAction: "Deliver trial", nextActionDue: lead.trialTime, lastContact: today,
        ...stamp("trialBookedAt", lead.trialBookedAt), ...stamp("contactedAt", lead.contactedAt),
      }, "Trial booked");
    case "not_interested":
      return lost("Not interested", true);
    case "wrong_number":
      return lost("Wrong number", false);
    case "do_not_contact":
      return lost("Do not contact", true);
    case "won":
      return done({
        stage: "Onboarding", nextAction: "Assign teacher", nextActionDue: new Date(now.getTime() + DAY_MS).toISOString(), lastContact: today,
        ...stamp("closedAt", lead.closedAt),
      }, "Won");
  }
}
