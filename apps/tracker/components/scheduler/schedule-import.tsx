"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClass, Card, Empty, inputClass, Notice, secondaryButtonClass } from "@/components/ui";

/** The tracker is served under /tracker, and fetch does not add the base path. */
const API = "/tracker/api/scheduler";

type Line = { text: string; status: string; hint?: string };
type Plan = {
  ready: { studentId: string; name: string; lineCount: number }[];
  repair: { studentId: string; name: string; lines: Line[] }[];
  skipped: { studentId: string }[];
};
type Adopted = { studentId: string; name: string | null; syncState: "pending" | "synced" | "failed"; lastError: string | null; lastDriftText: string | null };
type Review = {
  studentId: string; name: string | null; needsReview: boolean;
  cancelled: { date: string; subject: string }[]; moved: { originalDate: string; date: string; startTime: string; subject: string }[];
  oneOff: { date: string; startTime: string; subject: string }[]; from: { date: string; subject: string }[]; until: { date: string; subject: string }[];
  sync: { state: string; stale: boolean };
};

const REASONS: Record<string, string> = {
  unparseable_day: "The day is not one the scheduler knows",
  unparseable_time: "The time could not be read",
  no_fixed_time: "No start and end time, only a length",
  invalid_duration: "The class length is not allowed (15 to 480 minutes, in 5 minute steps)",
  missing_course: "No course",
  missing_teacher: "No teacher",
  teacher_not_found: "No teacher in Staff with that full name",
  teacher_ambiguous: "More than one teacher in Staff has that name",
  teacher_inactive: "That teacher is not active",
  extra_fields: "More than three parts on the line",
  duplicate_line: "The same class is listed twice",
};

function nextMonth(): string {
  const d = new Date();
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-${String(((d.getMonth() + 1) % 12) + 1).padStart(2, "0")}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(res.status === 503 ? "Notion or the scheduler is not available right now." : "That did not work. Nothing was changed.");
  return res.json() as Promise<T>;
}

