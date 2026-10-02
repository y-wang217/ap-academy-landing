import { getServerClient } from "@ap-academy/db/server";
import SignOutButton from "./sign-out-button";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/**
 * Placeholder (done-state spec): proves the shared session reaches the tracker.
 * Shows the signed-in email, plus a membership role if one exists. Feature
 * work follows the tracker MVP spec separately.
 */
export default async function TrackerHome() {
  const supabase = await getServerClient();

  if (!supabase) {
    return (
      <Shell>
        <p className="text-text-muted">Sign-in is not configured for this deployment.</p>
      </Shell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The middleware normally redirects first. Plain <a>: /login is landing's.
    return (
      <Shell>
        <a href="/login?next=/tracker" className="text-accent underline">
          Sign in
        </a>
      </Shell>
    );
  }

  // An error here (for example, the tracker schema not exposed yet) reads as
  // no membership. RLS limits the rows to this user's own.
  const { data: memberships } = await supabase
    .schema("tracker")
    .from("memberships")
    .select("role")
    .eq("user_id", user.id);
  const roles = [...new Set((memberships ?? []).map((m) => m.role))];

  return (
    <Shell>
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-xs uppercase tracking-widest text-text-muted">Signed in as</dt>
          <dd className="text-lg font-medium break-all">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-text-muted">Role</dt>
          <dd className="text-lg font-medium">
            {roles.length > 0 ? roles.join(", ") : "No tracker membership yet"}
          </dd>
        </div>
      </dl>
      <SignOutButton />
      <a href="/" className="text-sm text-text-muted underline">
        Back to the main site
      </a>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Tracker</h1>
      {children}
    </main>
  );
}
