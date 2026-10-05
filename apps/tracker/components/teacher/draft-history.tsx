import type { DraftRecord } from "@/lib/data/queries";
import { stamp } from "@/lib/format";
import { Card, Empty } from "../ui";

const STATUS: Record<DraftRecord["status"], string> = {
  requested: "Not answered",
  drafted: "Drafted, not saved",
  failed: "Failed",
  applied: "Saved",
  discarded: "Discarded",
};

/** What the AI was asked and what came of it, newest first (ADR 0026). Read-only. */
export function DraftHistory({ drafts, viewerId, courseCode }: { drafts: DraftRecord[]; viewerId: string; courseCode: (courseId: string) => string | null }) {
  return (
    <Card title="AI drafts">
      {drafts.length === 0 ? (
        <Empty>No drafts yet.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {drafts.map((d) => {
            const scope = d.courseId ? courseCode(d.courseId) : null;
            const sent = [d.inputChars > 0 ? `${d.inputChars.toLocaleString()} characters` : null, d.inputFiles > 0 ? `${d.inputFiles} file${d.inputFiles === 1 ? "" : "s"}` : null]
              .filter(Boolean)
              .join(", ");
            return (
              <li key={d.id} className="flex flex-col gap-0.5 py-2">
                <span className="flex justify-between gap-3">
                  <span className="font-medium">{STATUS[d.status]}</span>
                  <span className="text-text-muted">{stamp(d.createdAt)}</span>
                </span>
                <span className="text-text-muted">
                  {d.requestedBy === viewerId ? "You" : "A teacher"} sent {sent}
                  {scope ? ` about ${scope}` : ""}.{" "}
                  {d.status === "applied" || d.status === "drafted" || d.status === "discarded"
                    ? `${d.itemCount} change${d.itemCount === 1 ? "" : "s"} drafted${d.noteCount > 0 ? `, ${d.noteCount} not placed` : ""}.`
                    : ""}
                  {d.error ? ` ${d.error}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
