"use client";

import Link from "next/link";
import { CONTACT, PRICING } from "../config";

const STEPS = [
  {
    number: "01",
    title: "Enroll — $70",
    description:
      "Unlocks Lesson 1. 100% online. No commitment beyond the first class.",
    highlight: true,
  },
  {
    number: "02",
    title: "Try Lesson 1",
    description:
      "Experience the Bulletproof Method live. See exactly how we teach before you commit to anything more.",
    highlight: false,
  },
  {
    number: "03",
    title: "Decide",
    description:
      "Continue the full 10-lesson program, or stop. Your call. No pressure, no subscriptions.",
    highlight: false,
  },
  {
    number: "04",
    title: "Master & get tested",
    description:
      "Complete all 10 lessons, then take our AP-issued final. 95+ or we keep teaching, free.",
    highlight: false,
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <div className="mx-auto max-w-[1180px] px-5 md:px-10 lg:px-12">
        <nav className="flex items-center justify-between py-5">
          <Link
            href="/"
            className="font-serif text-[21px] tracking-tight text-dark"
          >
            AP Academy
          </Link>
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-wider text-dark hover:text-accent"
          >
            ← Back
          </Link>
        </nav>
      </div>

      {/* HEADER */}
      <div className="mx-auto max-w-[880px] px-5 md:px-10 lg:px-12">
        <section className="pt-4 pb-8 lg:pt-8 lg:pb-12">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
            How it works
          </p>
          <h1 className="mt-4 font-serif text-[36px] font-normal leading-[1.1] tracking-tight text-dark sm:text-[42px] lg:text-[54px]">
            Try before you commit.
          </h1>
          <p className="mt-4 max-w-[50ch] text-[15px] leading-relaxed text-text-secondary">
            We know tutoring is an investment. That's why we let you experience
            Lesson 1 for just ${PRICING.deposit} — no strings attached.
          </p>
        </section>
      </div>

      {/* STEP-BY-STEP INFOGRAPHIC */}
      <div className="bg-surface">
        <div className="mx-auto max-w-[880px] px-5 py-10 md:px-10 lg:px-12 lg:py-[80px]">
          <div className="space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative">
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[27px] top-[60px] h-[calc(100%-20px)] w-[2px] bg-border lg:left-[31px]" />
                )}

                <div
                  className={`relative flex gap-5 rounded-sm py-6 lg:gap-8 ${
                    step.highlight ? "bg-accent/5" : ""
                  }`}
                >
                  {/* Number circle */}
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 lg:h-16 lg:w-16 ${
                      step.highlight
                        ? "border-accent bg-accent text-[#F8EDE6]"
                        : "border-border bg-background text-dark"
                    }`}
                  >
                    <span className="font-mono text-[14px] font-bold lg:text-[16px]">
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <h3
                      className={`font-serif text-[24px] lg:text-[28px] ${
                        step.highlight ? "text-accent" : "text-dark"
                      }`}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-[44ch] text-[14px] leading-relaxed text-text-secondary">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRICING CLARITY */}
      <div className="mx-auto max-w-[880px] px-5 py-10 md:px-10 lg:px-12 lg:py-[80px]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          The numbers
        </p>
        <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark lg:text-[46px]">
          Simple pricing.
          <br />
          No surprises.
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {/* $70 card */}
          <div className="rounded-sm border-2 border-accent bg-accent/5 p-6">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[48px] text-dark">
                ${PRICING.deposit}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-accent">
              Lesson 1 only
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              Test the Bulletproof Method. If it's not right for your child,
              stop here. No obligation.
            </p>
          </div>

          {/* $600 card */}
          <div className="rounded-sm border border-border bg-background p-6">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[48px] text-dark">
                ${PRICING.full}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-text-muted">
              Full 10-lesson program
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
              All 10 classes + our AP-issued final exam. Includes the 95+
              guarantee — or we keep teaching, free.
            </p>
          </div>
        </div>

        {/* Clarity statement */}
        <div className="mt-8 rounded-sm border border-accent/30 bg-accent/5 p-5">
          <p className="text-[14px] leading-relaxed text-text-secondary">
            <span className="font-semibold text-accent">In plain terms:</span>{" "}
            It's 100% online. 10 classes to learn the material and get tested.
            Enrollment is ${PRICING.deposit} — that gets your child into Lesson
            1. After the first class, you choose to continue or not.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-dark">
        <div className="mx-auto max-w-[880px] px-5 py-12 md:px-10 lg:px-12 lg:py-[80px]">
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
              Ready to start?
            </p>
            <h2 className="mt-4 font-serif text-[33px] font-normal leading-[1.1] text-text-on-dark lg:text-[42px]">
              Try Lesson 1.
              <br />
              See if it clicks.
            </h2>
            <p className="mx-auto mt-4 max-w-[40ch] text-[14px] leading-relaxed text-text-on-dark-faint">
              ${PRICING.deposit} unlocks your first class. No subscriptions, no
              hidden fees. Just one lesson to see if we're the right fit.
            </p>
            <Link
              href="/enroll"
              className="mt-8 inline-block rounded-sm bg-accent px-10 py-4 text-[15px] font-bold text-[#F8EDE6] transition-colors hover:bg-accent/90"
            >
              Reserve Lesson 1 — ${PRICING.deposit}
            </Link>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-5 py-8 md:px-10 lg:px-12">
        <div className="mx-auto max-w-[1180px]">
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
                Privacy
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
