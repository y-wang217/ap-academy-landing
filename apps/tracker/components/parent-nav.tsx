"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { childPills, parentTabs, type Child, type ParentTab } from "@/lib/view/parent-nav";

function currentTab(pathname: string): ParentTab {
  if (pathname.endsWith("/calendar")) return "calendar";
  if (pathname.endsWith("/billing")) return "billing";
  return "grades";
}

/** Child pills (only with more than one child) and the three tabs. Links only; nothing to type. */
export function ParentNav({ childList, currentId }: { childList: Child[]; currentId: string }) {
  const tab = currentTab(usePathname() ?? "");
  const pills = childPills(childList, currentId, tab);
  const tabs = parentTabs(currentId, tab);
  return (
    <>
      {pills.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Children">
          {pills.map((p) => (
            <li key={p.id}>
              <Link
                href={p.href}
                aria-current={p.current ? "page" : undefined}
                className={`inline-block rounded-full border px-4 py-1.5 text-sm font-medium ${p.current ? "border-ok bg-ok-bg text-ok" : "border-border bg-surface text-text-primary"}`}
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Sections" className="flex border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.current ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${t.current ? "border-accent text-accent" : "border-transparent text-text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
