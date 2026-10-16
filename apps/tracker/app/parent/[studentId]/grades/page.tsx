import { RecentMarks } from "@/components/recent-marks";
import { StudentDashboard } from "@/components/student-dashboard";
import { Card, Empty, GradeNote } from "@/components/ui";
import { loadBundle } from "@/lib/data/queries";
import { studentName } from "@/lib/format";
import { parentChild } from "@/lib/pages";
import { todayIso } from "@/lib/time";
import { parentGradesState } from "@/lib/view/parent-grades";

export const dynamic = "force-dynamic";

/** The child's student dashboard, read-only, plus the latest marks (REQ-23). */
export default async function ParentGrades({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { viewer, child } = await parentChild(studentId);
  const today = todayIso();
  const state = await parentGradesState(child, (id) => loadBundle(viewer.db, id), today);
  if (state.kind === "not_ready") {
    return (
      <Card>
        <Empty>Not ready yet</Empty>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{studentName(child)}</h1>
      <StudentDashboard view={state.view} interactive={false} readOnly today={today} afterSubjects={<RecentMarks marks={state.recent} />} />
      <GradeNote />
    </div>
  );
}
