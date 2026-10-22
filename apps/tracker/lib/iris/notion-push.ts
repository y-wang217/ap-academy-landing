import { TUNING } from "../domain/tuning";
import type { WorkConfig } from "../notion/config";
import type { FamilyEntry } from "../notion/parents";
import { NotionError } from "../notion/staff";
import { appendToDo, createComment, createLogEntry, createTaskPage, deleteBlock, findTaskByTitle, listToDoTexts, updateLogDecisions } from "../notion/work";
import { todayIso } from "../time";
import { gmailThreadUrl, intentLabel, reasonLabel } from "../view/iris-text";
import { withSignature } from "./draft-rules";
import { shortError } from "./intake";
import type { IrisStore, PushCandidate, PushDay, PushRecord } from "./store";

/**
 * The phone backup (REQ-44, tracker ADR 0064). Each new draft or unhandled
 * escalation becomes one to-do on a per-day Notion Work page, with a copy-ready
 * code block when a draft exists, and one page comment that mentions Charlie
 * so Notion notifies his phone. What goes to Notion: first names, the intent
 * and reason labels, links, a ref and Iris's reply text. What never does: the
 * parent's message, the model's reason, any address. A to-do is never edited
 * after creation, and is deleted before its message's purge date. A Notion
 * failure leaves the queue untouched and is retried next run. Never throws.
 */
export type PushDeps = {
  store: IrisStore;
  config: WorkConfig;
  /** NOTION_CHARLIE_USER_ID, or null: to-dos are then written with no comment. */
  charlieUserId: string | null;
  /** The site origin, for the tracker link (NEXT_PUBLIC_SITE_URL). */
  siteUrl: string;
  /** The mailbox, for the Gmail link. */
  mailbox: string | null;
  directory: () => Promise<FamilyEntry[]>;
  now: () => Date;
  fetcher?: typeof fetch;
};

export type PushOutcome = { pushed: number; failed: number; removed: number; error: string | null };

const DAY_MS = 86_400_000;
// The card names the title with an em dash (design decision 21); it is data, not prose.
export const dayTitle = (day: string) => `Iris replies \u2014 ${day}`;
export const refOf = (messageId: string) => messageId.slice(0, 8);
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";

export function renderToDo(c: PushCandidate, names: { parent: string | null; child: string | null }, links: { siteUrl: string; mailbox: string | null }) {
  // An unknown sender is named by nothing that could identify them.
  const unknown = c.escalationReason === "unknown_sender";
  const who = unknown ? "Unknown sender" : (names.parent ?? "Family");
  const child = unknown ? null : names.child;
  const reason = c.state === "drafted" ? "Draft waiting" : reasonLabel(c.escalationReason);
  return {
    text: `${who} re ${child ?? "-"}: ${intentLabel(c.intent)} (${reason}) ref ${refOf(c.messageId)}`,
    bullets: [`Intent: ${intentLabel(c.intent)}`, `Why: ${reason}`],
    links: [
      { label: "Open in the tracker", url: `${links.siteUrl.replace(/\/+$/, "")}/tracker/iris/messages/${c.messageId}` },
      { label: "Open in Gmail", url: gmailThreadUrl(links.mailbox, c.gmailThreadId) },
    ],
    ...(c.draft ? { code: withSignature(c.draft.bodyText) } : {}),
  };
}

