import { featuredSeries, LISTED_STUDENTS, studentLabel } from "@/content/students";

// The hero illustration is a lesson log card. With a roster it draws one real
// student's scores in one course; with none it shows the shape of an entry and
// claims nothing. Both states are the same card so the layout never shifts.

const W = 320;
const H = 120;
const PAD_X = 22;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div
      className={`absolute flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-semibold text-dark shadow-[0_10px_30px_-14px_rgba(34,28,23,0.4)] ${className}`}
    >
      <span className="h-2 w-2 flex-none rounded-full bg-accent" aria-hidden="true" />
      {children}
    </div>
  );
}

function Chart({ values, labels }: { values: number[]; labels: string[] }) {
  const lo = Math.min(60, Math.min(...values) - 6);
  const hi = 100;
  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / Math.max(values.length - 1, 1);
  const y = (v: number) => PAD_TOP + ((hi - v) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${H - PAD_BOTTOM} L${points.replaceAll(" ", " L")} L${x(values.length - 1)},${H - PAD_BOTTOM} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label={`Test scores: ${values.join(", ")}`}>
      <path d={area} fill="var(--color-accent-light)" opacity="0.7" />
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="4.5" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2.5" />
          <text x={x(i)} y={y(v) - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-dark)">
            {v}
          </text>
          <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--color-text-faint)" fontFamily="var(--font-mono)">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function EmptyLog() {
  const rows = ["Topic covered", "Test score", "Confidence (1 to 5)", "Next lesson focus"];
  return (
    <div className="mt-5 space-y-3.5" aria-hidden="true">
      {rows.map((label, i) => (
        <div key={label} className="flex items-center gap-4">
          <span className="w-[42%] font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">{label}</span>
          <span className="h-2.5 flex-1 rounded-full bg-accent-light" style={{ maxWidth: `${[78, 36, 24, 62][i]}%` }} />
        </div>
      ))}
      <svg viewBox={`0 0 ${W} 60`} className="mt-2 h-auto w-full">
        <path d="M22 44 C 90 40, 130 30, 180 24 S 270 14, 298 12" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
      </svg>
    </div>
  );
}

export default function HeroGraphic() {
  const series = featuredSeries();
  const lessons = LISTED_STUDENTS.reduce((n, s) => n + s.lessonsLogged, 0);
  const first = series?.marks[0];
  const last = series?.marks[series.marks.length - 1];

  return (
    <div className="relative mx-auto w-full max-w-[460px] pt-6 md:pt-0">
      <div aria-hidden="true" className="absolute -inset-x-4 bottom-8 top-2 rounded-[46%_54%_48%_52%/56%_44%_56%_44%] bg-accent-light/70" />

      <div className="relative -rotate-1 rounded-2xl border border-border bg-surface p-6 shadow-[0_28px_60px_-30px_rgba(34,28,23,0.45)] md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent-muted">Lesson log</p>
            <p className="mt-1.5 font-serif text-[22px] leading-tight text-dark">
              {series ? series.course : "One entry per lesson"}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">
              {series ? studentLabel(series.student) : "Filled by the teacher the same day"}
            </p>
          </div>
          {series && last && (
            <div className="text-right">
              <p className="font-serif text-[40px] leading-none text-accent">{last.value}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">latest test</p>
            </div>
          )}
        </div>

        {series ? (
          <Chart values={series.marks.map((m) => m.value)} labels={series.marks.map((m) => m.label)} />
        ) : (
          <EmptyLog />
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-border-accent pt-4">
          <span className="rounded-md bg-accent-bg px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent-muted">
            Logged within 24 h
          </span>
          <span className="rounded-md bg-accent-bg px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent-muted">
            1-on-1 · live · online
          </span>
        </div>
      </div>

      {series && first && last && last.value > first.value ? (
        <Badge className="-right-1 top-0 md:-right-5 md:-top-3">+{last.value - first.value} since {first.label}</Badge>
      ) : (
        <Badge className="-right-1 top-0 md:-right-5 md:-top-3">Grade 11 and 12</Badge>
      )}
      <Badge className="-left-1 bottom-2 md:-bottom-4 md:-left-6">
        {lessons > 0 ? `${lessons} lessons logged` : "Every lesson logged"}
      </Badge>
    </div>
  );
}
