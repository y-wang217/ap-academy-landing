"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "./supabase/client";
import { useSatUser } from "./use-sat-user";

export default function AuthStatus() {
  const { user, loading } = useSatUser();
  const router = useRouter();
  const supabase = getBrowserClient();

  // Nothing to show before Supabase is configured, or while resolving.
  if (!supabase || loading) return null;

  if (!user) {
    return (
      <Link
        href="/sat/login"
        className="text-sat-chalk-dim transition-colors hover:text-sat-chalk"
      >
        Sign in
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await supabase.auth.signOut();
        router.refresh();
      }}
      title={user.email ?? undefined}
      className="text-sat-chalk-dim transition-colors hover:text-sat-chalk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sat-chalk"
    >
      Sign out
    </button>
  );
}
