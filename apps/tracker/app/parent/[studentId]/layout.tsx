import type { ReactNode } from "react";
import { Card, Empty } from "@/components/ui";
import { ParentNav } from "@/components/parent-nav";
import { TopBar } from "@/components/top-bar";
import { parentChild } from "@/lib/pages";

export const dynamic = "force-dynamic";

/** The read-only parent shell: top bar, child pills, tabs (REQ-22). A layout does not guard its pages, so each page calls parentChild too. */
export default async function ParentShell({ children, params }: { children: ReactNode; params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { viewer, children: kids, child } = await parentChild(studentId);
  return (
    <>
      <TopBar email={viewer.email} brand="AP Academy" showEmail />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4">
        <ParentNav childList={kids} currentId={child.id} />
        {child.published ? (
          children
        ) : (
          <Card>
            <Empty>Not ready yet</Empty>
            <p className="text-sm text-text-muted">{child.firstName}&apos;s tracker isn&apos;t ready yet.</p>
          </Card>
        )}
      </main>
    </>
  );
}
