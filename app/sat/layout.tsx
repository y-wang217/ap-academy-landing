import Link from "next/link";
import { Fraunces, Public_Sans } from "next/font/google";
import { CONTACT } from "../config";

// Self-hosted at build time and scoped to /sat, so the main site's pages never
// download them. Exposed as CSS variables the --font-sat-* tokens point at.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-sat-display-loaded",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sat-sans-loaded",
});

export default function SatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${fraunces.variable} ${publicSans.variable} sat-board flex min-h-screen flex-col font-sat-sans text-sat-chalk`}
    >
      <header className="border-b border-sat-chalk-faint">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-4 px-5 py-4">
          <Link
            href="/sat"
            className="font-sat-display text-[17px] font-semibold tracking-[0.01em] text-sat-chalk"
          >
            SAT Vocab
          </Link>
          <nav className="flex items-center gap-5 text-[13px]">
            <Link
              href="/sat"
              className="text-sat-chalk-dim transition-colors hover:text-sat-chalk"
            >
              Flashcards
            </Link>
            <Link
              href="/sat/quiz"
              className="text-sat-chalk-dim transition-colors hover:text-sat-chalk"
            >
              Quiz
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-sat-chalk-faint">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-center gap-x-3 gap-y-2 px-5 py-6 text-center text-[11.5px] text-sat-chalk-dim">
          <Link href="/" className="hover:text-sat-chalk">
            AP Academy
          </Link>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${CONTACT.email}`} className="hover:text-sat-chalk">
            {CONTACT.email}
          </a>
          <span aria-hidden="true">·</span>
          <Link href="/privacy" className="hover:text-sat-chalk">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
