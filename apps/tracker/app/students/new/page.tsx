import { notFound } from "next/navigation";
import { createStudent } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
import { STUDENT_LABELS, StudentFields } from "@/components/teacher/fields";
import { TopBar } from "@/components/top-bar";
import { Card, Page } from "@/components/ui";
import { getViewer } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/** Setup starts here: the minimal record (ADR 0012). */
export default async function NewStudentPage() {
  const viewer = await getViewer();
  if (viewer.kind !== "staff") notFound();
  return (
    <>
      <TopBar email={viewer.email} />
      <Page title="Add a student" back={{ href: "/", label: "Back to students" }}>
        <Card>
          <ActionForm action={createStudent} labels={STUDENT_LABELS} submitLabel="Create and start setup" pendingLabel="Creating...">
            <StudentFields />
          </ActionForm>
        </Card>
      </Page>
    </>
  );
}
