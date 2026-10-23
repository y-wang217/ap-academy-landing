"use client";

import type { MouseEvent } from "react";
import { hhmm } from "../../../lib/console/format";
import { useOptionalSales } from "../sales/sales-provider";
import { useMode } from "../shell/mode-context";
import { DeferredStrip } from "./deferred-strip";
import { useSignals } from "./signals-provider";
import { SnoozeMenu } from "./snooze-menu";

/**
 * The fresh-lead band under the header, in every mode (REQ-62 AC1, AC2). A
 * text NEW label, Call now (Sales with the lead selected), Seen and Snooze.
 * A new lead pulses once, for at most 1.5 s, and is announced assertively,
 * only when the founder is not in protected time; otherwise it waits in the
 * deferred strip with no motion and a polite count. The console never calls.
 */
export function SignalBand() {
  const { band, state, protectedNow, ack } = useSignals();
  const sales = useOptionalSales();
  const { select } = useMode();
  const pulsing = protectedNow ? [] : state.pulsing.filter((k) => band.some((s) => s.signalKey === k));
  const callNow = (e: MouseEvent<HTMLAnchorElement>, signalKey: string, href: string) => {
    const lead = new URLSearchParams(href.slice(href.indexOf("?"))).get("lead");
    ack(signalKey);
    if (!sales || !lead) return;
    e.preventDefault();
    sales.dispatch({ type: "setFilter", filter: "all" });
    sales.dispatch({ type: "select", id: lead });
    select("sales");
  };
  const names = band.filter((s) => pulsing.includes(s.signalKey)).map((s) => s.title);
  return (
    <section className="console-band" aria-label="Fresh leads" data-signal-band="" data-protected={protectedNow ? "" : undefined}>
      <p className="console-sr" aria-live="polite">{`${band.length} fresh lead${band.length === 1 ? "" : "s"}`}</p>
      {!protectedNow && <p className="console-sr" aria-live="assertive">{names.length ? `New lead: ${names.join(", ")}` : ""}</p>}
      {band.length === 0 ? (
        <p className="console-note console-band-empty">No fresh leads</p>
      ) : (
        <ul className="console-band-rows">
          {band.map((s) => (
            <li key={s.signalKey} className="console-band-row" data-signal={s.signalKey} data-pulse={pulsing.includes(s.signalKey) ? "" : undefined}>
              <span className="console-new-tag">NEW</span>
              <span className="console-band-text">
                <span className="console-row-title">{s.title}</span>
                <span className="console-row-reason">
                  {`${s.detail}, checked ${hhmm(s.checkedAt)}, `}
                  <a href={s.sourceUrl}>{s.sourceLabel}</a>
                </span>
              </span>
              <span className="console-band-actions">
                <a href={s.action.href} className="console-band-call" onClick={(e) => callNow(e, s.signalKey, s.action.href)}>
                  {s.action.label}
                </a>
                <button type="button" onClick={() => ack(s.signalKey)} aria-label={`Seen ${s.title}`}>
                  Seen
                </button>
                <SnoozeMenu signalKey={s.signalKey} title={s.title} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <DeferredStrip />
    </section>
  );
}