export function ScheduleImport() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [adopted, setAdopted] = useState<Adopted[]>([]);
  const [busy, setBusy] = useState<"check" | "import" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [month, setMonth] = useState(nextMonth);
  const [review, setReview] = useState<Review[] | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setBusy("check");
    setError(null);
    try {
      const r = await call<{ plan: Plan; adopted: Adopted[] }>("/import");
      setPlan(r.plan);
      setAdopted(r.adopted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const loadReview = useCallback(async (m: string) => {
    setReviewError(null);
    try {
      setReview((await call<{ students: Review[] }>(`/monthly-review?month=${m}`)).students);
    } catch (e) {
      setReview(null);
      setReviewError(e instanceof Error ? e.message : "That did not work.");
    }
  }, []);

  useEffect(() => {
    void loadReview(month);
  }, [month, loadReview]);

  async function runImport() {
    setBusy("import");
    setError(null);
    setDone(null);
    try {
      const r = await call<{ results: { status: string; summarySync: string }[] }>("/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }),
      });
      const ok = r.results.filter((x) => x.status === "adopted").length;
      const failed = r.results.length - ok;
      setDone(`${ok} imported${failed ? `, ${failed} could not be saved` : ""}.`);
      await check();
      await loadReview(month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  async function retry(studentId?: string) {
    setBusy("retry");
    setError(null);
    try {
      await call("/summaries/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studentId ? { studentId } : {}) });
      await check();
      await loadReview(month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  const ready = plan?.ready.length ?? 0;
  const repair = plan?.repair.length ?? 0;

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}

      <Card title="Import" action={<button type="button" onClick={check} disabled={busy !== null} className={secondaryButtonClass}>{busy === "check" ? "Checking..." : "Check"}</button>}>
        {!plan ? (
          <Empty>{busy === "check" ? "Checking..." : "Press Check to read the schedules in Notion."}</Empty>
        ) : ready + repair === 0 ? (
          <Empty>No schedules to import</Empty>
        ) : (
          <>
            <p>{ready} students ready, {repair} need repair.</p>
            {ready > 0 && (
              <button type="button" onClick={runImport} disabled={busy !== null} className={buttonClass}>
                {busy === "import" ? "Importing..." : `Import ${ready} students`}
              </button>
            )}
          </>
        )}
      </Card>

      {plan && plan.repair.length > 0 && (
        <Card title="Needs repair">
          <p className="text-sm text-text-muted">Fix the line in Notion, then Check again. A student is imported only when every line is clean.</p>
          <ul className="flex flex-col gap-4">
            {plan.repair.map((s) => (
              <li key={s.studentId} className="flex flex-col gap-1">
                <strong>{s.name || "Unnamed student"}</strong>
                <ul className="flex flex-col gap-1 text-sm">
                  {s.lines.map((l, i) => (
                    <li key={i}>
                      <span aria-hidden="true">{l.status === "ok" ? "✓ " : "✗ "}</span>
                      <code>{l.text}</code>
                      <span className="text-text-muted"> {l.status === "ok" ? "(ok)" : `${REASONS[l.status] ?? l.status}`}</span>
                      {l.hint && <span className="text-text-muted">. {l.hint}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Imported" action={adopted.some((a) => a.syncState !== "synced") ? <button type="button" onClick={() => retry()} disabled={busy !== null} className={secondaryButtonClass}>Sync all</button> : undefined}>
        {adopted.length === 0 ? (
          <Empty>No students imported yet</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {adopted.map((a) => (
              <li key={a.studentId} className="flex flex-col gap-1 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{a.name ?? "Student not in the Active list"}</span>
                  <span className="text-sm">
                    <span aria-hidden="true">{a.syncState === "synced" ? "✓ " : a.syncState === "failed" ? "✗ " : "… "}</span>
                    {a.syncState === "synced" ? "Synced" : a.syncState === "failed" ? "Failed" : "Pending"}
                  </span>
                </div>
                {a.syncState === "failed" && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-error">
                    <span>{a.lastError ?? "The Notion save failed."}</span>
                    <button type="button" onClick={() => retry(a.studentId)} disabled={busy !== null} className={secondaryButtonClass}>Retry</button>
                  </div>
                )}
                {a.lastDriftText && (
                  <details className="text-sm">
                    <summary>Replaced edit</summary>
                    <pre className="whitespace-pre-wrap text-text-muted">{a.lastDriftText}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Monthly review">
        <label className="flex items-center gap-2 text-sm">
          Month
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputClass} />
        </label>
        {reviewError && <Notice tone="error">{reviewError}</Notice>}
        {review && review.filter((r) => r.needsReview).length === 0 && <Empty>Nothing to check this month</Empty>}
        <ul className="flex flex-col gap-3">
          {review?.filter((r) => r.needsReview).map((r) => (
            <li key={r.studentId} className="flex flex-col gap-1 text-sm">
              <strong>{r.name ?? "Student not in the Active list"}</strong>
              {r.sync.state !== "synced" && <span>Weekly Schedule is {r.sync.state}. Sync it before the monthly run.</span>}
              {r.sync.state === "synced" && r.sync.stale && <span>Weekly Schedule is out of date. Sync it before the monthly run.</span>}
              {r.cancelled.map((c, i) => <span key={`c${i}`}>Cancelled: {c.subject} on {c.date}</span>)}
              {r.moved.map((m, i) => <span key={`m${i}`}>Moved: {m.subject} from {m.originalDate} to {m.date} at {m.startTime}</span>)}
              {r.oneOff.map((o, i) => <span key={`o${i}`}>One-off: {o.subject} on {o.date} at {o.startTime}</span>)}
              {r.from.map((f, i) => <span key={`f${i}`}>Starts {f.date}: {f.subject}</span>)}
              {r.until.map((u, i) => <span key={`u${i}`}>Ends {u.date}: {u.subject}</span>)}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
