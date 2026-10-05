"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage } from "@/lib/data/errors";
import { getViewer } from "@/lib/data/queries";
import { FLAG_REASONS } from "@/lib/data/schemas";
import { failed, type Result } from "@/lib/result";

// The only things a student can change: Done on their own assessments and
// tasks, and a fixed-reason flag on their own grades, through the database
// functions (ADRs 0015, 0025). Neither changes a mark.

const Input = z.object({ id: z.guid(), done: z.boolean() });

async function setDone(fn: "set_assessment_done" | "set_task_done", id: string, done: boolean): Promise<Result> {
  const input = Input.safeParse({ id, done });
  if (!input.success) return failed("Something went wrong. Try again.");
  const viewer = await getViewer();
  if (viewer.kind !== "student") return failed("Sign in again to save this.");
  const args = fn === "set_assessment_done" ? { assessment_id: id, done } : { task_id: id, done };
  const { data, error } = await viewer.db.tracker.rpc(fn, args);
  if (error) return failed(error.code === "P0002" ? "This item is no longer available." : dbMessage(error));
  revalidatePath("/", "layout");
  return { ok: true, doneAt: (data as string | null) ?? null };
}

export async function setAssessmentDone(id: string, done: boolean): Promise<Result> {
  return setDone("set_assessment_done", id, done);
}

export async function setTaskDone(id: string, done: boolean): Promise<Result> {
  return setDone("set_task_done", id, done);
}

const FlagInput = z.object({ id: z.guid(), reason: z.enum(FLAG_REASONS).nullable() });

/** Flag a grade with one of the fixed reasons, or withdraw the open flag (reason null). */
export async function setAssessmentFlag(id: string, reason: (typeof FLAG_REASONS)[number] | null): Promise<Result> {
  const input = FlagInput.safeParse({ id, reason });
  if (!input.success) return failed("Something went wrong. Try again.");
  const viewer = await getViewer();
  if (viewer.kind !== "student") return failed("Sign in again to save this.");
  const { error } =
    input.data.reason === null
      ? await viewer.db.tracker.rpc("unflag_assessment", { assessment_id: id })
      : await viewer.db.tracker.rpc("flag_assessment", { assessment_id: id, reason: input.data.reason });
  if (error) return failed(error.code === "P0002" ? "This item is no longer available." : dbMessage(error));
  revalidatePath("/", "layout");
  return { ok: true, message: input.data.reason === null ? "Flag withdrawn" : "Flagged" };
}
