"use client";

import { useCallback, useEffect, useState } from "react";
import { planCopy } from "@/lib/domain/schedule/copy-day";
import { addDays } from "@/lib/domain/schedule/wallclock";
import { api } from "@/lib/scheduler/api-client";
import { WEEKDAY_NAMES, dayLabel, formatDayHeading } from "@/lib/view/availability-text";
import { Card, Empty, Field, Notice, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type Win = { id: string; staffId: string; weekday: number; startTime: string; endTime: string; effectiveFrom: string; effectiveUntil: string | null; updatedAt: string };
type Exc = { id: string; staffId: string; onDate: string; kind: "time_off" | "extra"; startTime: string | null; endTime: string | null };
type Day = { date: string; state: "available" | "unavailable" | "not_entered"; intervals: { start: string; end: string }[]; availableMinutes: number };
type Data = { windows: Win[]; exceptions: Exc[]; days: Day[] };
type Flash = { tone: "ok" | "error" | "info"; text: string } | null;

const timeInput = inputClass.replace("w-full", "w-32");

/**
 * The availability editor. Every change goes to the server and then reloads the
 * server's state, so an unsaved change is never shown as saved (it keeps no
 * local copy of the saved data). Saving never touches booked classes.
 */
export function AvailabilityEditor({ staffId, scope, today }: { staffId: string; scope: "admin" | "teacher"; today: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const [outside, setOutside] = useState(0);
  const [drafts, setDrafts] = useState<number[]>([]);

  const load = useCallback(async () => {
    const q = (to: number) => `from=${today}&to=${addDays(today, to)}&staffId=${staffId}`;
    const [preview, list, conflicts] = await Promise.all([
      api.get<{ windows: Win[]; days: Day[]; exceptions: Exc[] }>(`/availability?${q(13)}`),
      api.get<{ exceptions: Exc[] }>(`/availability?${q(91)}`),
      api.get<{ conflicts: unknown[] }>(`/conflicts?${q(91)}`),
    ]);
    if (!preview.ok || !list.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setData({ windows: preview.data.windows, days: preview.data.days, exceptions: list.data.exceptions });
    setOutside(conflicts.ok ? conflicts.data.conflicts.length : 0);
  }, [staffId, today]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of server state
    void load();
  }, [load]);

  async function act(run: () => Promise<{ ok: boolean; message?: string; stale?: boolean }[] | { ok: boolean; message?: string; stale?: boolean }>, savedText = "Saved", failText?: string) {
    setBusy(true);
    setFlash(null);
    const out = await run();
    const results = Array.isArray(out) ? out : [out];
    const bad = results.find((r) => !r.ok);
    await load();
    setBusy(false);
    if (!bad) setFlash({ tone: "ok", text: savedText });
    else setFlash({ tone: "error", text: failText ?? bad.message ?? "That did not save. Please try again." });
    return !bad;
  }

  if (loadError) {
    return (
      <Notice tone="error">
        <p>Could not load availability.</p>
        <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={() => void load()}>Retry</button>
      </Notice>
    );
  }
  if (!data) return <p className="text-sm text-text-muted">Loading…</p>;

  const active = data.windows.filter((w) => !w.effectiveUntil || w.effectiveUntil >= today);
  const nothingEntered = active.length === 0 && data.exceptions.length === 0;

  const saveWindow = (w: { id?: string; updatedAt?: string }, weekday: number, f: { start: string; end: string; from: string; until: string }, key: string) =>
    act(async () => {
      const body = { startTime: f.start, endTime: f.end, effectiveFrom: f.from, effectiveUntil: f.until || null };
      return w.id
        ? api.send("PATCH", `/availability/windows/${w.id}`, key, { ...body, expectedUpdatedAt: w.updatedAt })
        : api.send("POST", "/availability/windows", key, { ...body, staffId, weekday });
    });

  return (
    <div className="flex flex-col gap-6">
      {scope === "teacher" && outside > 0 && (
        <Notice tone="warn">{outside} of your classes {outside === 1 ? "is" : "are"} outside your hours. Charlie will sort {outside === 1 ? "it" : "them"} out.</Notice>
      )}
      <div aria-live="polite">{flash && <Notice tone={flash.tone}>{flash.text}</Notice>}</div>
      {nothingEntered && <Empty>You haven&apos;t entered any hours yet. Add your first hours below.</Empty>}

      <Card title="Weekly hours">
        <ul className="flex flex-col divide-y divide-border">
          {WEEKDAY_NAMES.map((name, i) => {
            const weekday = i + 1;
            const rows = active.filter((w) => w.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <li key={name} className="flex flex-col gap-2 py-3">
                <h3 className="text-sm font-semibold">{name}</h3>
                {rows.length === 0 && !drafts.includes(weekday) && <p className="text-sm text-text-muted">No hours</p>}
                {rows.map((w, n) => (
                  <WindowRow
                    key={`${w.id}:${w.updatedAt}`} label={`${name} window ${n + 1}`} busy={busy} today={today}
                    initial={{ start: w.startTime, end: w.endTime, from: w.effectiveFrom, until: w.effectiveUntil ?? "" }}
                    onSave={(f) => saveWindow(w, weekday, f, `patch:${w.id}:${f.start}-${f.end}-${f.from}-${f.until}`)}
                    onRemove={() => act(() => api.send("DELETE", `/availability/windows/${w.id}`, `del:${w.id}`), "Removed")}
                  />
                ))}
                {drafts.includes(weekday) && (
                  <WindowRow
                    key={`draft-${weekday}`} label={`${name} new window`} busy={busy} today={today} draft
                    initial={{ start: "09:00", end: "12:00", from: today, until: "" }}
                    onSave={async (f) => {
                      const ok = await saveWindow({}, weekday, f, `add:${weekday}:${f.start}-${f.end}-${f.from}-${f.until}`);
                      if (ok) setDrafts((d) => d.filter((x) => x !== weekday));
                    }}
                    onRemove={async () => setDrafts((d) => d.filter((x) => x !== weekday))}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryButtonClass} disabled={busy || drafts.includes(weekday)} onClick={() => setDrafts((d) => [...d, weekday])}>
                    + Add hours<span className="sr-only"> on {name}</span>
                  </button>
                  {rows.length > 0 && (
                    <CopyControl
                      source={weekday} busy={busy}
                      onCopy={(targets, replace) => act(async () => {
                        const plan = planCopy(active, weekday, targets, { replace }, today);
                        const results = [];
                        for (const id of plan.deletes) results.push(await api.send("DELETE", `/availability/windows/${id}`, `del:${id}`));
                        for (const c of plan.creates) {
                          results.push(await api.send("POST", "/availability/windows", `copy:${c.weekday}:${c.startTime}-${c.endTime}-${c.effectiveFrom}-${c.effectiveUntil ?? ""}`, { ...c, staffId }));
                        }
                        return results;
                      }, "Copied", "Some days were not copied. Showing what is saved.")}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <ExceptionsCard
        exceptions={data.exceptions} busy={busy} today={today}
        onAdd={(e) => act(() => api.send("POST", "/availability/exceptions", `exc:${e.onDate}:${e.kind}:${e.startTime}-${e.endTime}`, { ...e, staffId }))}
        onRemove={(id) => act(() => api.send("DELETE", `/availability/exceptions/${id}`, `delexc:${id}`), "Removed")}
      />

      <Card title="Next 14 days">
        <ul className="flex flex-col divide-y divide-border">
          {data.days.map((d) => {
            const off = data.exceptions.some((e) => e.onDate === d.date && e.kind === "time_off");
            const l = dayLabel(d, off);
            return (
              <li key={d.date} className="flex gap-2 py-2 text-sm">
                <span className="w-24 shrink-0 font-medium">{formatDayHeading(d.date)}</span>
                <span aria-hidden="true">{l.icon}</span>
                <span>{l.text}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

type Form = { start: string; end: string; from: string; until: string };

function WindowRow({ label, initial, busy, draft, today, onSave, onRemove }: {
  label: string; initial: Form; busy: boolean; draft?: boolean; today: string;
  onSave: (f: Form) => Promise<unknown>; onRemove: () => Promise<unknown>;
}) {
  const [f, setF] = useState(initial);
  const dirty = draft || f.start !== initial.start || f.end !== initial.end || f.from !== initial.from || f.until !== initial.until;
  const invalid = f.end <= f.start || (f.until !== "" && f.until < f.from);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background p-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Start" name={`${label}-start`}>
          <input id={`${label}-start`} aria-label={`${label} start`} type="time" step={300} className={timeInput} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </Field>
        <Field label="End" name={`${label}-end`}>
          <input id={`${label}-end`} aria-label={`${label} end`} type="time" step={300} className={timeInput} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </Field>
        <button type="button" className={buttonClass} disabled={busy || !dirty || invalid} onClick={() => void onSave(f)}>
          Save<span className="sr-only"> {label}</span>
        </button>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void onRemove()}>
          {draft ? "Cancel" : "Remove"}<span className="sr-only"> {label}</span>
        </button>
      </div>
      {invalid && <p className="text-xs text-error">End must be after start{f.until !== "" && f.until < f.from ? ", and the end date after the start date" : ""}.</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-text-muted">More<span className="sr-only"> options for {label}</span></summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Field label="Starts" name={`${label}-from`}>
            <input id={`${label}-from`} type="date" className={inputClass.replace("w-full", "w-44")} value={f.from} min={draft ? today : undefined} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </Field>
          <Field label="Ends (optional)" name={`${label}-until`}>
            <input id={`${label}-until`} type="date" className={inputClass.replace("w-full", "w-44")} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
          </Field>
        </div>
      </details>
    </div>
  );
}

function CopyControl({ source, busy, onCopy }: { source: number; busy: boolean; onCopy: (targets: number[], replace: boolean) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<number[]>([]);
  const [replace, setReplace] = useState(false);
  if (!open) {
    return <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setOpen(true)}>Copy to…<span className="sr-only"> from {WEEKDAY_NAMES[source - 1]}</span></button>;
  }
  return (
    <fieldset className="flex w-full flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Copy {WEEKDAY_NAMES[source - 1]} to</legend>
      <div className="flex flex-wrap gap-3">
        {WEEKDAY_NAMES.map((n, i) => i + 1 !== source && (
          <label key={n} className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={targets.includes(i + 1)} onChange={(e) => setTargets(e.target.checked ? [...targets, i + 1] : targets.filter((t) => t !== i + 1))} />
            {n}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace hours already on those days
      </label>
      <div className="flex gap-2">
        <button type="button" className={buttonClass} disabled={busy || targets.length === 0} onClick={() => void onCopy(targets, replace).then(() => { setOpen(false); setTargets([]); })}>Copy</button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </fieldset>
  );
}

function ExceptionsCard({ exceptions, busy, today, onAdd, onRemove }: {
  exceptions: Exc[]; busy: boolean; today: string;
  onAdd: (e: { onDate: string; kind: "time_off" | "extra"; startTime: string | null; endTime: string | null }) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"time_off" | "extra">("time_off");
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const whole = kind === "time_off" && allDay;
  const invalid = !date || date < today || (!whole && end <= start);
  const upcoming = [...exceptions].sort((a, b) => a.onDate.localeCompare(b.onDate) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  return (
    <Card title="Days off and extra hours">
      {upcoming.length === 0 ? <Empty>Nothing coming up.</Empty> : (
        <ul className="flex flex-col divide-y divide-border">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                {formatDayHeading(e.onDate)} · {e.kind === "time_off" ? "Time off" : "Extra hours"}
                {e.startTime && e.endTime ? ` ${e.startTime}-${e.endTime}` : e.kind === "time_off" ? " (all day)" : ""}
              </span>
              <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void onRemove(e.id)}>
                Remove<span className="sr-only"> {formatDayHeading(e.onDate)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(ev) => { ev.preventDefault(); if (!invalid) void onAdd({ onDate: date, kind, startTime: whole ? null : start, endTime: whole ? null : end }); }}>
        <Field label="Date" name="exc-date"><input id="exc-date" type="date" className={inputClass.replace("w-full", "w-44")} min={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Type" name="exc-kind">
          <select id="exc-kind" className={inputClass.replace("w-full", "w-40")} value={kind} onChange={(e) => setKind(e.target.value as "time_off" | "extra")}>
            <option value="time_off">Time off</option>
            <option value="extra">Extra hours</option>
          </select>
        </Field>
        {kind === "time_off" && (
          <label className="flex items-center gap-1 pb-3 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />All day</label>
        )}
        {!whole && (
          <>
            <Field label="From" name="exc-start"><input id="exc-start" type="time" step={300} className={timeInput} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="To" name="exc-end"><input id="exc-end" type="time" step={300} className={timeInput} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </>
        )}
        <button type="submit" className={buttonClass} disabled={busy || invalid}>Add</button>
      </form>
    </Card>
  );
}
