"use client";

import Image from "next/image";
import Link from "next/link";
import { Calculator, Atom, FlaskConical, Dna, BookOpen } from "lucide-react";
import { CONTACT, PRICING, SUBJECTS } from "./config";

// Icon mapping for subjects
const SUBJECT_ICONS = {
  calculator: Calculator,
  atom: Atom,
  "flask-conical": FlaskConical,
  dna: Dna,
  "book-open": BookOpen,
} as const;

function CTAButton({
  href,
  large = false,
  children,
}: {
  href: string;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-lg bg-accent font-bold text-white transition-all hover:bg-accent-hover hover:shadow-lg ${
        large ? "px-10 py-5 text-lg" : "px-8 py-4"
      }`}
    >
      {children}
    </Link>
  );
}

function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-accent hover:underline"
    >
      {children} →
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <section className="px-4 py-16 md:py-20 lg:py-24">
        <div className="mx-auto max-w-[900px] text-center">
          <h1 className="mb-6 text-[28px] font-bold leading-tight text-navy md:text-[40px] lg:text-[48px]">
            Lock in a 95+ this summer — or we keep teaching until you do.
          </h1>
          <p className="mx-auto mb-8 max-w-[700px] text-[18px] leading-relaxed text-text-secondary md:text-[20px]">
            {PRICING.sessions} focused {PRICING.sessionLength} lessons. Grade 11
            & 12 Math, Physics, Chemistry, Biology, and English. Taught the way
            it actually sticks.
          </p>
          <div className="flex flex-col items-center gap-4">
            <CTAButton href="/enroll" large>
              Reserve a spot — ${PRICING.deposit}
            </CTAButton>
            <SecondaryLink href="/info">See how it works</SecondaryLink>
          </div>
        </div>
      </section>

      {/* SUBJECTS */}
      <section className="border-y border-border bg-surface px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-10 text-center text-[24px] font-bold text-navy md:text-[32px]">
            Subjects We Cover
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {SUBJECTS.map((subject) => {
              const IconComponent =
                SUBJECT_ICONS[subject.icon as keyof typeof SUBJECT_ICONS];
              return (
                <div
                  key={subject.name}
                  className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background p-6 text-center"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                    <IconComponent className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">
                      {subject.name}
                    </p>
                    <p className="text-sm text-text-muted">
                      Grade 11 & 12
                      <br />
                      <span className="text-xs">(IB included)</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SUMMER SCHEDULE INFOGRAPHIC */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-4 text-center text-[24px] font-bold text-navy md:text-[32px]">
            Build Your Child's Summer
          </h2>
          <p className="mx-auto mb-10 max-w-[600px] text-center text-text-secondary">
            Stack subjects across two daily blocks — a focused hour each, up to
            a full day if they're keen.
          </p>

          {/* Schedule Grid */}
          <div className="space-y-8">
            {/* Morning Block */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                  Morning Block
                </span>
                <span className="text-sm text-text-muted">8:00 AM – 1:00 PM</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {["8–9", "9–10", "10–11", "11–12", "12–1"].map((time) => (
                  <div
                    key={`am-${time}`}
                    className="flex flex-col items-center rounded-lg border border-border bg-surface p-3 text-center"
                  >
                    <span className="text-xs font-medium text-text-muted">
                      {time}
                    </span>
                    <span className="mt-1 text-sm text-text-secondary">
                      1 hr
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Afternoon Block */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                  Afternoon Block
                </span>
                <span className="text-sm text-text-muted">1:00 PM – 6:00 PM</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {["1–2", "2–3", "3–4", "4–5", "5–6"].map((time) => (
                  <div
                    key={`pm-${time}`}
                    className="flex flex-col items-center rounded-lg border border-border bg-surface p-3 text-center"
                  >
                    <span className="text-xs font-medium text-text-muted">
                      {time}
                    </span>
                    <span className="mt-1 text-sm text-text-secondary">
                      1 hr
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Subject Pills */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <span className="text-sm text-text-muted">Pick any:</span>
            {SUBJECTS.map((subject) => (
              <span
                key={subject.name}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-secondary"
              >
                {subject.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* GUARANTEE */}
      <section className="border-y border-border bg-surface px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[700px] text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <span className="text-2xl font-bold text-accent">
              {PRICING.guaranteeScore}+
            </span>
          </div>
          <h2 className="mb-4 text-[24px] font-bold text-navy md:text-[32px]">
            The {PRICING.guaranteeScore}+ Guarantee
          </h2>
          <p className="text-[18px] leading-relaxed text-text-secondary">
            If your child scores below {PRICING.guaranteeScore}% on our
            AP-issued final exam, we keep working with them until they hit it.
            No extra charge.
          </p>
        </div>
      </section>

      {/* PRICING / HOW IT WORKS */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[700px] text-center">
          <h2 className="mb-8 text-[24px] font-bold text-navy md:text-[32px]">
            Simple Pricing
          </h2>
          <div className="mb-8 rounded-xl border border-border bg-surface p-8">
            <p className="mb-2 text-[32px] font-bold text-navy md:text-[40px]">
              ${PRICING.full}
            </p>
            <p className="mb-6 text-text-secondary">
              for {PRICING.sessions} × {PRICING.sessionLength} lessons
            </p>
            <div className="space-y-3 text-left text-text-secondary">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-white">
                  ✓
                </span>
                <span>
                  Start with a <strong>${PRICING.deposit} deposit</strong> to
                  reserve the first class
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-white">
                  ✓
                </span>
                <span>The rest is arranged after — no pressure</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-white">
                  ✓
                </span>
                <span>
                  Or <strong>pay the full ${PRICING.full} upfront</strong> and
                  you're all set
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-navy px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="mb-4 text-[24px] font-bold text-white md:text-[32px]">
            Ready to lock in a strong summer?
          </h2>
          <p className="mb-8 text-text-muted">
            Reserve your child's spot with a ${PRICING.deposit} deposit. First
            class scheduled within 48 hours.
          </p>
          <CTAButton href="/enroll" large>
            Reserve a spot — ${PRICING.deposit}
          </CTAButton>
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
            <a href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`} className="hover:text-accent">
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
