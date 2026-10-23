import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoSendSwitch, SendingSwitch } from "@/components/iris/auto-send-switch";
import { IrisSettingsActions } from "@/components/iris/settings-actions";
import { TopBar } from "@/components/top-bar";
import { Card, Notice, Page, secondaryButtonClass } from "@/components/ui";
import { aiConfigured } from "@/lib/ai/config";
import { getViewer } from "@/lib/data/queries";
import { missingIrisEnv, readCharlieUserId } from "@/lib/iris/config";
import { realEvalAdminDeps, realIrisAdminDeps } from "@/lib/iris/deps";
import { loadReadiness, type ReadinessResult } from "@/lib/iris/eval-handlers";
import { loadIrisSettings } from "@/lib/iris/handlers";
import { TUNING } from "@/lib/domain/tuning";
import { AUTO_TEXT, EVAL_TEXT, IRIS_TEXT, READINESS_CONDITIONS, confidenceText, disabledReasonText, gateConditionText, neverLineText, notSetUpText, runSummaryText } from "@/lib/view/iris-text";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

const THRESHOLDS: Record<string, number> = { labelled_count: TUNING.irisGateMinLabelled, streak: TUNING.irisAutoSendStreak };

/**
 * Auto-send (REQ-45 AC11, REQ-49 AC13): the global Sending switch, then each
 * candidate type's gate conditions as met or not met, its state, streak,
 * totals and last disabled reason. A type gets a switch only when it is
 * eligible and not on the never list.
 */
function AutoSend({ r, sendingEnabled, quietStart, quietEnd }: { r: ReadinessResult; sendingEnabled: boolean; quietStart: string; quietEnd: string }) {
  if (r.kind === "error") return <Card title={AUTO_TEXT.title}><Notice tone="error">{EVAL_TEXT.loadError}</Notice></Card>;
  return (
    <Card title={AUTO_TEXT.title}>
      <SendingSwitch enabled={sendingEnabled} />
      <p className="text-sm text-text-muted" data-quiet-hours>{AUTO_TEXT.quietHours(quietStart, quietEnd)}</p>
      <p className="text-sm text-text-muted" data-readiness-run>
        {r.runAt ? `${EVAL_TEXT.latestRun}: ${when(r.runAt)}, policy ${r.runPolicyVersion}` : EVAL_TEXT.noRun}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {r.rows.map((row) => {
          const extra = row.failing.filter((c) => c === "no_run" || c === "stale_run");
          return (
            <li key={row.type} className="flex flex-col gap-1 py-2 text-sm" data-readiness-type={row.type} data-auto-send-state={row.enabled ? "on" : "off"}>
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">{row.type}</span>
                <strong>{row.enabled ? AUTO_TEXT.on : AUTO_TEXT.off}</strong>
                <span>{AUTO_TEXT.streak(row.streak)}</span>
                <span className="text-text-muted">{AUTO_TEXT.totals(row.approvedTotal, row.editedTotal, row.rejectedTotal)}</span>
              </span>
              <span className="flex flex-wrap gap-x-3">
                {[...extra, ...READINESS_CONDITIONS].map((c) => {
                  const met = !row.failing.includes(c);
                  const text = gateConditionText(c, { count: row.count, streak: row.streak, threshold: THRESHOLDS[c] ?? 0 });
                  return (
                    <span key={c} data-gate-condition={c} data-met={met ? "yes" : "no"}>
                      {text}: {met ? EVAL_TEXT.met : EVAL_TEXT.notMet}
                    </span>
                  );
                })}
              </span>
              {row.disabledReason && (
                <span className="text-text-muted" data-disabled-reason={row.disabledReason}>
                  {AUTO_TEXT.lastOff}: {disabledReasonText(row.disabledReason)}{row.disabledAt ? `, ${when(row.disabledAt)}` : ""}
                </span>
              )}
              {row.switchable ? <AutoSendSwitch type={row.type} enabled={row.enabled} /> : <span className="text-text-muted" data-no-switch>{AUTO_TEXT.notEligible}</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-sm" data-readiness-never>{neverLineText(r.never)}</p>
    </Card>
  );
}

/** Iris settings (REQ-42 AC27, REQ-44 AC18, REQ-45 AC11, REQ-49 AC13): Paused or Running, the last run, its error, which env vars are missing, whether phone alerts are off, and auto-send. Owner only. */
export default async function IrisSettingsPage() {
  const s = await loadIrisSettings(realIrisAdminDeps(), missingIrisEnv(), aiConfigured(), readCharlieUserId() === null);
  if (s.kind === "denied") redirect("/");
  // Read only after the owner check above.
  const evalDeps = realEvalAdminDeps();
  const identity = await evalDeps.identity();
  const readiness: ReadinessResult = s.kind === "ok" && identity.scope === "admin" ? await loadReadiness(evalDeps.reader(identity.orgId), evalDeps.model) : { kind: "error" };
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;

  return (
    <>
      {email && <TopBar email={email} />}
      <Page title={IRIS_TEXT.settingsTitle} back={{ href: "/", label: "Home" }} aside={<span className="flex gap-2"><Link href="/iris/eval" className={secondaryButtonClass}>{EVAL_TEXT.link}</Link><Link href="/iris" className={secondaryButtonClass}>Inbox</Link></span>}>
        {s.kind === "error" ? (
          <Notice tone="error">{IRIS_TEXT.loadError}</Notice>
        ) : (
          <>
            <Card>
              <p className="text-sm" data-iris-status={s.paused ? "paused" : "running"}>
                Status: <strong>{s.paused ? IRIS_TEXT.statusPaused : IRIS_TEXT.statusRunning}</strong>
              </p>
              <IrisSettingsActions paused={s.paused} />
            </Card>
            <Card>
              {!s.aiConfigured && (
                <Notice tone="warn">
                  <span data-ai-not-set-up>{IRIS_TEXT.aiNotSetUp}</span>. {IRIS_TEXT.aiNotSetUpDetail}
                </Notice>
              )}
              {s.phoneAlertsOff && <Notice tone="warn"><span data-phone-alerts-off>{IRIS_TEXT.phoneAlertsOff}</span></Notice>}
              <p className="text-sm" data-confidence-threshold>
                {IRIS_TEXT.confidenceThreshold}: {confidenceText(s.confidenceThreshold)}
              </p>
            </Card>
            <Card title={IRIS_TEXT.lastRun}>
              <p className="text-sm" data-last-run>
                {s.lastRun ? `${when(s.lastRun.startedAt)} · ${runSummaryText(s.lastRun)}` : IRIS_TEXT.never}
              </p>
              <p className="text-sm" data-last-error>
                {IRIS_TEXT.lastError}: {s.lastError ?? IRIS_TEXT.none}
              </p>
              {s.missing.length > 0 && <Notice tone="warn">{notSetUpText(s.missing)}</Notice>}
            </Card>
            <AutoSend r={readiness} sendingEnabled={s.sendingEnabled} quietStart={s.quietStart} quietEnd={s.quietEnd} />
          </>
        )}
      </Page>
    </>
  );
}
