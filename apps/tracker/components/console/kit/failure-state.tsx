import { hhmm } from "../../../lib/console/format";
import type { PanelView } from "../../../lib/console/panel-view";

/**
 * A panel whose read failed: what failed, the source's message verbatim, the
 * last success and a Retry link that reloads the server read (REQ-55 AC3).
 */
export function FailureState({ title, result, retryHref }: { title: string; result: PanelView<unknown>; retryHref: string }) {
  return (
    <div className="console-failure">
      <p className="console-failure-title">{`Cannot load ${title}`}</p>
      {(result.errorMessage ?? result.staleReason) && <p className="console-note">{result.errorMessage ?? result.staleReason}</p>}
      <p className="console-note">{`Last success ${result.lastSuccessfulFetchAt ? hhmm(result.lastSuccessfulFetchAt) : "never"}`}</p>
      <a href={retryHref}>Retry</a>
    </div>
  );
}
