import { TUNING } from "../domain/tuning";
import { fetchOrgInvoices } from "../notion/billing";
import { consoleDataSourceIds, readConsoleNotionConfig, readLessonsConfig } from "../notion/config";
import { fetchLeads } from "../notion/leads";
import { createLessonsPort, fetchTrialLessons } from "../notion/lessons";
import { fetchRecentTouches, lastTouchesByStudent } from "../notion/touches";
import { fetchWorkItems } from "../notion/work";
import type { FacadeDeps, NotionPorts } from "./facade";
import type { OwnerViewer } from "./guard";
import type { SignalSources } from "./handlers";
import { loadOperationsPanels } from "./operations";
import { createOperationsReader, type UnlinkedLessonsPort } from "./operations-read";
import { settleOutbox, settleTeaching } from "./signals-read";
import { createConsolePeopleReader } from "./people-read";

/**
 * The real ports behind the console facade (REQ-54, tracker ADR 0065). The
 * only console file that reaches the Notion readers. Every request carries
 * the facade's abort signal, so a timed-out read is abandoned.
 */

/** One per server instance, shared by every request. Exported for tests only. Keys carry the org id. */
export const consoleFreshness = new Map<string, string>();

const bound = (signal: AbortSignal): typeof fetch => ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, signal })) as typeof fetch;

export function createConsoleDeps(viewer: OwnerViewer, now: () => Date = () => new Date()): FacadeDeps {
  const ids = consoleDataSourceIds();
  const config = readConsoleNotionConfig();
  const at = (dataSourceId: string) => ({ token: config?.token ?? "", dataSourceId });
  const notion: NotionPorts | null = config && {
    leads: (o) => fetchLeads(at(ids.studentsId), { fetcher: bound(o.signal), maxPages: o.maxPages }),
    touches: async (o) => {
      const read = await fetchRecentTouches(at(ids.touchesId), { fetcher: bound(o.signal), maxPages: o.maxPages, since: o.since });
      return { ...read, rows: lastTouchesByStudent(read.rows, o.perStudent) };
    },
    trialLessons: (o) => fetchTrialLessons(at(ids.lessonsId), { fetcher: bound(o.signal), maxPages: o.maxPages }),
    work: (o) => fetchWorkItems(at(ids.workId), { fetcher: bound(o.signal), maxPages: o.maxPages }),
    invoices: (o) => fetchOrgInvoices(at(ids.invoicesId), { fetcher: bound(o.signal), maxPages: o.maxPages }),
  };
  return {
    orgId: viewer.orgId,
    now,
    people: createConsolePeopleReader(viewer.db.tracker, viewer.orgId),
    notion,
    sources: { leads: ids.studentsId, touches: ids.touchesId, trialLessons: ids.lessonsId, work: ids.workId, invoices: ids.invoicesId },
    timeoutMs: TUNING.consoleProviderTimeoutMs,
    maxPages: TUNING.consoleNotionMaxPages,
    touchesPerStudent: TUNING.consoleTouchesPerStudent,
    touchesWindowDays: TUNING.consoleTouchesWindowDays,
    freshness: consoleFreshness,
  };
}

/**
 * The same deps with a people read that runs at most once (REQ-56 AC11): the facade and the north
 * star share one promise, rejection included, so a page load reads the people copy once.
 */
export function sharePeopleRead(deps: FacadeDeps): FacadeDeps {
  let read: Promise<Awaited<ReturnType<FacadeDeps["people"]>>> | null = null;
  return { ...deps, people: () => (read ??= deps.people()) };
}

/**
 * The read-only Lessons query Operations mode needs (REQ-58): rows dated in the range whose
 * Class occurrence is empty, through the existing Lessons port, abandoned with the signal.
 * Null when Notion has no token. Only listUnlinkedLessons is ever called on the port.
 */
export function createOperationsLessons(): UnlinkedLessonsPort {
  const config = readLessonsConfig();
  if (!config) return null;
  return (range, signal) => createLessonsPort(config, bound(signal)).listUnlinkedLessons(range);
}

/** The default lesson-gap window, as Operations opens without ?gapDays= (REQ-58). */
const SIGNAL_GAP_DAYS = 14;

/** The signals route's reads besides the facade (REQ-62): Operations on the shared people read, the outbox, teaching time. */
export function createSignalSources(viewer: OwnerViewer, deps: FacadeDeps, now: Date): SignalSources {
  const reader = createOperationsReader(viewer, createOperationsLessons());
  return {
    operations: (people) => loadOperationsPanels({
      reader, people, now, gapDays: SIGNAL_GAP_DAYS, orgId: viewer.orgId, lessonsSourceId: deps.sources.trialLessons, query: {}, freshness: consoleFreshness, timeoutMs: deps.timeoutMs,
    }),
    outbox: () => settleOutbox(viewer, now, deps.timeoutMs),
    teaching: () => settleTeaching(viewer, now, reader, deps.timeoutMs),
  };
}
