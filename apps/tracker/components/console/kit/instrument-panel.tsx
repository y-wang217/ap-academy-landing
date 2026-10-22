import type { ReactNode } from "react";
import type { PanelView } from "../../../lib/console/panel-view";
import { FailureState } from "./failure-state";
import { FreshnessLine } from "./freshness-line";
import { StatusBadge } from "./status-badge";

/** What every kit component takes besides its result. `id` is the slot id. */
export type PanelFrame = { id: string; title: string; emptyText: string; primary?: boolean; retryHref?: string; headingId?: string };

/**
 * The console's panel frame (REQ-55 AC3, AC12): a focusable section named by
 * its h2, a status badge, a body switched on the result's status and a
 * freshness line. Only ready and stale render the caller's value; reasons and
 * messages are printed verbatim. `idle` is the instrument's empty dial,
 * shown when there is no value.
 */
export function InstrumentPanel<T>({
  id,
  title,
  emptyText,
  primary,
  retryHref = "?",
  headingId,
  result,
  idle,
  children,
}: PanelFrame & { result: PanelView<T>; idle?: ReactNode; children: (data: T) => ReactNode }) {
  const heading = headingId ?? `panel-${id}-title`;
  const value = result.data === null ? null : children(result.data);
  let body: ReactNode;
  switch (result.status) {
    case "ready":
      body = value;
      break;
    case "stale":
      body = (
        <>
          {value}
          {result.staleReason && <p className="console-note console-note-stale">{result.staleReason}</p>}
        </>
      );
      break;
    case "empty":
      body = (
        <>
          {idle}
          <p className="console-note">{emptyText}</p>
        </>
      );
      break;
    case "loading":
      body = (
        <>
          {idle}
          <div className="console-skeleton" aria-hidden="true" />
          <p className="console-note">Loading</p>
        </>
      );
      break;
    case "error":
      body = (
        <>
          {idle}
          <FailureState title={title} result={result} retryHref={retryHref} />
        </>
      );
      break;
    case "unverifiable":
      body = (
        <>
          {idle}
          {result.staleReason && <p className="console-note">{result.staleReason}</p>}
        </>
      );
      break;
  }
  return (
    <section
      data-panel={id}
      tabIndex={0}
      aria-labelledby={heading}
      aria-busy={result.status === "loading" ? true : undefined}
      data-status={result.status}
      data-primary={primary ? "" : undefined}
      className="console-panel"
      style={{ gridArea: id }}
    >
      <header className="console-panel-head">
        <h2 id={heading}>{title}</h2>
        <StatusBadge status={result.status} />
      </header>
      <div className="console-panel-body">{body}</div>
      <FreshnessLine result={result} />
    </section>
  );
}
