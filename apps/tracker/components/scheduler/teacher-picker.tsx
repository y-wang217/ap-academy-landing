"use client";

import { useRouter } from "next/navigation";

/** Admin only: switches whose availability the editor shows. */
export function TeacherPicker({ staff, value }: { staff: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Teacher</span>
      <select
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-text-primary focus:outline-2 focus:outline-accent"
        value={value}
        onChange={(e) => router.push(`/schedule/availability?staffId=${e.target.value}`)}
      >
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </label>
  );
}
