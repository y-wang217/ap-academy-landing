"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { dayLabel, whenLabel } from "../../../lib/console/sales-queue";
import { FILTERS, filterCounts, queueKeyTarget, retainedView, selectedOf, visibleItems } from "../../../lib/console/sales-state";
import type { SalesLead, SalesQueue } from "../../../lib/console/sales-view";
import { localDateOf } from "../../../lib/time";
import { InstrumentPanel, type PanelFrame } from "../kit/instrument-panel";
import { OutcomeForm } from "./outcome-form";
import { useSales } from "./sales-provider";

const inField = (target: EventTarget | null) => target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const dateOf = (value: string | null) => {
  const d = localDateOf(value);
  return d === null ? null : dayLabel(d);
};
const openLead = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The Rolodex (REQ-57 AC4, AC8): verified fields only; a missing one is left out unless the card names its text. */
function Rolodex({ lead }: { lead: SalesLead }) {
  const due = whenLabel(lead.nextActionDue);
  const owner = lead.ownerState === "unassigned" ? "Unassigned" : lead.ownerState === "unknown" ? "Unknown staff" : lead.ownerName;
  const touch = lead.lastTouch;
  const trial = lead.trial;
  const report = (text: string | null) => text ?? "No trial report yet";
  const milestones: [string, string | null][] = [
    ["Contacted", dateOf(lead.contactedAt)], ["Trial booked", dateOf(lead.trialBookedAt)], ["Trial attended", dateOf(lead.trialAttendedAt)], ["Closed", dateOf(lead.closedAt)],
  ];
  return (
    <div data-rolodex="" className="console-sales-rolodex" aria-live="polite">
      <p className="console-sales-name">{lead.name}</p>
      <dl className="console-sales-fields">
        {lead.grade && <Row label="Grade" value={lead.grade} />}
        {lead.subjects.length > 0 && <Row label="Subjects" value={lead.subjects.join(", ")} />}
        <Row label="Stage" value={lead.stage} />
        <Row label="Owner" value={owner} />
        {lead.nextAction && <Row label="Next action" value={due ? `${lead.nextAction}, ${due}` : lead.nextAction} />}
        {lead.attempts !== null && <Row label="Attempts" value={String(lead.attempts)} />}
        <Row
          label="Last touch"
          value={
            touch.state === "found"
              ? [touch.type, touch.outcome, whenLabel(touch.when), touch.staffName].filter(Boolean).join(", ") + (touch.note ? `: ${touch.note}` : "")
              : touch.state === "none"
                ? "No touches in the last 90 days"
                : "Touch history unavailable"
          }
        />
        {trial && (
          <>
            {trial.trialTime && <Row label="Trial time" value={whenLabel(trial.trialTime)} />}
            {trial.trialTeacherName && <Row label="Trial teacher" value={trial.trialTeacherName} />}
            {trial.level && <Row label="Level" value={trial.level} />}
            <Row label="Major gaps" value={report(trial.majorGaps)} />
            {trial.recommendedPlan && <Row label="Recommended plan" value={trial.recommendedPlan} />}
            <Row label="Trial summary" value={report(trial.trialSummary)} />
            <Row
              label="Trial diagnosis"
              value={
                trial.lesson.state === "found"
                  ? report(trial.lesson.diagnosis)
                  : trial.lesson.state === "none"
                    ? "No trial lesson logged"
                    : "Trial lessons unavailable"
              }
            />
            {trial.lesson.state === "found" && trial.lesson.preferredDays.length > 0 && <Row label="Preferred lesson day" value={trial.lesson.preferredDays.join(", ")} />}
          </>
        )}
        {lead.source && <Row label="Source" value={lead.source} />}
        {milestones.filter(([, v]) => v !== null).map(([label, v]) => (
          <Row key={label} label={label} value={v} />
        ))}
      </dl>
      <a href={lead.pageUrl} target="_blank" rel="noopener noreferrer" className="console-sales-open">
        Open in Notion
      </a>
    </div>
  );
}

/**
 * The Sales NEXT panel (REQ-57): filters, the exception line, the ranked
 * queue as a listbox with exactly one selected lead, and the Rolodex for it.
 * Enter and the link open the lead's Notion page; the outcome form under the
 * Rolodex (REQ-61) is the only write, and it never calls or texts anyone.
 */