export async function runPush(deps: PushDeps): Promise<PushOutcome> {
  const out: PushOutcome = { pushed: 0, failed: 0, removed: 0, error: null };
  const { store, config } = deps;
  const f = deps.fetcher ?? fetch;
  const now = deps.now();
  const day = todayIso(now);
  try {
    // 1. Retention first: a Notion copy never outlives the tracker's message.
    const cutoff = new Date(now.getTime() + DAY_MS).toISOString();
    for (const row of await store.listExpiringPushes(cutoff)) {
      try {
        if (row.notionBlockId) await deleteBlock(config, row.notionBlockId, f);
      } catch (e) {
        if (!(e instanceof NotionError && e.status === 404)) {
          out.error ??= shortError(e, "Notion request failed");
          continue;
        }
      }
      await store.deletePush(row.id);
      out.removed += 1;
    }

    // 2. Candidates.
    // A message within a day of its purge is not copied at all.
    const queue = (await store.listPushable(TUNING.irisMaxPushAttempts, TUNING.irisMaxPushPerRun)).filter((c) => c.purgeAt >= cutoff);
    if (queue.length === 0) return out;

    // 3. Today's page, adopted by exact title after a lost write.
    let pushDay: PushDay = (await store.getPushDay(day)) ?? { day, workPageId: null, logEntryId: null };
    if (!pushDay.workPageId) {
      try {
        const page = (await findTaskByTitle(config, dayTitle(day), f)) ??
          (await createTaskPage(config, { date: day, title: dayTitle(day), intro: "Iris replies and escalations for today. Copy a reply into Gmail, or open it in the tracker.", teachers: [] }, f));
        pushDay = { ...pushDay, workPageId: page.pageId };
        await store.savePushDay(pushDay);
      } catch (e) {
        return { ...out, error: shortError(e, "Notion request failed") };
      }
    }
    const pageId = pushDay.workPageId!;

    let family = new Map<string, FamilyEntry>();
    try {
      family = new Map((await deps.directory()).map((e) => [e.studentId, e]));
    } catch {
      // First names are a nicety: the to-do still carries the intent and the links.
    }

    // 4. One to-do and one comment per candidate.
    for (const c of queue) {
      const row: PushRecord = c.push ?? { id: null, messageId: c.messageId, draftId: c.draft?.id ?? null, day, notionBlockId: null, commentDone: false, state: "pending", attempts: 0, lastError: null, purgeAt: c.purgeAt };
      row.draftId = row.draftId ?? c.draft?.id ?? null;
      try {
        if (!row.notionBlockId) {
          if (row.attempts > 0) {
            const ref = `ref ${refOf(c.messageId)}`;
            row.notionBlockId = (await listToDoTexts(config, pageId, f)).find((t) => t.text.includes(ref))?.id ?? null;
          }
          if (!row.notionBlockId) {
            const fam = c.notionStudentIds.map((id) => family.get(id)).filter((e): e is FamilyEntry => e !== undefined);
            const child = (c.notionStudentId ? family.get(c.notionStudentId) : undefined) ?? (fam.length === 1 ? fam[0] : undefined);
            const names = { parent: fam[0]?.parentName ? firstWord(fam[0].parentName) : null, child: child ? firstWord(child.studentName) : null };
            row.notionBlockId = await appendToDo(config, pageId, renderToDo(c, names, deps), f);
            row.day = day;
          }
          row.id = await store.savePush({ ...row, state: "pending" });
        }
        if (!row.commentDone && deps.charlieUserId) {
          await createComment(config, pageId, { mentionUserId: deps.charlieUserId, text: `New Iris item ref ${refOf(c.messageId)}: ${intentLabel(c.intent)}` }, f);
          row.commentDone = true;
        }
        row.id = await store.savePush({ ...row, state: "pushed", lastError: null });
        out.pushed += 1;
      } catch (e) {
        if (!(e instanceof NotionError)) throw e;
        row.id = await store.savePush({ ...row, state: "failed", attempts: row.attempts + 1, lastError: shortError(e, "Notion request failed") });
        out.failed += 1;
        out.error ??= shortError(e, "Notion request failed");
      }
    }

    // 5. One Work Log entry per date, its counts refreshed on each run that pushed.
    const counts = await store.pushDayCounts(day);
    const decisions = `Drafts: ${counts.drafts}. Escalations: ${counts.escalations}. Phone copies failed: ${counts.failed}.`;
    try {
      if (pushDay.logEntryId) {
        await updateLogDecisions(config, pushDay.logEntryId, decisions, f);
      } else {
        const logEntryId = await createLogEntry(config, { summary: dayTitle(day), date: day, workPageId: pageId, sessionLink: `${deps.siteUrl.replace(/\/+$/, "")}/tracker/iris`, decisions }, f);
        await store.savePushDay({ ...pushDay, logEntryId });
      }
    } catch (e) {
      if (!(e instanceof NotionError)) throw e;
      out.error ??= shortError(e, "Notion request failed");
    }
    return out;
  } catch {
    return { ...out, error: out.error ?? "Iris run failed" };
  }
}
