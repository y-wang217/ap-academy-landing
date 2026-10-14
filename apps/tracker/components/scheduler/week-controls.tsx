import Link from "next/link";
import { addDays } from "@/lib/domain/schedule/wallclock";
import { inputClass, secondaryButtonClass } from "@/components/ui";

// A plain GET form posts to the full path, so the app's basePath is written out here (next.config.ts).
const ACTION = "/tracker/schedule";

type Props = {
  weekStart: string;
  today: string;
  staffId?: string;
  all: boolean;
  /** Admin only. Teachers get no selector and no All teachers link. */
  teachers?: { id: string; name: string }[];
};

function href(date: string, staffId: string | undefined, all: boolean) {
  const q = new URLSearchParams({ date });
  if (all) q.set("view", "all");
  else if (staffId) q.set("staffId", staffId);
  return `/schedule?${q}`;
}

/** Previous, Today, Next and a date jump. Plain links and a GET form: no client JavaScript needed. */
export function WeekControls({ weekStart, today, staffId, all, teachers }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Week" className="flex flex-wrap items-center gap-2">
        <Link href={href(addDays(weekStart, -7), staffId, all)} className={secondaryButtonClass}>‹ Previous week</Link>
        <Link href={href(today, staffId, all)} className={secondaryButtonClass}>Today</Link>
        <Link href={href(addDays(weekStart, 7), staffId, all)} className={secondaryButtonClass}>Next week ›</Link>
        {teachers && (
          <Link href={all ? href(weekStart, staffId ?? teachers[0]?.id, false) : href(weekStart, undefined, true)} className={secondaryButtonClass}>
            {all ? "One teacher" : "All teachers"}
          </Link>
        )}
      </nav>
      <form method="get" action={ACTION} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Go to date</span>
          <input type="date" name="date" defaultValue={weekStart} className={`${inputClass} !w-auto`} />
        </label>
        {all && <input type="hidden" name="view" value="all" />}
        {teachers && !all && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Teacher</span>
            <select name="staffId" defaultValue={staffId} className={`${inputClass} !w-auto`}>
              {teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </label>
        )}
        {!teachers && staffId && <input type="hidden" name="staffId" value={staffId} />}
        <button type="submit" className={secondaryButtonClass}>Go</button>
      </form>
    </div>
  );
}
