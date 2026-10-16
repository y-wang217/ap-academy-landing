import Link from "next/link";
import SignOutButton from "@/app/sign-out-button";

export function TopBar({ email, brand = "Student Tracker", showEmail = false }: { email: string; brand?: string; showEmail?: boolean }) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold">
          {brand}
        </Link>
        <div className="flex items-center gap-3">
          <span className={`max-w-[40vw] truncate text-xs text-text-muted ${showEmail ? "" : "hidden sm:inline"}`}>{email}</span>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
