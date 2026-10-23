import Link from "next/link";
import { redirect } from "next/navigation";
import { EvalActions } from "@/components/iris/eval-actions";
import { EvalLabelForm, EvalRating } from "@/components/iris/eval-label-form";
import { TopBar } from "@/components/top-bar";
import { Card, Empty, Notice, Page, secondaryButtonClass } from "@/components/ui";
import { getDb } from "@/lib/data/client";
import { EVAL_PAGE_SIZE } from "@/lib/data/iris-eval";
import { createPeopleStore } from "@/lib/data/people";
import { getViewer } from "@/lib/data/queries";
import { realEvalAdminDeps, realIrisAdminDeps } from "@/lib/iris/deps";
import { LABEL_REPLY_TYPES, loadEval, parseFilter, parsePage, type EvalRow } from "@/lib/iris/eval-handlers";
import type { EvalFilter, EvalStatus } from "@/lib/iris/eval-schemas";
import { CLASSIFIER_INTENTS, SIGNATURE } from "@/lib/iris/policy";
import { EVAL_TEXT, evalCountsText, evalProgressText, intentLabel, pageText, ratioText } from "@/lib/view/iris-text";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "short", day: "numeric" });

function StatusCard({ status }: { status: EvalStatus }) {
  const imp = status.importRequest;
  const run = status.runRequest;
  const recordId = status.ratedRequestId !== null && (!run || run.finished) ? status.ratedRequestId : null;
  return (
    <Card>
      <p className="text-sm" data-eval-import-status>
        <strong>{EVAL_TEXT.importLabel}</strong>{" "}
        {!imp ? EVAL_TEXT.notStarted : imp.finished ? `${when(imp.finished.at)} · ${evalCountsText(imp.finished)}` : EVAL_TEXT.pending}
      </p>
      {imp?.finished?.capped && <Notice tone="warn">{EVAL_TEXT.capped}</Notice>}
      <p className="text-sm" data-eval-run-status>
        <strong>{EVAL_TEXT.runLabel}</strong>{" "}
        {!run
          ? EVAL_TEXT.notStarted
          : run.finished?.reason === "stale"
            ? EVAL_TEXT.stale
            : `${run.finished ? when(run.finished.at) : EVAL_TEXT.pending} · ${evalProgressText(status.counts.evalDone, status.counts.evalTotal, status.counts.unratedDrafts)}`}
      </p>
      {/* Requests made while paused wait for the run (AC14): the buttons stay. */}
      <EvalActions canImport={!imp || imp.finished !== null} canRun={(!run || run.finished !== null) && status.counts.labelled > 0} recordRequestId={recordId} />
    </Card>
  );
}

