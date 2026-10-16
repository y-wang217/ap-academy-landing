import { Card, Empty } from "@/components/ui";
import { parentChild } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function ParentPlaceholder({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  await parentChild(studentId);
  return (
    <Card>
      <Empty>Classes will show here.</Empty>
    </Card>
  );
}
