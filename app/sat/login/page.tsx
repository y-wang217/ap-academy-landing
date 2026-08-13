import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | SAT Vocab",
  description:
    "Sign in with a magic link to lift the daily quiz limit and track the words you keep missing.",
  robots: { index: false, follow: true },
};

/** Only same-origin paths, so `next` can't be used as an open redirect. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/sat";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(next)} />;
}