export function NextLead(frame: PanelFrame) {
  const { state, dispatch, retry } = useSales();
  const filters = useRef<HTMLFieldSetElement>(null);
  const result = retainedView(state);
  const visible = visibleItems(state);
  const selectedId = selectedOf(state);
  const selected = visible.find((i) => i.id === selectedId) ?? null;
  const counts = filterCounts(state);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || inField(e.target)) return;
      const panel = document.querySelector<HTMLElement>('[data-mode-panel="sales"]');
      if (panel && panel.hidden) return;
      const checked = filters.current?.querySelector<HTMLInputElement>("input:checked");
      if (!checked) return;
      e.preventDefault();
      checked.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onListKey = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.key === "Enter") {
      if (selected) openLead(selected.pageUrl);
      e.preventDefault();
      return;
    }
    if (queueKeyTarget(e.key, 0, visible.length) === null) return;
    e.preventDefault();
    dispatch({ type: "move", key: e.key });
  };

  const controls = (data: SalesQueue | null) => (
    <div className="console-sales-controls">
      <fieldset ref={filters} className="console-sales-filters">
        <legend>Filter the queue</legend>
        {FILTERS.map((f) => (
          <label key={f.key}>
            <input type="radio" name="sales-filter" value={f.key} checked={state.filter === f.key} onChange={() => dispatch({ type: "setFilter", filter: f.key })} />
            {`${f.label} ${counts[f.key]}`}
          </label>
        ))}
      </fieldset>
      {data && (
        <div className="console-sales-status">
          {data.exceptions.length === 0 ? (
            <p className="console-note">No exceptions</p>
          ) : (
            <details className="console-sales-exceptions">
              <summary>{plural(data.exceptions.length, "exception", "exceptions")}</summary>
              <ul>
                {data.exceptions.map((x) => (
                  <li key={x.id}>
                    {`${x.name}, ${x.stage ?? "no stage"}: ${x.reason} `}
                    <a href={x.pageUrl} target="_blank" rel="noopener noreferrer">
                      Open in Notion
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.mergedDuplicates > 0 && <p className="console-note">{`${plural(data.mergedDuplicates, "duplicate row", "duplicate rows")} merged`}</p>}
        </div>
      )}
      {state.fetch === "busy" && (
        <p className="console-note" aria-live="polite">
          Refreshing
        </p>
      )}
      {state.failure && (
        <button type="button" className="console-sales-retry" onClick={retry} disabled={state.fetch === "busy"}>
          Retry
        </button>
      )}
    </div>
  );

  return (
    <InstrumentPanel {...frame} result={result} idle={controls(result.data)}>
      {(data) => (
        <>
          {controls(data)}
          {visible.length === 0 ? (
            <p className="console-note">
              {data.items.length > 0 ? "No leads match this filter" : `Queue may be incomplete${result.staleReason ? `: ${result.staleReason}` : ""}`}
            </p>
          ) : (
            <div className="console-sales-body">
              <ol
                role="listbox"
                tabIndex={0}
                aria-label="Lead queue"
                aria-activedescendant={selectedId ? `sales-lead-${selectedId}` : undefined}
                onKeyDown={onListKey}
                data-panel-value=""
                className="console-rows console-sales-queue"
              >
                {visible.map((item) => (
                  <li
                    key={item.id}
                    id={`sales-lead-${item.id}`}
                    role="option"
                    aria-selected={item.id === selectedId}
                    data-href={item.pageUrl}
                    data-selected={item.id === selectedId ? "" : undefined}
                    onClick={() => dispatch({ type: "select", id: item.id })}
                    className="console-row console-sales-option"
                  >
                    <div className="console-row-text">
                      <p className="console-row-title">{item.name}</p>
                      <p className="console-row-reason">{item.priorityReason}</p>
                    </div>
                    {item.id === selectedId && <span className="console-next-tag">NEXT</span>}
                  </li>
                ))}
              </ol>
              {selected && (
                <div className="console-sales-detail">
                  <Rolodex lead={selected} />
                  <OutcomeForm key={selected.id} lead={selected} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </InstrumentPanel>
  );
}
