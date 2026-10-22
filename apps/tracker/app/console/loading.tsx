import { Page } from "@/components/ui";

/** Streamed only after the layout's owner gate passed. Static: reads nothing. */
export default function ConsoleLoading() {
  return (
    <Page title="Loading console">
      <p className="text-sm text-text-muted">Loading console</p>
    </Page>
  );
}
