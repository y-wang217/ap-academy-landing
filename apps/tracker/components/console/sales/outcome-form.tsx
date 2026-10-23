"use client";

import { useState, type FormEvent } from "react";
import { FORM_TEXT, locked, outcomeBody, statusOf, type FormInput, type FormStatus } from "../../../lib/console/outcome-client";
import { allowedOutcomes, CONTRACT_A, CONTRACT_C, FOLLOW_UP_ACTIONS, OUTCOME_LABELS, type Outcome } from "../../../lib/console/outcomes";
import { TUNING } from "../../../lib/domain/tuning";
import type { SalesLead } from "../../../lib/console/sales-view";
import { useSales, type OutcomeDraft } from "./sales-provider";

const EMPTY: FormInput = { outcome: "no_answer", note: "", nextAction: "", due: "" };
const withTime = (o: Outcome) => o === "call_back" || o === "follow_up";

type ViewProps = {
  lead: SalesLead;
  input: FormInput;
  status: FormStatus;
  onInput: (next: Partial<FormInput>) => void;
  onSubmit: () => void;
  onRefresh: () => void;
  onStartOver: () => void;
};

/** What the status line says, and which action it offers. */
function StatusLine({ status, lead, onRefresh, onRetry, onStartOver }: { status: FormStatus; lead: SalesLead; onRefresh: () => void; onRetry: () => void; onStartOver: () => void }) {
  switch (status.kind) {
    case "idle":
      return null;
    case "saving":
      return <p className="console-outcome-status">{FORM_TEXT.saving}</p>;
    case "done":
      return (
        <p className="console-outcome-status">
          {[FORM_TEXT.done, status.cadenceUsedUp ? FORM_TEXT.cadence : null, status.staffLinked ? null : FORM_TEXT.noStaff].filter(Boolean).join(" ")}
        </p>
      );
    case "stale":
      return (
        <p className="console-outcome-status" role="alert">
          {FORM_TEXT.stale}{" "}
          <button type="button" className="console-outcome-action" onClick={onRefresh}>
            Refresh
          </button>
        </p>
      );
    case "refused":
      return (
        <p className="console-outcome-status" role="alert">
          {status.missing.length > 0 ? `${status.message} ${status.missing.join(", ")}.` : status.message}{" "}
          {status.notionUrl && (
            <a href={status.notionUrl} target="_blank" rel="noopener noreferrer" className="console-outcome-action">
              Fill in Notion
            </a>
          )}
        </p>
      );
    case "uncertain":
      return (
        <p className="console-outcome-status" role="alert">
          {status.message}
          {status.retryAfterSeconds !== null ? ` Wait ${status.retryAfterSeconds} s.` : ""}{" "}
          <button type="button" className="console-outcome-action" onClick={onRetry}>
            Retry
          </button>
        </p>
      );
    case "failed":
      return (
        <p className="console-outcome-status" role="alert">
          {status.message}{" "}
          <button type="button" className="console-outcome-action" onClick={onStartOver}>
            Start over
          </button>
        </p>
      );
    case "not_ready":
      return (
        <p className="console-outcome-status" role="alert">
          {FORM_TEXT.notReady}
        </p>
      );
    case "blocked":
      return (
        <p className="console-outcome-status" role="alert">
          {status.message}{" "}
          <a href={lead.pageUrl} target="_blank" rel="noopener noreferrer" className="console-outcome-action">
            Open in Notion
          </a>
        </p>
      );
  }
}

/**
 * The outcome form under the Rolodex (REQ-61, tracker ADR 0076). Only the
 * outcomes the lead's Stage allows; no send, call or text control. Rendering
 * only: OutcomeForm owns the state and the request.
 */