function RunCard({ status }: { status: EvalStatus }) {
  const r = status.latestRun;
  if (!r) return <Card title={EVAL_TEXT.latestRun}><Empty>{EVAL_TEXT.noRun}</Empty></Card>;
  const types = Object.keys(r.perType).sort();
  const gold = status.confusion ? Object.keys(status.confusion).sort() : [];
  const predicted = status.confusion ? [...new Set(Object.values(status.confusion).flatMap((row) => Object.keys(row)))].sort() : [];
  return (
    <Card title={EVAL_TEXT.latestRun}>
      <p className="text-sm" data-eval-latest-run>
        {day(r.ranAt)} · policy {r.policyVersion} · {r.model ?? "-"} · {r.labelledCount} labelled
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm" data-eval-per-type>
          <thead>
            <tr><th className="pr-3 text-left">{EVAL_TEXT.type}</th><th className="pr-3">{EVAL_TEXT.count}</th><th className="pr-3">{EVAL_TEXT.precision}</th><th className="pr-3">{EVAL_TEXT.recall}</th><th>{EVAL_TEXT.meanRating}</th></tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t} data-eval-type={t}>
                <td className="pr-3">{t}</td><td className="pr-3 text-right">{r.perType[t].count}</td><td className="pr-3 text-right">{ratioText(r.perType[t].precision)}</td>
                <td className="pr-3 text-right">{ratioText(r.perType[t].recall)}</td><td className="text-right">{r.meanRatingPerType[t] === undefined ? "-" : r.meanRatingPerType[t].toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm" data-eval-sensitive-recall>{EVAL_TEXT.sensitiveRecall} {ratioText(r.sensitiveRecall)}</p>
      {status.confusion ? (
        <div className="overflow-x-auto">
          <p className="text-sm font-medium">{EVAL_TEXT.confusion}</p>
          <table className="text-sm" data-eval-confusion>
            <thead><tr><th />{predicted.map((p) => <th key={p} className="px-2">{p}</th>)}</tr></thead>
            <tbody>
              {gold.map((g) => (
                <tr key={g}><th className="pr-2 text-left">{g}</th>{predicted.map((p) => <td key={p} className="px-2 text-right">{status.confusion![g][p] ?? 0}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-text-muted" data-eval-purged>{EVAL_TEXT.detailsPurged}</p>
      )}
    </Card>
  );
}

function Item({ row }: { row: EvalRow }) {
  const r = row.result;
  return (
    <li className="flex flex-col gap-2 py-3 text-sm" data-eval-item={row.id}>
      <p className="font-medium">{day(row.receivedAt)} · {row.family} · {row.subject ?? "(no subject)"}</p>
      <div>
        <p className="text-text-muted">{EVAL_TEXT.message}</p>
        <pre className="whitespace-pre-wrap font-sans" data-eval-body>{row.bodyText ?? ""}</pre>
      </div>
      <div>
        <p className="text-text-muted">{EVAL_TEXT.charlieReplied}</p>
        <pre className="whitespace-pre-wrap font-sans" data-eval-reply>{row.reply ?? EVAL_TEXT.noReply}</pre>
      </div>
      <EvalLabelForm id={row.id} initial={row.label} intents={CLASSIFIER_INTENTS} replyTypes={LABEL_REPLY_TYPES} />
      {r && (
        <div className="flex flex-col gap-2 rounded border border-border p-2" data-eval-result={r.id}>
          {r.outcome === "error" ? (
            <p>{EVAL_TEXT.evalError}</p>
          ) : r.draftBody ? (
            <>
              <p className="text-text-muted">{EVAL_TEXT.irisDraft(r.policyVersion)}{r.predictedEscalate ? ` · ${EVAL_TEXT.irisEscalated}` : ""}</p>
              <pre className="whitespace-pre-wrap font-sans" data-eval-draft>{`${r.draftBody}\n\n${SIGNATURE}`}</pre>
              <EvalRating id={row.id} resultId={r.id} initial={row.label?.ratedResultId === r.id ? row.label.draftRating : null} />
            </>
          ) : (
            <p data-eval-predicted>{r.predictedEscalate ? EVAL_TEXT.irisEscalated : intentLabel(r.predictedIntent)}</p>
          )}
        </div>
      )}
    </li>
  );
}

const FILTERS: [EvalFilter, string][] = [["unlabelled", EVAL_TEXT.filterUnlabelled], ["labelled", EVAL_TEXT.filterLabelled], ["all", EVAL_TEXT.filterAll]];

/**
 * The eval harness (REQ-45, tracker ADR 0074): import a year of family mail,
 * label it, run Iris over it, rate the drafts and record one aggregate run.
 * Owner only: anyone else goes home before any Iris read.
 */
export default async function IrisEvalPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams;
  const filter = parseFilter(Array.isArray(sp.filter) ? sp.filter[0] : sp.filter);
  const page = parsePage(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  // Names come from the local people copy on the owner's own client (REQ-38); the page never reads Notion.
  const studentNames = async (orgId: string) => {
    const db = await getDb();
    return db ? createPeopleStore(db.tracker, orgId).studentNames() : new Map<string, string>();
  };
  const ev = await loadEval({ ...realEvalAdminDeps(), iris: realIrisAdminDeps().reader, studentNames }, filter, page);
  if (ev.kind === "denied") redirect("/");
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;
  const pages = ev.kind === "ok" ? Math.ceil(ev.total / EVAL_PAGE_SIZE) : 1;
  const href = (f: EvalFilter, p: number) => `/iris/eval?filter=${f}&page=${p}`;

  return (
    <>
      {email && <TopBar email={email} />}
      <Page title={EVAL_TEXT.title} back={{ href: "/iris", label: "Inbox" }} aside={<Link href="/iris/settings" className={secondaryButtonClass}>Settings</Link>}>
        {ev.kind === "error" ? (
          <Notice tone="error">{EVAL_TEXT.loadError}</Notice>
        ) : (
          <>
            {ev.paused && <Notice tone="warn"><span data-eval-paused>{EVAL_TEXT.paused}</span></Notice>}
            <StatusCard status={ev.status} />
            <RunCard status={ev.status} />
            <Card>
              <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label="Filter">
                {FILTERS.map(([f, label]) => (
                  <Link key={f} href={href(f, 1)} className={f === ev.filter ? "font-semibold" : "text-accent underline underline-offset-2"} aria-current={f === ev.filter ? "page" : undefined}>{label}</Link>
                ))}
                <span className="ml-auto" data-eval-page>{pageText(ev.page, pages)}</span>
                {ev.page > 1 && <Link href={href(ev.filter, ev.page - 1)} className="text-accent" aria-label="Previous page">&lt;</Link>}
                {ev.page < pages && <Link href={href(ev.filter, ev.page + 1)} className="text-accent" aria-label="Next page">&gt;</Link>}
              </nav>
              {ev.status.counts.imported === 0 ? (
                <Empty>{EVAL_TEXT.empty}</Empty>
              ) : ev.items.length === 0 ? (
                <Empty>-</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-border">{ev.items.map((r) => <Item key={r.id} row={r} />)}</ul>
              )}
            </Card>
          </>
        )}
      </Page>
    </>
  );
}
