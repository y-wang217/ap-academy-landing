import Link from "next/link";
import { CONTACT } from "./config";
import Hero from "@/components/Hero";
import PathToWaterloo from "@/components/PathToWaterloo";
import FAQ from "@/components/FAQ";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header + hero share a viewport-height block sized so the first path
          node peeks above the fold on a 390px viewport — the peek causes the scroll. */}
      <div className="flex min-h-[calc(100svh-270px)] flex-col md:min-h-[calc(100svh-160px)]">
        <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-5 py-5 md:px-10">
          <span className="whitespace-nowrap font-serif text-[22px] tracking-tight">AP Academy</span>
          <a
            href={CONTACT.calendly}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90"
          >
            Book a call
          </a>
        </header>

        <Hero />
      </div>

      <PathToWaterloo />

      <FAQ />

      {/* CLOSING CTA */}
      <section className="mx-auto max-w-[880px] px-5 pb-20 pt-4 text-center md:px-10">
        <h2 className="shead text-[34px] md:text-[42px]">See the path for your child</h2>
        <p className="mx-auto mt-3.5 max-w-[46ch] text-center text-[16px] leading-relaxed text-text-muted">
          A 30-minute call with Mr. Charlie. Bring your child&apos;s current
          marks and goals — leave with a clear next step.
        </p>
        <a
          href={CONTACT.calendly}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-block rounded-xl bg-accent px-10 py-4 text-[16px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
        >
          Book a call with Mr. Charlie
        </a>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-5 py-8 md:px-10">
        <div className="mx-auto max-w-[1160px]">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="font-serif text-[18px] text-dark">AP Academy</span>
            <div className="flex flex-wrap justify-center gap-3 text-[12px] text-text-muted">
              <a
                href={`mailto:${CONTACT.email}`}
                className="hover:text-accent"
              >
                {CONTACT.email}
              </a>
              <span>·</span>
              <a
                href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`}
                className="hover:text-accent"
              >
                ({CONTACT.phone.slice(0, 3)}) {CONTACT.phone.slice(4)}
              </a>
              <span>·</span>
              <Link href="/privacy" className="hover:text-accent">
                Privacy Policy
              </Link>
            </div>
            <p className="text-[11px] text-text-faint">
              © {new Date().getFullYear()} AP Academy
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
