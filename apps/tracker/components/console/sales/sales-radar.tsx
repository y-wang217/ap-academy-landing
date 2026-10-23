"use client";

import { retainedRadar } from "../../../lib/console/sales-state";
import type { PanelFrame } from "../kit/instrument-panel";
import { Radar } from "../kit/radar";
import { useSales } from "./sales-provider";

/** The Sales radar (REQ-57 AC9): the five queue buckets through the kit Radar, kept like the queue on a failed refresh. */
export function SalesRadar(frame: PanelFrame) {
  const { state } = useSales();
  return <Radar {...frame} label="Lead stages" result={retainedRadar(state)} />;
}
