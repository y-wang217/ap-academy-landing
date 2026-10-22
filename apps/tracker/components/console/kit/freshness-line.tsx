import { hhmm } from "../../../lib/console/format";
import type { PanelView } from "../../../lib/console/panel-view";

/** When the panel was last checked and last read successfully (REQ-55 AC3). */
export function FreshnessLine({ result }: { result: PanelView<unknown> }) {
  return (
    <p className="console-fresh">
      {result.lastCheckedAt && <span>{`Checked ${hhmm(result.lastCheckedAt)}`}</span>}
      <span>{result.lastSuccessfulFetchAt ? `Last success ${hhmm(result.lastSuccessfulFetchAt)}` : "No successful read yet"}</span>
    </p>
  );
}
