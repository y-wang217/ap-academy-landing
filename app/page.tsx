"use client";

import Image from "next/image";
import Link from "next/link";
import { CONTACT, PRICING, ALEX_TESTIMONIAL_URL } from "./config";

// Course data with difficulty ratings (1-5 stars)
const COURSES = [
  {
    name: "Advanced Functions",
    code: "MHF4U",
    knowledge: 3,
    execution: 4,
    thinking: 3,
  },
  {
    name: "Calculus",
    code: "MCV4U",
    knowledge: 5,
    execution: 3,
    thinking: 5,
  },
  {
    name: "Physics",
    code: "SPH4U",
    knowledge: 4,
    execution: 5,
    thinking: 5,
  },
  {
    name: "Chemistry",
    code: "SCH4U",
    knowledge: 5,
    execution: 2,
    thinking: 3,
  },
  {
    name: "English",
    code: "ENG4U",
    knowledge: 1,
    execution: 5,
    thinking: 4,
  },
];

// Schedule slots (no Biology)
const MORNING_SLOTS = [
  { time: "8:00", subject: "Adv Func" },
  { time: "9:00", subject: "Calc" },
  { time: "10:00", subject: "Physics" },
  { time: "11:00", subject: "Chem" },
  { time: "12:00", subject: "English" },
];

const AFTERNOON_SLOTS = [
  { time: "1:00", subject: "English" },
  { time: "2:00", subject: "Chem" },
  { time: "3:00", subject: "Physics" },
  { time: "4:00", subject: "Calc" },
  { time: "5:00", subject: "Adv Func" },
];

// Star rating component
function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="text-[12px] tracking-wide">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? "text-accent" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
}

// Offer model callout component (repeated in multiple places)
function OfferCallout({ variant = "default" }: { variant?: "default" | "dark" }) {
  const isDark = variant === "dark";
  return (
    <div
      className={`rounded-sm border p-4 ${
        isDark
          ? "border-border-dark bg-dark/50"
          : "border-accent/30 bg-accent/5"
      }`}
    >
      <p
        className={`text-[13px] leading-relaxed ${
          isDark ? "text-text-on-dark-faint" : "text-text-secondary"
        }`}
      >
        <span className={`font-semibold ${isDark ? "text-accent" : "text-accent"}`}>
          100% online.
        </span>{" "}
        10 classes to learn the material and get tested. Enrollment is $
        {PRICING.deposit} — that gets your child into Lesson 1. After the first
        class, you choose to continue or not.
      </p>
    </div>
  );
}

