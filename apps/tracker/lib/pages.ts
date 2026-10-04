import { notFound } from "next/navigation";
import { getViewer, loadBundle, type Bundle } from "./data/queries";
import { todayIso } from "./time";
import { buildStudentView, type StudentView } from "./view/student-view";

/** For teacher pages: the staff viewer and one student's data, or a 404. */
export async function staffStudent(studentId: string): Promise<{
  viewer: Extract<Awaited<ReturnType<typeof getViewer>>, { kind: "staff" }>;
  bundle: Bundle;
  view: StudentView;
  orgName: string;
}> {
  const viewer = await getViewer();
  if (viewer.kind !== "staff") notFound();
  const bundle = await loadBundle(viewer.db, studentId).catch(() => null);
  if (!bundle || bundle.student.orgId !== viewer.orgId) notFound();
  const { data: org } = await viewer.db.tracker.from("orgs").select("name").eq("id", viewer.orgId).maybeSingle();
  return { viewer, bundle, view: buildStudentView(bundle, todayIso()), orgName: org?.name ?? "Your tutor" };
}
