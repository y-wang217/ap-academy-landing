import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "../sat/supabase/server";
import UnsubscribeButton from "./unsubscribe-button";

export const metadata: Metadata = {
  title: "Unsubscribe | AP Academy",
  description: "Stop receiving marketing email from AP Academy.",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const supabase = await getServerClient();
  const valid = typeof token === "string" && UUID.test(token);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-16">
      <div className="mx-auto w-full max-w-[46ch] text-center">
        <span className="font-serif text-[20px] text-dark">AP Academy</span>

        {!supabase || !valid ? (
          <>
            <h1 className="mt-6 font-serif text-[28px] leading-tight text-dark">
              We couldn&apos;t read that link
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
              The unsubscribe link may have been broken by your email client. Reply
              to any of our emails, or write to{" "}
              <a href="mailto:y.wang217@gmail.com" className="text-accent underline">
                y.wang217@gmail.com
              </a>{" "}
              and we&apos;ll take you off the list.
            </p>
          </>
        ) : (
          <UnsubscribeButton token={token} />
        )}

        <p className="mt-8 text-[12px] text-text-faint">
          <Link href="/" className="hover:text-accent">
            ap-academy-landing.vercel.app
          </Link>
        </p>
      </div>
    </div>
  );
}
