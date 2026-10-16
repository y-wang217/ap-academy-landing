import { redirect } from "next/navigation";
import { Card, Empty, Page } from "@/components/ui";
import { TopBar } from "@/components/top-bar";
import { getViewer, listChildren } from "@/lib/data/queries";
import { parentLanding } from "@/lib/view/parent-nav";

export const dynamic = "force-dynamic";

/** The parent's landing: their first child's grades, or a plain empty state. */
export default async function ParentHome() {
  const viewer = await getViewer();
  if (viewer.kind !== "parent") redirect("/");
  const children = await listChildren(viewer.db);
  const landing = parentLanding(children);
  if (landing) redirect(landing);
  return (
    <>
      <TopBar email={viewer.email} brand="AP Academy" showEmail />
      <Page title="Nothing here yet">
        <Card>
          <Empty>Ask your tutor to send you an invite. You are signed in as {viewer.email}.</Empty>
        </Card>
      </Page>
    </>
  );
}