export default function Home() {
  const alexLinkReady = ALEX_TESTIMONIAL_URL.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ANNOUNCEMENT BAR */}
      <div className="bg-dark">
        <div className="mx-auto max-w-[1180px] px-5 md:px-10 lg:px-12">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-on-dark">
              Summer 2026 enrollment open · limited slots
            </span>
            <Link
              href="/enroll"
              className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-accent-light hover:underline"
            >
              Reserve →
            </Link>
          </div>
        </div>
      </div>

      {/* NAV */}
      <div className="mx-auto max-w-[1180px] px-5 md:px-10 lg:px-12">
        <nav className="flex items-center justify-between pt-5">
          <span className="font-serif text-[21px] tracking-tight text-dark">
            AP Academy
          </span>
          <Link
            href="/enroll"
            className="font-mono text-[10px] uppercase tracking-wider text-dark hover:text-accent"
          >
            Enroll →
          </Link>
        </nav>
      </div>

      {/* HERO */}
      <div className="mx-auto max-w-[1180px] px-5 md:px-10 lg:px-12">
        <section className="pt-7 pb-1 lg:pt-[52px] lg:pb-6">
          {/* Grid: stacked on mobile, side-by-side on lg */}
          <div className="lg:grid lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16">
            {/* Copy */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
                Grade 11 & 12 · 100% Online
              </p>
              <h1 className="mt-4 font-serif text-[40px] font-normal leading-[1.06] tracking-tight text-dark sm:text-[47px] lg:text-[66px] xl:text-[78px]">
                Get a 95+ on science and math —{" "}
                <span className="italic text-accent">start this summer.</span>
              </h1>
              <p className="mt-6 max-w-[44ch] text-[15px] leading-relaxed text-text-secondary">
                10 classes. One transparent system. $70 to start with Lesson 1 —
                then you decide if it's right for your child.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-5">
                <Link
                  href="/enroll"
                  className="inline-block rounded-sm bg-dark px-6 py-3.5 text-[14px] font-semibold text-text-on-dark transition-colors hover:bg-dark/90"
                >
                  Start for ${PRICING.deposit}
                </Link>
                {alexLinkReady ? (
                  <a
                    href={ALEX_TESTIMONIAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-b-[1.5px] border-accent pb-0.5 text-[13px] font-semibold text-dark hover:text-accent"
                  >
                    See how it worked for other students →
                  </a>
                ) : (
                  <Link
                    href="/how-it-works"
                    className="border-b-[1.5px] border-accent pb-0.5 text-[13px] font-semibold text-dark hover:text-accent"
                  >
                    See how it worked for other students →
                  </Link>
                )}
              </div>

              {/* Offer model - first mention */}
              <div className="mt-8">
                <OfferCallout />
              </div>
            </div>

            {/* Photo */}
            <div className="mt-8 lg:mt-0">
              <div className="border-l-[3px] border-accent pl-4">
                <Image
                  src="/teacher.jpeg"
                  alt="Yale Wang — Founder and lead instructor"
                  width={600}
                  height={750}
                  className="w-full rounded-sm lg:aspect-[4/5] lg:max-h-[600px] lg:object-cover lg:object-[50%_24%]"
                  priority
                />
                <p className="mt-3 font-mono text-[10.5px] uppercase tracking-wide text-text-muted">
                  Yale Wang — Founder & lead instructor
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ALEX PROOF + STATS BAR (replaces Google reviews) */}
      <div className="mt-8 bg-dark lg:mt-0">
        <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-10 lg:px-12 lg:py-[60px]">
          {/* Alex testimonial click */}
          {alexLinkReady ? (
            <a
              href={ALEX_TESTIMONIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <p className="text-[15px] leading-relaxed text-text-on-dark group-hover:text-accent">
                See how it worked for Alex — 99 in Calculus, into Electrical
                Engineering at Waterloo (2026){" "}
                <span className="text-accent">→</span>
              </p>
            </a>
          ) : (
            <p className="text-[15px] leading-relaxed text-text-on-dark-faint">
              See how it worked for Alex — 99 in Calculus, into Electrical
              Engineering at Waterloo (2026)
              <span className="ml-2 font-mono text-[10px] text-text-muted">
                (link coming soon)
              </span>
            </p>
          )}

          <div className="my-5 h-px bg-border-dark" />

          {/* Stats: 3+ years, 100+ students, 100% passion */}
          <div className="flex justify-between gap-4 lg:justify-start lg:gap-[84px]">
            <div>
              <p className="font-serif text-[30px] text-text-on-dark">3+</p>
              <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-on-dark-muted">
                years of tutoring
              </p>
            </div>
            <div>
              <p className="font-serif text-[30px] text-text-on-dark">100+</p>
              <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-on-dark-muted">
                students coached
              </p>
            </div>
            <div>
              <p className="font-serif text-[30px] text-text-on-dark">100%</p>
              <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-on-dark-muted">
                passion to teach
              </p>
            </div>
          </div>

          <div className="my-5 h-px bg-border-dark" />

          <p className="font-mono text-[10px] uppercase tracking-widest leading-loose text-text-on-dark-faint">
            WATERLOO · UofT · WESTERN · McMASTER · QUEEN'S
          </p>
        </div>
      </div>

      {/* BULLETPROOF METHOD */}
      <div className="mx-auto max-w-[880px] px-5 md:px-10 lg:px-12">
        <section className="py-10 lg:py-[88px]">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
            The system
          </p>
          <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark lg:text-[46px]">
            The Bulletproof Method
          </h2>

          {/* 4-step cycle visual */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:gap-4">
            {["Practice", "Feedback", "Test", "Repeat"].map((step, i) => (
              <div key={step} className="flex items-center gap-3 lg:gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent bg-accent/10 lg:h-20 lg:w-20">
                  <span className="font-serif text-[18px] text-dark lg:text-[22px]">
                    {step}
                  </span>
                </div>
                {i < 3 && (
                  <span className="text-[20px] text-accent lg:text-[24px]">
                    →
                  </span>
                )}
                {i === 3 && (
                  <span className="text-[20px] text-accent lg:text-[24px]">
                    ↻
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-[15px] text-text-secondary">
            How to stop making mistakes so your grades become consistent.
          </p>
        </section>
      </div>

      {/* COURSES WITH DIFFICULTY RATINGS */}
      <div className="bg-surface">
        <div className="mx-auto max-w-[880px] px-5 md:px-10 lg:px-12">
          <section className="py-10 lg:py-[88px]">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
              What we teach
            </p>
            <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark lg:text-[46px]">
              Five courses.
              <br />
              One method.
            </h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COURSES.map((course) => (
                <div
                  key={course.name}
                  className="rounded-sm border border-border bg-background p-5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-serif text-[20px] text-dark">
                      {course.name}
                    </h3>
                    <span className="whitespace-nowrap rounded-sm border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-muted">
                      {course.code}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                        Knowledge
                      </span>
                      <Stars count={course.knowledge} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                        Execution
                      </span>
                      <Stars count={course.execution} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                        Thinking
                      </span>
                      <Stars count={course.thinking} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* SCHEDULE */}
      <div className="mx-auto max-w-[880px] px-5 md:px-10 lg:px-12">
        <section className="py-10 lg:py-[88px]">
          <div className="mx-auto max-w-[640px]">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
              The summer plan
            </p>
            <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark lg:text-[46px]">
              Stack a full day.
            </h2>
            <p className="mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-text-secondary">
              Ten one-hour slots, every weekday. More availability to match your plans.
            </p>

            <div className="mt-6 flex gap-4">
              {/* Morning */}
              <div className="flex-1">
                <div className="border-b-2 border-dark pb-2 font-mono text-[10px] uppercase tracking-wide text-dark">
                  Morning · 8–1
                </div>
                {MORNING_SLOTS.map((slot) => (
                  <div
                    key={slot.time}
                    className="flex justify-between border-b border-border py-2.5 text-[12px]"
                  >
                    <span className="font-mono text-text-muted">
                      {slot.time}
                    </span>
                    <span className="font-semibold text-accent">
                      {slot.subject}
                    </span>
                  </div>
                ))}
              </div>

              {/* Afternoon */}
              <div className="flex-1">
                <div className="border-b-2 border-dark pb-2 font-mono text-[10px] uppercase tracking-wide text-dark">
                  Afternoon · 1–6
                </div>
                {AFTERNOON_SLOTS.map((slot) => (
                  <div
                    key={slot.time}
                    className="flex justify-between border-b border-border py-2.5 text-[12px]"
                  >
                    <span className="font-mono text-text-muted">
                      {slot.time}
                    </span>
                    <span className="font-semibold text-accent">
                      {slot.subject}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* OFFER MODEL - mid-page repeat */}
      <div className="bg-surface">
        <div className="mx-auto max-w-[880px] px-5 py-10 md:px-10 lg:px-12 lg:py-[60px]">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-widest text-accent">
            How it works
          </p>
          <OfferCallout />
          <div className="mt-4 text-center">
            <Link
              href="/how-it-works"
              className="inline-block font-mono text-[11px] uppercase tracking-wide text-dark hover:text-accent"
            >
              See the full breakdown →
            </Link>
          </div>
        </div>
      </div>

      {/* GUARANTEE */}
      <div className="bg-accent text-[#F8EDE6]">
        <div className="mx-auto max-w-[1180px] px-5 md:px-10 lg:px-12">
          <section className="py-12 lg:py-[100px]">
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#F8C9BD]">
              The promise
            </p>
            <h2 className="mt-4 font-serif text-[46px] font-normal leading-none lg:text-[74px]">
              A 95+ average —
              <br />
              or we keep teaching, free.
            </h2>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed">
              If your student completes the program and doesn't reach a 95+,
              they keep coming — on us — until they do. We can put that in
              writing because the Bulletproof Method earns it, every time.
            </p>
          </section>
        </div>
      </div>

      {/* PRICING */}
      <div className="bg-dark">
        <div className="mx-auto max-w-[880px] px-5 md:px-10 lg:px-12">
          <section className="py-11 lg:py-[88px]">
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
              Enroll
            </p>
            <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-text-on-dark lg:text-[46px]">
              Two ways to begin.
            </h2>

            {/* Offer model - near CTA repeat */}
            <div className="mt-4">
              <OfferCallout variant="dark" />
            </div>

            {/* Price cards: stacked on mobile, side-by-side on lg */}
            <div className="mt-6 space-y-3.5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              {/* $70 option */}
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
                  Unlocks Lesson 1. Experience the Bulletproof Method live — no
                  commitment.
                </p>
              </div>

              {/* $600 option */}
              <div className="rounded-sm border-[1.5px] border-accent bg-accent-bg p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-[38px] text-text-on-dark">
                      ${PRICING.full}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-text-on-dark-muted">
                      full program
                    </span>
                  </div>
                  <span className="rounded-sm bg-accent px-2 py-1 font-mono text-[8.5px] uppercase tracking-wide text-[#F8EDE6]">
                    Best value
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-text-on-dark-faint">
                  All 10 lessons, the complete Bulletproof Method, and the 95+
                  guarantee.
                </p>
              </div>
            </div>

            <Link
              href="/enroll"
              className="mt-5 block w-full rounded-sm bg-accent py-4 text-center text-[15px] font-bold text-[#F8EDE6] transition-colors hover:bg-accent/90"
            >
              Reserve Lesson 1 — ${PRICING.deposit} →
            </Link>

            <p className="mt-4 text-center font-mono text-[9.5px] uppercase tracking-wide text-text-muted">
              AP Academy · 100% Online · Est. 2019
            </p>
          </section>
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
              <Link href="/how-it-works" className="hover:text-accent">
                How it works
              </Link>
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
