import type { RecentMark } from "@/lib/view/parent-grades";
import { Card, Empty } from "./ui";

/** The parent's short list of the latest marks. It renders only what RecentMark holds. */
export function RecentMarks({ marks }: { marks: RecentMark[] }) {
  return (
    <Card title="Recent marks">
      {marks.length === 0 ? (
        <Empty>No marks yet</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {marks.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="block text-sm text-text-muted">
                  {m.courseCode} · {m.dateText}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{m.scoreText}</span>
                <span className="block text-xs text-text-muted">{m.percentText}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
