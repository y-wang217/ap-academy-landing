import type { Metadata } from "next";
import { safeNextPath } from "@ap-academy/db/paths";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | AP Academy",
  robots: { index: false, follow: false },
};

/**
 * The one login page for every app on the domain except SAT, which keeps its
 * own at /sat/login (ADR 0002). Apps send people here with ?next=<path>; only
 * same-origin paths are honoured.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return <LoginForm next={safeNextPath(next, "/")} linkFailed={error === "link"} />;
}
