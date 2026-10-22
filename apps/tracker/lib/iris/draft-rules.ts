import { SIGNATURE } from "./policy";

/**
 * The code-side check on every model draft (REQ-44 AC3, AC4, tracker ADR
 * 0063). Pure. A draft that breaks a rule is never stored: the message goes to
 * Charlie instead. The regexes can over-escalate (a "5 pm" echoed back); that
 * only costs Charlie a reply.
 */
export type DraftRule = "money" | "ai_line" | "time" | "forfeit";

const RULES: [DraftRule, RegExp][] = [
  ["money", /\$\s?\d|\b\d[\d,.]*\s*(?:dollars?|cad|usd)\b/i],
  ["ai_line", /\bas an ai\b|\bassistant\b|\bautomated\b|\biris\b/i],
  ["time", /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:am|pm|a\.m\.|p\.m\.)(?![a-z])/i],
  ["forfeit", /\bforfeit/i],
];

/** Every rule the body breaks, in a fixed order; empty when it is clean. */
export function checkDraft(body: string): DraftRule[] {
  return RULES.filter(([, re]) => re.test(body)).map(([code]) => code);
}

const SIGN_OFF = /^(?:charlie|ap academy|thanks,?|thank you,?|best,?|regards,?|best regards,?|cheers,?|-+)$/i;

/**
 * The text Charlie copies, the Notion code block and (from Iris 8/9) the send
 * body: the reply with any sign-off lines the model added at the end removed,
 * then SIGNATURE exactly once.
 */
export function withSignature(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").trimEnd().split("\n");
  while (lines.length > 0 && (lines[lines.length - 1].trim() === "" || SIGN_OFF.test(lines[lines.length - 1].trim()))) lines.pop();
  return `${lines.join("\n").trimEnd()}\n\n${SIGNATURE}`;
}
