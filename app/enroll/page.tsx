"use client";

import Link from "next/link";
import {
  STRIPE_DEPOSIT_LINK,
  STRIPE_FULL_LINK,
  CONTACT,
  PRICING,
} from "../config";

export default function EnrollPage() {
  const depositLinkReady = STRIPE_DEPOSIT_LINK.length > 0;
  const fullLinkReady = STRIPE_FULL_LINK.length > 0;

  return (
    <div className="min-h-screen bg-dark">
      {/* NAV */}
      <nav className="flex items-center justify-between px-5 py-5">
        <Link
          href="/"
          className="font-serif text-[21px] tracking-tight text-text-on-dark"
        >
          AP Academy
        </Link>
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-wider text-text-on-dark-muted hover:text-accent"
        >
          ← Back
        </Link>
      </nav>

      {/* MAIN CONTENT */}
      <section className="px-5 pb-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          Enroll
        </p>
        <h1 className="mt-3 font-serif text-[33px] font-normal leading-[1.1] text-text-on-dark">
          You're one step from
          <br />
          locking in the summer.
        </h1>

        {/* What's included */}
        <div className="mt-8 rounded-sm border border-border-dark p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-on-dark-muted">
            What's included
          </p>
          <ul className="mt-4 space-y-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-[#F8EDE6]">
                ✓
              </span>
              <span className="text-[14px] text-text-on-dark">
                {PRICING.sessions} × {PRICING.sessionLength} 1-on-1 lessons
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-[#F8EDE6]">
                ✓
              </span>
              <span className="text-[14px] text-text-on-dark">
                Any subject: Advanced Functions, Calculus, Physics, Chemistry, or English
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-[#F8EDE6]">
                ✓
              </span>
              <span className="text-[14px] text-text-on-dark">
                Grade 11 or 12 (IB included)
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-[#F8EDE6]">
                ✓
              </span>
              <span className="text-[14px] text-text-on-dark">
                {PRICING.guaranteeScore}+ guarantee on our AP-issued final
              </span>
            </li>
          </ul>
        </div>

        {/* Payment options */}
        <div className="mt-6 space-y-4">
          {/* $70 deposit */}
          <div className="rounded-sm border border-border-dark p-5">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[38px] text-text-on-dark">
                ${PRICING.deposit}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-on-dark-muted">
                to start
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-on-dark-faint">
              A diagnostic plus your first session. No subscription — cancel
              anytime.
            </p>
            {depositLinkReady ? (
              <a
                href={STRIPE_DEPOSIT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block w-full rounded-sm bg-text-on-dark py-3.5 text-center text-[14px] font-semibold text-dark transition-colors hover:bg-text-on-dark/90"
              >
                Reserve First Class →
              </a>
            ) : (
              <button
                disabled
                className="mt-4 block w-full cursor-not-allowed rounded-sm bg-text-on-dark/50 py-3.5 text-center text-[14px] font-semibold text-dark/70"
              >
                Reserve First Class
                <span className="ml-2 text-[11px] font-normal">
                  (Link not set)
                </span>
              </button>
            )}
          </div>

          {/* $600 full */}
          <div className="rounded-sm border-[1.5px] border-accent bg-accent-bg p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-[38px] text-text-on-dark">
                  ${PRICING.full}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-on-dark-muted">
                  full summer
                </span>
              </div>
              <span className="rounded-sm bg-accent px-2 py-1 font-mono text-[8.5px] uppercase tracking-wide text-[#F8EDE6]">
                Best value
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-on-dark-faint">
              All ten weekly slots, the complete Bulletproof Method, and the 95+
              guarantee.
            </p>
            {fullLinkReady ? (
              <a
                href={STRIPE_FULL_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block w-full rounded-sm bg-accent py-3.5 text-center text-[14px] font-bold text-[#F8EDE6] transition-colors hover:bg-accent/90"
              >
                Pay Full Summer →
              </a>
            ) : (
              <button
                disabled
                className="mt-4 block w-full cursor-not-allowed rounded-sm bg-accent/50 py-3.5 text-center text-[14px] font-bold text-[#F8EDE6]/70"
              >
                Pay Full Summer
                <span className="ml-2 text-[11px] font-normal">
                  (Link not set)
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Trust line */}
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-wide text-text-on-dark-muted">
          Secure checkout via Stripe · Receipt by email
        </p>

        {/* Guarantee reminder */}
        <div className="mt-6 rounded-sm border border-accent/30 bg-accent/5 p-4">
          <p className="text-center text-[13px] text-text-on-dark-faint">
            <span className="font-semibold text-accent">
              {PRICING.guaranteeScore}+ guarantee:
            </span>{" "}
            If your child doesn't hit {PRICING.guaranteeScore}% on our final, we
            keep teaching at no extra cost.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border-dark px-5 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="font-serif text-[18px] text-text-on-dark">
            AP Academy
          </span>
          <div className="flex flex-wrap justify-center gap-3 text-[12px] text-text-on-dark-muted">
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
              Privacy
            </Link>
          </div>
          <p className="text-[11px] text-text-faint">
            © {new Date().getFullYear()} AP Academy
          </p>
        </div>
      </footer>
    </div>
  );
}
