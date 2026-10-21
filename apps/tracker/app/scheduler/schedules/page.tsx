import { Notice, Page } from "@/components/ui";
import { PeopleFreshness } from "@/components/people-freshness";
import { ScheduleImport } from "@/components/scheduler/schedule-import";
import { realDeps } from "@/lib/scheduler/deps";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/** Admin page for the Weekly Schedule import (REQ-4). Anyone else sees one notice; the APIs also refuse them. */
export default async function SchedulesPage() {
  const deps = realDeps();
  const identity = await deps.identity();
  if (identity.scope !== "admin") {
    return (
      <Page title="Not available">
        <Notice>This page is not available for your account.</Notice>
      </Page>
    );
  }
  return (
    <Page title="Weekly schedules">
      <PeopleFreshness load={async () => (await deps.peopleStore()).syncedAt()} />
      <ScheduleImport />
    </Page>
  );
}
