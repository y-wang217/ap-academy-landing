import { notFound } from "next/navigation";
import { SetupList } from "@/components/scheduler/setup-list";
import { TopBar } from "@/components/top-bar";
import { Page } from "@/components/ui";
import { buildSetupStatus } from "@/lib/domain/setup-status";
import { createPeopleStore } from "@/lib/data/people";
import { getViewer } from "@/lib/data/queries";
import { loadSetupInput } from "@/lib/data/setup";
import { readStudentsConfig, readWorkConfig } from "@/lib/notion/config";
import { NotionError } from "@/lib/notion/staff";
import { fetchScheduledStudentNames } from "@/lib/notion/students";
import { todayIso } from "@/lib/time";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/** Setup checklist for the org owner (REQ-33, tracker ADR 0053; staff from the REQ-38 copy). Reads only; everyone else gets a 404. */
export default async function SetupPage() {
  const viewer = await getViewer();
  if (viewer.kind !== "staff" || viewer.role !== "owner") notFound();

  // One clock for the page: the Toronto date the daily task also writes.
  const today = todayIso(new Date());
  const input = await loadSetupInput(
    viewer.db,
    viewer.orgId,
    today,
    {
      // The local people copy (REQ-38), not Notion: empty until the first sync.
      staff: () => createPeopleStore(viewer.db.tracker, viewer.orgId).listStaff(),
      scheduledStudents: () => {
        const config = readStudentsConfig();
        if (!config) throw new NotionError("Notion is not configured");
        return fetchScheduledStudentNames(config);
      },
    },
    {
      workConfigured: readWorkConfig() !== null,
      cronSecretSet: Boolean(process.env.SCHEDULER_CRON_SECRET),
      orgIdEnv: process.env.DAILY_TASK_ORG_ID,
    },
  );
  return (
    <>
      <TopBar email={viewer.email} />
      <Page title="Setup checklist" back={{ href: "/schedule", label: "Schedule" }}>
        <SetupList rows={buildSetupStatus(input, today)} />
      </Page>
    </>
  );
}
