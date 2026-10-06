/** Display formatting. Rounding happens here and nowhere else (ADR 0005). */

export function percent(value: number | null, empty = "No grades yet"): string {
  return value === null ? empty : `${value.toFixed(1)}%`;
}

export function points(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function gap(value: number | null): string | null {
  if (value === null) return null;
  const rounded = Math.abs(value).toFixed(1);
  if (rounded === "0.0") return "On target";
  return value > 0 ? `${rounded} above target` : `${rounded} below target`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

/** "Oct 9", for chart axes. */
export function monthDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

/** "Test · Fri, Oct 9", "Due Fri, Oct 9", or "No date" (ADR 0030). */
export function whenText(a: { kind: "assignment" | "test"; dueDate: string | null; heldOn: string | null }): string {
  if (a.kind === "test") return a.heldOn ? `Test · ${shortDate(a.heldOn)}` : "Test · No date";
  return a.dueDate ? `Due ${shortDate(a.dueDate)}` : "No due date";
}

export function stamp(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function studentName(s: { firstName: string; lastInitial: string }): string {
  return `${s.firstName} ${s.lastInitial}.`;
}

/** The number a teacher writes on notes instead of a name (ADR 0028). */
export function studentNumber(n: number): string {
  return `S-${String(n).padStart(4, "0")}`;
}
