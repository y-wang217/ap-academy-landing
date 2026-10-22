import Link from "next/link";
import { redirect } from "next/navigation";
import { IrisSettingsActions } from "@/components/iris/settings-actions";
import { TopBar } from "@/components/top-bar";
import { Card, Notice, Page, secondaryButtonClass } from "@/components/ui";
import { aiConfigured } from "@/lib/ai/config";
import { getViewer } from "@/lib/data/queries";
import { missingIrisEnv, readCharlieUserId } from "@/lib/iris/config";
import { realIrisAdminDeps } from "@/lib/iris/deps";
import { loadIrisSettings } from "@/lib/iris/handlers";
import { IRIS_TEXT, confidenceText, notSetUpText, runSummaryText } from "@/lib/view/iris-text";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** Iris settings (REQ-42 AC27, REQ-44 AC18): Paused or Running, the last run, its error, which env vars are missing, and whether phone alerts are off. Owner only. */
export default async function IrisSettingsPage() {
  const s = await loadIrisSettings(realIrisAdminDeps(), missingIrisEnv(), aiConfigured(), readCharlieUserId() === null);
  if (s.kind === "denied") redirect("/");
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;

  return (
    <>
      {email && <TopBar email={email} />}
      <Page title={IRIS_TEXT.settingsTitle} back={{ href: "/", label: "Home" }} aside={<Link href="/iris" className={secondaryButtonClass}>Inbox</Link>}>
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
          </>
        )}
      </Page>
    </>
  );
}
