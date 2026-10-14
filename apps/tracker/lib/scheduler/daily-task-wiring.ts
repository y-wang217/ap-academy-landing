import { createDailyTaskStore } from "../data/daily-task";
import type { Db } from "../data/client";
import { expandOccurrences } from "../domain/schedule/recurrence";
import type { WorkConfig } from "../notion/config";
import type { StaffRecord } from "../notion/staff";
import { appendTeacher, createLogEntry, createTaskPage, findTaskByTitle, listChildren, updateIntro, updateLogDecisions, updateTeacher } from "../notion/work";
import { TRACKER_URL } from "../config";
import type { DailyNotion, DailyTaskDeps } from "./daily-task";
import type { DailyTaskStore } from "./daily-task-store";
import type { ScheduleStore } from "./schedule-store";

/** The real Notion port: lib/notion/work.ts bound to one config. */
export function workNotion(config: WorkConfig): DailyNotion {
  return {
    find: (title) => findTaskByTitle(config, title),
    create: (input) => createTaskPage(config, input),
    list: (pageId) => listChildren(config, pageId),
    update: (blockId, teacher, label) => updateTeacher(config, blockId, teacher, label),
    append: (pageId, teacher, label) => appendTeacher(config, pageId, teacher, undefined, label),
    updateIntro: (blockId, text) => updateIntro(config, blockId, text),
    createLog: (input) => createLogEntry(config, input),
    updateLog: (logId, decisions) => updateLogDecisions(config, logId, decisions),
  };
}

/** A store that resolves its client and org on first use, so a request that never needs it never pays for the lookup. */
export function lazyDailyTaskStore(resolve: () => Promise<{ tracker: Db["tracker"]; orgId: string } | null>): DailyTaskStore {
  let inner: Promise<DailyTaskStore> | undefined;
  const get = () =>
    (inner ??= resolve().then((r) => {
      if (!r) throw new Error("daily task storage unavailable");
      return createDailyTaskStore(r.tracker, r.orgId);
    }));
  return {
    get: async (d) => (await get()).get(d),
    claim: async (d, s) => (await get()).claim(d, s),
    save: async (id, p) => (await get()).save(id, p),
    listTeachers: async (id) => (await get()).listTeachers(id),
    saveTeacher: async (id, t) => (await get()).saveTeacher(id, t),
  };
}

export const scheduleUrlFor = (staffId: string, date: string) => `${TRACKER_URL}/schedule?staffId=${staffId}&date=${date}`;

export function buildDailyTaskDeps(input: {
  store: DailyTaskStore;
  schedule: ScheduleStore;
  config: WorkConfig;
  fetchStaff: () => Promise<StaffRecord[]>;
  studentNames: () => Promise<Map<string, string>>;
  now?: () => Date;
}): DailyTaskDeps {
  return {
    store: input.store,
    notion: workNotion(input.config),
    fetchStaff: input.fetchStaff,
    studentNames: input.studentNames,
    occurrencesOn: async (date) => {
      const { series, exceptions } = await input.schedule.listSeries({ from: date, to: date });
      return expandOccurrences(series, exceptions, { from: date, to: date });
    },
    scheduleUrl: scheduleUrlFor,
    now: input.now ?? (() => new Date()),
    sessionLink: `${TRACKER_URL}/schedule`,
  };
}
