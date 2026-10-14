import { timeOf } from "../domain/schedule/wallclock";
import { ROW_MINUTES } from "./week-layout";

export type Slot = { date: string; startTime: string };
type GridGeometry = {
  days: string[];
  startMinutes: number;
  /** Height of one 15-minute row in px. */
  rowPx: number;
  colWidth: number;
  left: number;
  top: number;
  duration: number;
  /** Pointer distance below the card's top edge when the drag began. */
  offsetY: number;
};

/**
 * Where a card dropped at a pointer position lands: the column's date and a
 * start snapped to 15 minutes, clamped so the class stays inside the displayed
 * week and ends by 24:00. Pure so the snapping is unit-tested without a DOM.
 */
export function dropTarget(pointer: { x: number; y: number }, g: GridGeometry): Slot | null {
  if (g.days.length === 0 || g.rowPx <= 0 || g.colWidth <= 0) return null;
  const col = Math.min(g.days.length - 1, Math.max(0, Math.floor((pointer.x - g.left) / g.colWidth)));
  const rows = (pointer.y - g.top - g.offsetY) / g.rowPx;
  const raw = g.startMinutes + Math.round(rows) * ROW_MINUTES;
  const latest = Math.floor((1440 - g.duration) / ROW_MINUTES) * ROW_MINUTES;
  const start = Math.min(latest, Math.max(0, raw));
  return { date: g.days[col], startTime: timeOf(start) };
}

export const isSameSlot = (a: Slot, b: Slot) => a.date === b.date && a.startTime === b.startTime;
