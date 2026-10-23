import type { ConsoleMode } from "./modes";
import { notConnected, type PanelView } from "./panel-view";

export type SlotKind = "metric" | "gauge" | "radar" | "queue" | "list";
export type PanelSlot = { id: string; mode: ConsoleMode; area: string; title: string; kind: SlotKind; emptyText: string; primary?: boolean };

const slot = (mode: ConsoleMode, id: string, kind: SlotKind, title: string, emptyText: string, primary = false): PanelSlot => ({ id, mode, area: id, title, kind, emptyText, ...(primary ? { primary } : {}) });

/**
 * The panels of each mode, in DOM and focus order (REQ-55 AC12): the mobile
 * order from VISUAL_DIRECTION, so focus starts at the primary action.
 * console.css places them with grid-template-areas named by slot id.
 * Empty texts come from PANEL_STATES.md. Later Console cards fill the slots.
 */
export const PANEL_SLOTS: PanelSlot[] = [
  slot("sales", "next", "queue", "Next contact", "Queue clear", true),
  slot("sales", "northStar", "metric", "North star", "No verified change this week"),
  slot("sales", "signals", "list", "Signals", "No exceptions found"),
  slot("sales", "followUps", "queue", "Follow-ups", "Nothing due"),
  slot("sales", "radar", "radar", "Lead radar", "No active leads"),
  slot("sales", "conversion", "metric", "Trials to enrolments", "No trials in this period"),
  slot("sales", "capacity", "gauge", "Teacher load", "No teachers active"),
  slot("sales", "cashflow", "metric", "Cashflow pulse", "No verified payments"),
  slot("sales", "dispatch", "list", "Daily dispatch", "No activity yet today"),
  slot("creation", "nextAsset", "queue", "Next asset", "Queue clear"),
  slot("creation", "work", "queue", "Work queue", "No tasks scheduled"),
  slot("creation", "pipeline", "list", "Weekly media review", "No weekly media review task found"),
  slot("creation", "signals", "list", "Signals", "No exceptions found"),
  slot("operations", "teacherLoad", "gauge", "Teacher load", "No teachers active"),
  slot("operations", "lessonGaps", "queue", "Lesson log gaps", "Nothing due"),
  slot("operations", "upcoming", "list", "Upcoming classes", "No classes in the next 7 days"),
  slot("operations", "finance", "metric", "Finance", "No verified payments"),
  slot("operations", "trials", "metric", "Trials", "No trials in this period"),
  slot("operations", "signals", "list", "Signals", "No exceptions found"),
  slot("operations", "integrations", "list", "Integration health", "No checks run yet"),
];

export const slotsFor = (mode: ConsoleMode) => PANEL_SLOTS.filter((s) => s.mode === mode);

export type ConsolePanels = Record<ConsoleMode, Record<string, PanelView<unknown>>>;

/** The production page until data is wired: every slot is "Not connected yet" (AC8). */
export function placeholderPanels(now: Date): ConsolePanels {
  const byMode = (mode: ConsoleMode): Record<string, PanelView<unknown>> => Object.fromEntries(slotsFor(mode).map((s) => [s.id, notConnected(s.id, now)]));
  return { sales: byMode("sales"), creation: byMode("creation"), operations: byMode("operations") };
}

/** "N of M connected" per mode: M slots, N of them not unverifiable (AC9). */
export function connectedByMode(panels: ConsolePanels): Record<ConsoleMode, { connected: number; total: number }> {
  const count = (mode: ConsoleMode) => {
    const slots = slotsFor(mode);
    const connected = slots.filter((s) => (panels[mode][s.id]?.status ?? "unverifiable") !== "unverifiable").length;
    return { connected, total: slots.length };
  };
  return { sales: count("sales"), creation: count("creation"), operations: count("operations") };
}
