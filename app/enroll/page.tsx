"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import {
  STRIPE_DEPOSIT_LINK,
  STRIPE_FULL_LINK,
  CONTACT,
  PRICING,
} from "../config";

export default function EnrollPage() {
  // Check if Stripe links are configured
  const depositLinkReady = STRIPE_DEPOSIT_LINK.length > 0;
  const fullLinkReady = STRIPE_FULL_LINK.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* MAIN CONTENT - Above the fold on mobile */}
      <section className="px-4 py-12 md:py-16">
        <div className="mx-auto max-w-[500px]">
          {/* Back link */}
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-text-muted hover:text-accent"
          >
            ← Back to home
          </Link>

          {/* Header */}
          <h1 className="mb-2 text-[24px] font-bold text-navy md:text-[32px]">
            You're one step from locking in the summer.
          </h1>
          <p className="mb-8 text-text-secondary">
            Choose how you'd like to get started.
          </p>

          {/* What's included */}
          <div className="mb-8 rounded-xl border border-border bg-surface p-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
              What's included
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span className="text-text-primary">
                  {PRICING.sessions} × {PRICING.sessionLength} 1-on-1 lessons
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span className="text-text-primary">
                  Any subject: Math, Physics, Chemistry, Biology, or English
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span className="text-text-primary">
                  Grade 11 or 12 (IB included)
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span className="text-text-primary">
                  {PRICING.guaranteeScore}+ guarantee on our AP-issued final
                </span>
              </li>
            </ul>
          </div>

          {/* Payment buttons */}
          <div className="space-y-4">
            {/* Primary: Deposit */}
            {depositLinkReady ? (
              <a
                href={STRIPE_DEPOSIT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-lg bg-accent px-8 py-5 text-lg font-bold text-white transition-all hover:bg-accent-hover hover:shadow-lg"
              >
                Reserve First Class — ${PRICING.deposit}
              </a>
            ) : (
              <button
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-accent/50 px-8 py-5 text-lg font-bold text-white"
              >
                Reserve First Class — ${PRICING.deposit}
                <span className="ml-2 text-sm font-normal opacity-75">
                  (Link not configured)
                </span>
              </button>
            )}

            {/* Secondary: Full payment */}
            {fullLinkReady ? (
              <a
                href={STRIPE_FULL_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-lg border-2 border-accent bg-transparent px-8 py-5 text-lg font-bold text-accent transition-all hover:bg-accent/5"
              >
                Pay Full Summer — ${PRICING.full}
              </a>
            ) : (
              <button
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center rounded-lg border-2 border-accent/50 bg-transparent px-8 py-5 text-lg font-bold text-accent/50"
              >
                Pay Full Summer — ${PRICING.full}
                <span className="ml-2 text-sm font-normal opacity-75">
                  (Link not configured)
                </span>
              </button>
            )}
          </div>

          {/* Stripe trust line */}
          <p className="mt-6 text-center text-sm text-text-muted">
            Secure checkout via Stripe. You'll get a receipt by email.
          </p>

          {/* Guarantee reminder */}
          <div className="mt-8 rounded-lg border border-border bg-background p-4 text-center">
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-accent">
                {PRICING.guaranteeScore}+ guarantee:
              </span>{" "}
              If your child doesn't hit {PRICING.guaranteeScore}% on our final,
              we keep teaching at no extra cost.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-4 py-8">
        <div className="mx-auto flex max-w-[800px] flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="AP Academy"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="font-semibold text-text-primary">AP Academy</span>
          </div>
          <div className="text-sm text-text-muted">
            <a href={`mailto:${CONTACT.email}`} className="hover:text-accent">
              {CONTACT.email}
            </a>
            {" · "}
            <a
              href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`}
              className="hover:text-accent"
            >
              ({CONTACT.phone.slice(0, 3)}) {CONTACT.phone.slice(4)}
            </a>
            {" · "}
            <Link href="/privacy" className="hover:text-accent">
              Privacy Policy
            </Link>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-text-muted">
          © {new Date().getFullYear()} AP Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
