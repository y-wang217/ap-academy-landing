import { notFound, redirect } from "next/navigation";
import { getViewer, listChildren, listLoginEmails, loadBundle, type Bundle } from "./data/queries";
import type { ChildRecord } from "./data/schemas";
import { todayIso } from "./time";
import { buildStudentView, type StudentView } from "./view/student-view";

/** For teacher pages: the staff viewer and one student's data, or a 404. */
export async function staffStudent(studentId: string): Promise<{
  viewer: Extract<Awaited<ReturnType<typeof getViewer>>, { kind: "staff" }>;
  bundle: Bundle;
  view: StudentView;
  orgName: string;
  /** Owners only: the login that claimed this student. */
  loginEmail: string | null;
  /** The ISO date the view was built for; the charts take the same one. */
  today: string;
}> {
  const viewer = await getViewer();
  if (viewer.kind !== "staff") notFound();
  const bundle = await loadBundle(viewer.db, studentId).catch(() => null);
  if (!bundle || bundle.student.orgId !== viewer.orgId) notFound();
  const { data: org } = await viewer.db.tracker.from("orgs").select("name").eq("id", viewer.orgId).maybeSingle();
  const loginEmail = viewer.role === "owner" && bundle.student.userId
    ? ((await listLoginEmails(viewer.db, viewer.orgId).catch(() => new Map<string, string>())).get(studentId) ?? null)
    : null;
  const today = todayIso();
  return { viewer, bundle, view: buildStudentView(bundle, today), orgName: org?.name ?? "Your tutor", loginEmail, today };
}

/**
 * For every parent page and the parent layout (a Next layout does not guard its
 * pages): the parent viewer, their children and the one in the URL. Anyone who
 * is not a parent goes back to the tracker home; an id that is not one of the
 * caller's children is a 404.
 */
export async function parentChild(studentId: string): Promise<{
  viewer: Extract<Awaited<ReturnType<typeof getViewer>>, { kind: "parent" }>;
  children: ChildRecord[];
  child: ChildRecord;
}> {
  const viewer = await getViewer();
  if (viewer.kind !== "parent") redirect("/");
  const children = await listChildren(viewer.db);
  const child = children.find((c) => c.id === studentId);
  if (!child) notFound();
  return { viewer, children, child };
}
