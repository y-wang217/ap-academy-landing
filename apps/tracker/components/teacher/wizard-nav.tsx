import Link from "next/link";

export const STEPS = [
  { key: "goal", label: "Goal" },
  { key: "courses", label: "Courses" },
  { key: "targets", label: "Targets" },
  { key: "syllabus", label: "Syllabus" },
  { key: "work", label: "Grades and work" },
  { key: "review", label: "Review" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

export function WizardNav({ studentId, current }: { studentId: string; current: StepKey }) {
  const index = STEPS.findIndex((s) => s.key === current);
  const next = STEPS[index + 1];
  return (
    <nav aria-label="Setup steps" className="flex flex-col gap-3">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <Link
              href={`/students/${studentId}/setup/${s.key}`}
              aria-current={s.key === current ? "step" : undefined}
              className={
                s.key === current
                  ? "rounded-full bg-accent px-3 py-1 font-semibold text-surface"
                  : "rounded-full border border-border bg-surface px-3 py-1 text-text-muted"
              }
            >
              {i + 1}. {s.label}
            </Link>
          </li>
        ))}
      </ol>
      {next && (
        <Link href={`/students/${studentId}/setup/${next.key}`} className="self-end text-sm font-semibold text-accent underline underline-offset-2">
          Next: {next.label}
        </Link>
      )}
    </nav>
  );
}
