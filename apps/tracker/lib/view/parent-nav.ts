/** Navigation for the read-only parent shell (REQ-22). Pure: no React, Next or Supabase. */

export type Child = { id: string; firstName: string; lastInitial: string; published: boolean };
export type ParentTab = "grades" | "calendar" | "billing";

const TABS: { key: ParentTab; label: string }[] = [
  { key: "grades", label: "Grades" },
  { key: "calendar", label: "Calendar" },
  { key: "billing", label: "Billing" },
];

export const tabPath = (studentId: string, tab: ParentTab) => `/parent/${studentId}/${tab}`;

/** Where a parent lands: the first child's grades, or null with no children. */
export function parentLanding(children: Child[]): string | null {
  return children[0] ? tabPath(children[0].id, "grades") : null;
}

/** First-name pills to switch child. None for one child. Each keeps the current tab. */
export function childPills(children: Child[], currentId: string, tab: ParentTab) {
  if (children.length < 2) return [];
  return children.map((c) => ({ id: c.id, label: c.firstName, href: tabPath(c.id, tab), current: c.id === currentId }));
}

export function parentTabs(studentId: string, current: ParentTab) {
  return TABS.map((t) => ({ key: t.key, label: t.label, href: tabPath(studentId, t.key), current: t.key === current }));
}
