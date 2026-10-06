import { notFound } from "next/navigation";
import { CourseDetail } from "@/components/course-detail";
import { TopBar } from "@/components/top-bar";
import { Page } from "@/components/ui";
import { getViewer, loadBundle } from "@/lib/data/queries";
import { todayIso } from "@/lib/time";
import { buildStudentView } from "@/lib/view/student-view";

export const dynamic = "force-dynamic";

/** Student subject drill-down. */
export default async function StudentCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== "student") notFound();
  const bundle = await loadBundle(viewer.db, viewer.studentId);
  const today = todayIso();
  const view = bundle ? buildStudentView(bundle, today) : null;
  const course = view?.courses.find((c) => c.course.id === courseId);
  if (!course) notFound();
  return (
    <>
      <TopBar email={viewer.email} />
      <Page title={`${course.course.code} ${course.course.name}`} back={{ href: "/", label: "Back to dashboard" }}>
        <CourseDetail view={course} interactive today={today} />
      </Page>
    </>
  );
}
