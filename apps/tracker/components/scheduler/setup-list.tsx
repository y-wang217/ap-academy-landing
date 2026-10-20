import Link from "next/link";
import { Card, linkClass } from "@/components/ui";
import type { SetupRow } from "@/lib/domain/setup-status";
import { ADOPTION_FOOTNOTE, BADGE, MAX_NAMES, MISSING_PREFIX, ROW_LABELS, ROW_LINKS, WHILE_MISSING, countLine, moreLine } from "@/lib/view/setup-text";

const BADGE_CLASS = {
  done: "text-sm text-text-muted",
  partial: "rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn",
  missing: "rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn",
  unknown: "text-sm",
} as const;

/** Names of what is still missing, up to MAX_NAMES. Students link to their page (parent panel). */
function missingNames(row: SetupRow) {
  if (!row.facts || row.state === "done") return null;
  const names: { label: string; href?: string }[] =
    row.key === "teachers" ? row.facts.missing.map((label) => ({ label }))
    : row.key === "parents" || row.key === "notionRecords" ? row.facts.missing.map((s) => ({ label: s.name, href: `/students/${s.id}` }))
    : [];
  if (names.length === 0) return null;
  const more = moreLine(names.length);
  return (
    <p className="text-sm">
      {MISSING_PREFIX}{" "}
      {names.slice(0, MAX_NAMES).map((n, i) => (
        <span key={`${n.label}-${i}`}>
          {i > 0 && ", "}
          {n.href ? <Link href={n.href} className={linkClass}>{n.label}</Link> : n.label}
        </span>
      ))}
      {more && ` ${more}`}
    </p>
  );
}

/** One card per setup step (REQ-33). Read only: no buttons, only links to where each step is fixed. */
export function SetupList({ rows }: { rows: SetupRow[] }) {
  return (
    <>
      {rows.map((row) => {
        const link = ROW_LINKS[row.key];
        return (
          <Card key={row.key} id={`setup-${row.key}`} title={ROW_LABELS[row.key]} action={<span className={BADGE_CLASS[row.state]} data-state={row.state}>{BADGE[row.state]}</span>}>
            <p className="text-sm" data-count>{countLine(row)}</p>
            {row.state !== "done" && <p className="text-sm text-text-muted">{WHILE_MISSING[row.key]}</p>}
            {missingNames(row)}
            {row.key === "schedules" && <p className="text-xs text-text-muted">{ADOPTION_FOOTNOTE}</p>}
            {link.external ? (
              <a href={link.href} className={`${linkClass} text-sm`}>{link.label}</a>
            ) : (
              <Link href={link.href} className={`${linkClass} text-sm`}>{link.label}</Link>
            )}
          </Card>
        );
      })}
    </>
  );
}
