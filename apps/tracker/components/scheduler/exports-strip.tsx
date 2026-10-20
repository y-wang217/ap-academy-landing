"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { Notice, secondaryButtonClass } from "@/components/ui";
import { api } from "@/lib/scheduler/api-client";
import { ExportsResponse } from "@/lib/scheduler/schemas";
import { LOAD_FAILED, REFRESH_FAILED, shouldPoll, STRIP_TITLE, stripLine, stripState } from "@/lib/view/exports-text";

const POLL_MS = 30_000;

/**
 * Notion exports that are not done (REQ-35 AC11): failed, uncertain, or
 * waiting longer than ten minutes, each with a Retry. Hidden until the first
 * answer and whenever nothing is open, so the week grid never jumps.
 * `reloadKey` changes after every save, so the list follows the editor.
 */
export function ExportsStrip({ reloadKey }: { reloadKey: number }) {
  const [state, dispatch] = useReducer(stripState, { kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<unknown>("/exports");
    const parsed = r.ok ? ExportsResponse.safeParse(r.data) : null;
    dispatch(parsed?.success ? { type: "loaded", rows: parsed.data.exports } : { type: "load_failed" });
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const polling = shouldPoll(state);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [polling, load]);

  async function retry(id: string) {
    if (busy) return;
    setBusy(id);
    setRetryError(null);
    const r = await api.send("POST", "/exports/retry", `export-retry:${id}`, { id });
    if (!r.ok) setRetryError("Retry did not work.");
    setBusy(null);
    await load();
  }

  if (state.kind === "loading" || state.kind === "empty") return null;
  if (state.kind === "failed") {
    return (
      <Notice tone="warn">
        <p className="flex flex-wrap items-center gap-2">
          <span>{LOAD_FAILED}</span>
          <button type="button" className={secondaryButtonClass} onClick={() => void load()}>Reload</button>
        </p>
      </Notice>
    );
  }
  return (
    <section aria-labelledby="exports-title" className="rounded-xl border border-border bg-surface p-3 text-sm">
      <h2 id="exports-title" className="font-semibold">{STRIP_TITLE}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {state.rows.map((row) => {
          const line = stripLine(row);
          return (
            <li key={line.id} data-export={line.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{line.label}</span>
              <span className="text-text-muted">{line.state}</span>
              <button type="button" className={secondaryButtonClass} disabled={busy !== null} aria-label={`${line.action}: ${line.label}`} onClick={() => void retry(line.id)}>
                {busy === line.id ? "Retrying…" : line.action}
              </button>
            </li>
          );
        })}
      </ul>
      {state.refreshFailed && <p className="mt-2 text-text-muted">{REFRESH_FAILED}</p>}
      {retryError && <p className="mt-2 text-text-muted">{retryError}</p>}
    </section>
  );
}