export function OutcomeFormView({ lead, input, status, onInput, onSubmit, onRefresh, onStartOver }: ViewProps) {
  const options = allowedOutcomes(lead.stage === "" ? null : lead.stage, lead.lostReason ?? null);
  const disabled = locked(status);
  if (options.length === 0) {
    return <p className="console-note console-outcome">{`No outcome can be logged from ${lead.stage || "no Stage"}. Change the Stage in Notion first.`}</p>;
  }
  const outcome = options.includes(input.outcome) ? input.outcome : options[0];
  const contract = outcome === "trial_booked" ? CONTRACT_A : outcome === "won" ? CONTRACT_C : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled) onSubmit();
  };
  return (
    <form className="console-outcome" onSubmit={submit} aria-busy={status.kind === "saving"} noValidate>
      <fieldset className="console-outcome-choices" disabled={disabled}>
        <legend>Log outcome</legend>
        {options.map((o) => (
          <label key={o}>
            <input type="radio" name={`outcome-${lead.id}`} value={o} checked={outcome === o} onChange={() => onInput({ outcome: o })} />
            {OUTCOME_LABELS[o]}
          </label>
        ))}
      </fieldset>
      {withTime(outcome) && (
        <label className="console-outcome-field">
          {outcome === "call_back" ? "Call back at" : "Due at"}
          <input type="datetime-local" value={input.due} onChange={(e) => onInput({ due: e.target.value })} disabled={disabled} required />
        </label>
      )}
      {outcome === "follow_up" && (
        <label className="console-outcome-field">
          Next action
          <select value={input.nextAction} onChange={(e) => onInput({ nextAction: e.target.value })} disabled={disabled} required>
            <option value="">Choose</option>
            {FOLLOW_UP_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="console-outcome-field">
        Note (optional)
        <textarea
          value={input.note}
          maxLength={TUNING.consoleNoteMaxChars}
          rows={3}
          onChange={(e) => onInput({ note: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.stopPropagation();
          }}
          disabled={disabled}
        />
      </label>
      {contract && <p className="console-outcome-hint">{`${OUTCOME_LABELS[outcome]} needs in Notion: ${contract.join(", ")}`}</p>}
      {!lead.lastEditedAt && <p className="console-outcome-hint">{FORM_TEXT.noEdited}</p>}
      <div className="console-outcome-actions">
        <button type="submit" className="console-outcome-submit" disabled={disabled || !lead.lastEditedAt || status.kind === "not_ready"}>
          Log outcome
        </button>
      </div>
      <div aria-live="polite">
        <StatusLine status={status} lead={lead} onRefresh={onRefresh} onRetry={onSubmit} onStartOver={onStartOver} />
      </div>
    </form>
  );
}

/**
 * The form's state and its one request, POST /tracker/api/console/outcomes.
 * A request id is made for a new payload and kept until done, so a Retry
 * after an unconfirmed save resends the identical body. The draft lives in
 * the Sales provider, in memory only.
 */
export function OutcomeForm({ lead }: { lead: SalesLead }) {
  const { drafts, refresh, advance } = useSales();
  const [draft, setDraftState] = useState<OutcomeDraft>(() => drafts.get(lead.id) ?? { input: EMPTY, requestId: null, status: { kind: "idle" } });
  const setDraft = (next: OutcomeDraft) => {
    drafts.set(lead.id, next);
    setDraftState(next);
  };

  const onInput = (next: Partial<FormInput>) => {
    if (locked(draft.status)) return;
    setDraft({ input: { ...draft.input, ...next }, requestId: null, status: draft.status.kind === "done" ? { kind: "idle" } : draft.status });
  };

  const onSubmit = async () => {
    const options = allowedOutcomes(lead.stage === "" ? null : lead.stage, lead.lostReason ?? null);
    const input = { ...draft.input, outcome: options.includes(draft.input.outcome) ? draft.input.outcome : options[0] };
    const requestId = draft.requestId ?? crypto.randomUUID();
    const body = outcomeBody(lead, input, requestId);
    if (!body) return;
    setDraft({ input, requestId, status: { kind: "saving" } });
    let status: FormStatus;
    try {
      // basePath spelled out: a client fetch is not prefixed with /tracker.
      const res = await fetch("/tracker/api/console/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      status = statusOf(res.status, await res.json().catch(() => null));
    } catch {
      status = statusOf(0, null);
    }
    if (status.kind === "done") {
      setDraft({ input: EMPTY, requestId: null, status });
      await advance(lead.id);
      return;
    }
    // A refusal sent nothing, so a changed payload gets a new id; an unconfirmed save keeps its id for Retry.
    const keep = status.kind === "uncertain" || status.kind === "failed";
    setDraft({ input, requestId: keep ? requestId : null, status });
  };

  const onRefresh = () => {
    setDraft({ ...draft, requestId: null, status: { kind: "idle" } });
    void refresh();
  };
  const onStartOver = () => setDraft({ input: draft.input, requestId: null, status: { kind: "idle" } });

  return <OutcomeFormView lead={lead} input={draft.input} status={draft.status} onInput={onInput} onSubmit={() => void onSubmit()} onRefresh={onRefresh} onStartOver={onStartOver} />;
}
