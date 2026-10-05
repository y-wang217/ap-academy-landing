import { LISTED_STUDENTS, PRE_LOG_COUNT, ROSTER_UPDATED, UNLOGGED_NUMBERS, type Mark, type StudentEntry } from "@/content/students";

// One card per student, read straight off the lesson log. Attributes, never
// verdicts: the latest mark, the trend, the teacher's own words, the count of
// lessons. A student is a number and initials, nothing more. Hidden while
// content/students.ts lists nobody.

function Sparkline({ marks }: { marks: Mark[] }) {
  const values = marks.map((m) => m.value);
  const lo = Math.min(...values) - 4;
  const hi = Math.max(...values) + 4;
  const w = 88;
  const h = 28;
  const pts = values
    .map((v, i) => `${3 + (i * (w - 6)) / (values.length - 1)},${3 + ((hi - v) / (hi - lo)) * (h - 6)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-[88px]" role="img" aria-label={`Scores ${values.join(", ")}`}>
      <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w - 3} cy={3 + ((hi - values[values.length - 1]) / (hi - lo)) * (h - 6)} r="3" fill="var(--color-accent)" />
    </svg>
  );
}

function GradeChip({ grade }: { grade: StudentEntry["grade"] }) {
  const label = grade === "alumni" ? "Alumni" : `Grade ${grade}`;
  return (
    <span
      className={`whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
        grade === "alumni" ? "bg-dark text-text-on-dark" : "bg-accent-bg text-accent-muted"
      }`}
    >
      {label}
    </span>
  );
}

function Marks({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-faint">No test logged yet</p>
    );
  }
  const latest = marks[marks.length - 1];
  const sameCourse = marks.filter((m) => m.course === latest.course);
  const first = sameCourse[0];
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="font-serif text-[36px] leading-none text-accent">
          {latest.value}
          <span className="text-[18px] text-text-faint">%</span>
        </p>
        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">
          {latest.course} · {latest.label}
        </p>
      </div>
      {sameCourse.length >= 2 && first && (
        <div className="text-right">
          <Sparkline marks={sameCourse} />
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
            from {first.value} on {first.label}
          </p>
        </div>
      )}
    </div>
  );
}

function StudentCard({ student }: { student: StudentEntry }) {
  return (
    <li className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-muted">Student {student.number}</p>
          <h3 className="mt-1 font-serif text-[26px] leading-tight text-dark">{student.initials}</h3>
          {student.courses.length > 0 && (
            <p className="mt-1 text-[13px] leading-snug text-text-muted">{student.courses.join(" · ")}</p>
          )}
        </div>
        <GradeChip grade={student.grade} />
      </header>

      <Marks marks={student.marks} />

      {student.status && (
        <blockquote className="flex-1 border-l-2 border-border-accent pl-3.5 text-[14px] leading-[1.6] text-text-secondary">
          {student.status}
          {student.statusDate && (
            <footer className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
              Logged {student.statusDate}
            </footer>
          )}
        </blockquote>
      )}

      <footer className="border-t border-border pt-3 text-[12.5px] text-text-muted">
        {student.outcome ? (
          <span className="font-semibold text-dark">→ {student.outcome}</span>
        ) : (
          <span>
            {student.lessonsLogged} {student.lessonsLogged === 1 ? "lesson" : "lessons"} logged
            {student.since && ` · since ${student.since}`}
          </span>
        )}
      </footer>
    </li>
  );
}

export default function StudentRoster() {
  if (LISTED_STUDENTS.length === 0) return null;

  return (
    <section id="roster" className="mx-auto max-w-[1160px] scroll-mt-6 px-5 pb-16 pt-14 md:px-10 md:pb-24 md:pt-20">
      <p className="eyebrow">The roster</p>
      <h2 className="shead mt-3.5 text-[34px] md:text-[46px]">Every student, and how they are doing</h2>
      <p className="mx-auto mt-3.5 max-w-[58ch] text-center text-[16px] leading-relaxed text-text-muted">
        Every lesson since April 2026 is logged within 24 hours: what was covered, the latest test
        score, and where the next lesson starts. This is that log, one card per student, in the
        teachers&apos; own words. Students are numbered in order of enrolment and shown by
        initials only.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LISTED_STUDENTS.map((student) => (
          <StudentCard key={student.id} student={student} />
        ))}
      </ul>

      <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
        Updated {ROSTER_UPDATED}
        {PRE_LOG_COUNT > 0 && ` · students 1 to ${PRE_LOG_COUNT} predate the log`}
        {UNLOGGED_NUMBERS.length > 0 && ` · ${UNLOGGED_NUMBERS.join(" and ")} enrolled, nothing logged yet`}
      </p>
    </section>
  );
}
