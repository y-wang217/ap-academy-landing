import Link from "next/link";
import SignOutButton from "@/app/sign-out-button";

export function TopBar({ email }: { email: string }) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold">
          Student Tracker
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden truncate text-xs text-text-muted sm:inline">{email}</span>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
