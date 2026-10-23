import { z } from "zod";
import { TUNING } from "../domain/tuning";
import { FOLLOW_UP_ACTIONS, OUTCOMES } from "./outcomes";

/** The body of POST /api/console/outcomes (REQ-61). Strict: an unknown key is a 400. */
export const OutcomeBodySchema = z.strictObject({
  requestId: z.uuid(),
  pageId: z.guid(),
  outcome: z.enum(OUTCOMES),
  expected: z.strictObject({ stage: z.string().max(100).nullable(), attempts: z.number().int().min(0).max(1000).nullable(), lastEditedAt: z.iso.datetime({ offset: true }) }),
  note: z.string().max(TUNING.consoleNoteMaxChars).default(""),
  nextAction: z.enum(FOLLOW_UP_ACTIONS).optional(),
  due: z.iso.datetime({ offset: true }).optional(),
});
export type OutcomeBodyInput = z.input<typeof OutcomeBodySchema>;
