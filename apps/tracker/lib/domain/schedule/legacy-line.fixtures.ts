/**
 * Synthetic Weekly Schedule values that mimic the shapes seen in the live
 * Students & Parents database (REQ-4 design asked for the live values
 * verbatim; this fixture file is synthetic instead, so no production data
 * enters the repo). Like the live data, none names a teacher, one student
 * uses the no-time `Tue 1h` form, and multi-line values use `\n`.
 * `withTeacher` adds a teacher for the happy-path tests.
 */
export const SHAPE_FIXTURES: { stage: "Active" | "Onboarding"; text: string }[] = [
  { stage: "Active", text: "Wed 18:00-19:00 | Math\nSun 14:00-15:00 | SCH4U Chemistry" },
  { stage: "Active", text: "Tue 19:30-21:00 | MHF4U Advanced Functions" },
  { stage: "Active", text: "Mon 17:00-18:00 | Math\nSat 10:00-11:00 | Chemistry" },
  { stage: "Active", text: "Tue 17:30-18:30 | MPM2D Math\nFri 17:30-18:30 | MPM2D Math" },
  { stage: "Active", text: "Tue 1h | SBI4U Biology\nThu 1h | ENG4U English\nFri 1h | ENG4U English" },
  { stage: "Active", text: "Thu 18:30-19:30 | SCH4U Chemistry\nSat 12:00-13:00 | SCH4U Chemistry" },
  { stage: "Onboarding", text: "Tue 16:30-17:30 | MPM2D Math\nThu 18:00-19:00 | MPM2D Math" },
];

/** Adds `| <teacher>` to every line that has exactly two fields. */
export function withTeacher(text: string, teacher: string): string {
  return text.split("\n").map((l) => (l.split("|").length === 2 ? `${l} | ${teacher}` : l)).join("\n");
}
