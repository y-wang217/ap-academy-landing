"use client";

import { useId, useState } from "react";
import type { HistoryPoint } from "@/lib/domain/history";
import { monthDay, percent, points as pointsText } from "@/lib/format";

export type ChartMark = { id: string; title: string; scoreEarned: number; scorePossible: number };

type Tone = "ok" | "neutral" | "warn";
const STROKE: Record<Tone, string> = { ok: "stroke-ok", neutral: "stroke-text-muted", warn: "stroke-warn" };
const FILL: Record<Tone, string> = { ok: "fill-ok", neutral: "fill-text-muted", warn: "fill-warn" };

// One fixed drawing box; the SVG scales with its container, so shapes stay round.
const W = 320;
const H = 128;
const PAD = { top: 10, right: 12, bottom: 20, left: 34 };
const DAY = 86_400_000;
const MIN_SPAN_DAYS = 28;

const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/**
 * A course's grade over time against its target (ADR 0031). One series, so
 * the pill beside it is the legend. Values stay in text ink; only the line
 * and dots wear the tone. Tapping or focusing a dot lists the marks behind it.
 */
export function TrendChart({
  points, target, tone, marks, today, label,
}: {
  points: HistoryPoint[];
  target: number | null;
  tone: Tone;
  /** Scored marks by id, for the reveal. */
  marks: ChartMark[];
  /** ISO date; the right edge of the time axis. */
  today: string;
  /** Names the chart for assistive tech, e.g. "MHF4U grade over time". */
  label: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();

  const lowest = Math.min(100, ...points.map((p) => p.grade), target ?? 100);
  const yMin = Math.min(60, Math.floor((lowest - 5) / 10) * 10);
  const yTicks: number[] = [];
  for (let v = yMin; v <= 100; v += 20) yTicks.push(v);

  const xEnd = Math.max(utc(today), ...points.map((p) => utc(p.date)));
  const xStart = Math.min(xEnd - MIN_SPAN_DAYS * DAY, ...points.map((p) => utc(p.date)));
  const x = (ms: number) => PAD.left + ((ms - xStart) / Math.max(1, xEnd - xStart)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((100 - v) / (100 - yMin)) * (H - PAD.top - PAD.bottom);
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => xStart + f * (xEnd - xStart));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(utc(p.date)).toFixed(1)},${y(p.grade).toFixed(1)}`).join(" ");
  const markOf = new Map(marks.map((m) => [m.id, m]));
  const open = selected !== null ? points[selected] : null;

  const pick = (i: number) => setSelected((s) => (s === i ? null : i));

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{label}</title>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" className="fill-text-muted" fontSize={10}>
              {v}%
            </text>
          </g>
        ))}
        {xTicks.map((ms, i) => (
          <text key={i} x={x(ms)} y={H - 5} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-text-muted" fontSize={10}>
            {monthDay(new Date(ms).toISOString())}
          </text>
        ))}
        {target !== null && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} className="stroke-text-muted" strokeWidth={1} strokeDasharray="4 3" />
        )}
        {points.length === 0 ? (
          <text x={PAD.left + (W - PAD.left - PAD.right) / 2} y={PAD.top + (H - PAD.top - PAD.bottom) / 2 + 4} textAnchor="middle" className="fill-text-muted" fontSize={12}>
            No grades yet
          </text>
        ) : (
          <>
            <path d={path} fill="none" className={STROKE[tone]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => {
              const cx = x(utc(p.date));
              const cy = y(p.grade);
              const isOpen = selected === i;
              return (
                <g key={p.date}>
                  <circle cx={cx} cy={cy} r={isOpen ? 6 : 4} className={`${FILL[tone]} stroke-surface`} strokeWidth={2} />
                  <circle
                    cx={cx} cy={cy} r={12} fill="transparent" role="button" tabIndex={0}
                    aria-label={`${monthDay(p.date)}: ${percent(p.grade)}`} aria-expanded={isOpen}
                    className="cursor-pointer focus:outline-2 focus:outline-accent"
                    onClick={() => pick(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pick(i);
                      }
                    }}
                  />
                </g>
              );
            })}
          </>
        )}
      </svg>
      {open && (
        <div className="rounded-lg bg-background px-3 py-2 text-sm" role="status">
          <p className="font-medium">
            {monthDay(open.date)} · grade after these marks {percent(open.grade)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-text-muted">
            {open.assessmentIds.map((id) => {
              const m = markOf.get(id);
              if (!m) return null;
              return (
                <li key={id}>
                  {m.title} · {pointsText(m.scoreEarned)} / {pointsText(m.scorePossible)} · {percent((m.scoreEarned / m.scorePossible) * 100)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
