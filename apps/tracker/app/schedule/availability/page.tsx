import { AvailabilityEditor } from "@/components/scheduler/availability-editor";
import { TeacherPicker } from "@/components/scheduler/teacher-picker";
import { Card, Notice, Page } from "@/components/ui";
import { TopBar } from "@/components/top-bar";
import { isActiveTeachingStaff } from "@/lib/domain/staff";
import { getViewer } from "@/lib/data/queries";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { todayIso } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ staffId?: string }> }) {
  const [{ staffId: asked }, viewer] = await Promise.all([searchParams, getViewer()]);
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;
  const deps = realScheduleDeps();
  const who = await deps.identity();
  const shell = (body: React.ReactNode, title = "Availability") => (
    <>
      {email && <TopBar email={email} />}
      <Page title={title} back={{ href: "/", label: "Home" }}>{body}</Page>
    </>
  );

  if (who.scope === "unconfigured" || who.scope === "unavailable") return shell(<Notice>Scheduling is not available right now.</Notice>);
  if (who.scope === "signed_out" || who.scope === "none") return shell(<Notice>You don&apos;t have access to scheduling yet.</Notice>);

  const today = todayIso();
  if (who.scope === "teacher") {
    return shell(<AvailabilityEditor staffId={who.staff.id} scope="teacher" today={today} />, "Your availability");
  }

  let teachers: { id: string; name: string }[];
  try {
    teachers = (await deps.fetchStaff()).filter(isActiveTeachingStaff).map((s) => ({ id: s.id, name: s.name }));
  } catch {
    return shell(<Notice>Scheduling is not available right now.</Notice>);
  }
  if (teachers.length === 0) return shell(<Notice>No active teachers found.</Notice>);
  const chosen = teachers.find((t) => t.id === asked)?.id ?? (who.staff && teachers.find((t) => t.id === who.staff!.id)?.id) ?? teachers[0].id;
  return shell(
    <>
      <Card><TeacherPicker staff={teachers} value={chosen} /></Card>
      <AvailabilityEditor key={chosen} staffId={chosen} scope="admin" today={today} />
    </>,
    "Teacher availability",
  );
}
