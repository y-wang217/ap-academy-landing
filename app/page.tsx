"use client";

import Image from "next/image";
import Link from "next/link";
import { CONTACT, PRICING } from "./config";

// Subject data with course codes
const SUBJECTS = [
  {
    num: "01",
    name: "Mathematics",
    grades: "Gr 11–12",
    detail: "Advanced Functions · Calculus & Vectors · MCR3U",
  },
  {
    num: "02",
    name: "Physics",
    grades: "Gr 11–12",
    detail: "SPH3U / SPH4U — mechanics through fields",
  },
  {
    num: "03",
    name: "Chemistry",
    grades: "Gr 11–12",
    detail: "SCH3U / SCH4U — moles through equilibrium",
  },
  {
    num: "04",
    name: "Biology",
    grades: "Gr 11–12",
    detail: "SBI3U / SBI4U — cells through genetics",
  },
  {
    num: "05",
    name: "English",
    grades: "Gr 11–12",
    detail: "ENG3U / ENG4U — essays that actually argue",
  },
];

// Schedule slots
const MORNING_SLOTS = [
  { time: "8:00", subject: "Math" },
  { time: "9:00", subject: "Math" },
  { time: "10:00", subject: null },
  { time: "11:00", subject: "Physics" },
  { time: "12:00", subject: null },
];

const AFTERNOON_SLOTS = [
  { time: "1:00", subject: "Chem" },
  { time: "2:00", subject: null },
  { time: "3:00", subject: "Bio" },
  { time: "4:00", subject: null },
  { time: "5:00", subject: "English" },
];

// Results/testimonials
const RESULTS = [
  {
    before: 74,
    after: 96,
    name: "Aanya R.",
    subject: "Advanced Functions",
    quote: "She finally stopped dreading Sunday-night homework.",
  },
  {
    before: 81,
    after: 95,
    name: "Marcus T.",
    subject: "Chemistry",
    quote: "Went from panic to explaining it to his friends.",
  },
  {
    before: 88,
    after: 99,
    name: "Priya S.",
    subject: "Calculus",
    quote: "The 99 got her the Waterloo offer.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* ANNOUNCEMENT BAR */}
      <div className="flex items-center justify-between gap-4 bg-dark px-5 py-3">
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

      {/* NAV */}
      <nav className="flex items-center justify-between px-5 pt-5">
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

      {/* HERO */}
      <section className="px-5 pt-7">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          Grade 11 & 12 · Greater Toronto Area
        </p>
        <h1 className="mt-4 font-serif text-[40px] font-normal leading-[1.06] tracking-tight text-dark sm:text-[47px]">
          A 95+ average —{" "}
          <span className="italic text-accent">
            or we keep teaching, free.
          </span>
        </h1>
        <p className="mt-6 max-w-[36ch] text-[15px] leading-relaxed text-text-secondary">
          Summer prep built on one transparent system — the Bulletproof Method.
          We tell you exactly what you're paying for: the hours, the plan, and
          the proof.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-5">
          <Link
            href="/enroll"
            className="inline-block rounded-sm bg-dark px-6 py-3.5 text-[14px] font-semibold text-text-on-dark transition-colors hover:bg-dark/90"
          >
            Start for ${PRICING.deposit}
          </Link>
          <Link
            href="/info"
            className="border-b-[1.5px] border-accent pb-0.5 text-[13px] font-semibold text-dark hover:text-accent"
          >
            See how it works →
          </Link>
        </div>
      </section>

      {/* HERO IMAGE */}
      <section className="px-5 pt-8">
        <div className="border-l-[3px] border-accent pl-4">
          <Image
            src="/teacher.jpeg"
            alt="Yale Wang — Founder and lead instructor"
            width={600}
            height={400}
            className="w-full rounded-sm"
            priority
          />
          <p className="mt-3 font-mono text-[10.5px] uppercase tracking-wide text-text-muted">
            Yale Wang — Founder & lead instructor
          </p>
        </div>
      </section>

      {/* PROOF BAR */}
      <section className="mt-8 bg-dark px-5 py-8">
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-[44px] leading-none text-text-on-dark">
            4.9
          </span>
          <span className="text-[18px] tracking-wider text-accent">★★★★★</span>
        </div>
        <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-wide text-text-on-dark-muted">
          Google reviews · 127 families
        </p>

        <div className="my-5 h-px bg-border-dark" />

        <div className="flex justify-between gap-4">
          <div>
            <p className="font-serif text-[30px] text-text-on-dark">+18</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-on-dark-muted">
              avg. point gain
            </p>
          </div>
          <div>
            <p className="font-serif text-[30px] text-text-on-dark">300+</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-on-dark-muted">
              students coached
            </p>
          </div>
          <div>
            <p className="font-serif text-[30px] text-text-on-dark">10</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-on-dark-muted">
              weekly slots
            </p>
          </div>
        </div>

        <div className="my-5 h-px bg-border-dark" />

        <p className="font-mono text-[10px] uppercase tracking-widest leading-loose text-text-on-dark-faint">
          WATERLOO · UofT · WESTERN · McMASTER · QUEEN'S
        </p>
      </section>

      {/* SUBJECTS */}
      <section className="px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          What we teach
        </p>
        <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark">
          Five subjects.
          <br />
          One method.
        </h2>

        <div className="mt-4">
          {SUBJECTS.map((subject, i) => (
            <div
              key={subject.num}
              className={`flex gap-4 py-5 ${
                i === 0 ? "border-t border-border" : ""
              } border-b border-border`}
            >
              <span className="font-mono text-[11px] text-text-faint">
                {subject.num}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-[25px] text-dark">
                    {subject.name}
                  </span>
                  <span className="whitespace-nowrap rounded-sm border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-muted">
                    {subject.grades}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] text-text-muted">
                  {subject.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SCHEDULE */}
      <section className="bg-surface px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          The summer plan
        </p>
        <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark">
          Stack a full day.
        </h2>
        <p className="mt-1.5 max-w-[32ch] text-[14px] leading-relaxed text-text-secondary">
          Ten one-hour slots, every weekday. Book one. Book all ten.
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
                <span className="font-mono text-text-muted">{slot.time}</span>
                {slot.subject ? (
                  <span className="font-semibold text-accent">
                    {slot.subject}
                  </span>
                ) : (
                  <span className="text-text-faint">open</span>
                )}
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
                <span className="font-mono text-text-muted">{slot.time}</span>
                {slot.subject ? (
                  <span className="font-semibold text-accent">
                    {slot.subject}
                  </span>
                ) : (
                  <span className="text-text-faint">open</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RESULTS */}
      <section className="px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          What changed
        </p>
        <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-dark">
          Real names.
          <br />
          Real transcripts.
        </h2>

        <div className="mt-4">
          {RESULTS.map((result, i) => (
            <div
              key={result.name}
              className={`flex gap-4 py-5 ${
                i === 0 ? "border-t border-border" : ""
              } border-b border-border`}
            >
              {/* Photo placeholder */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-surface to-background font-mono text-[7px] text-text-faint">
                PHOTO
              </div>
              <div className="flex-1">
                <p className="font-serif text-[30px] leading-none text-dark">
                  {result.before}{" "}
                  <span className="text-accent">→</span> {result.after}
                </p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  {result.name} · {result.subject}
                </p>
                <p className="mt-1.5 font-serif text-[15px] italic leading-snug text-text-secondary">
                  "{result.quote}"
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GUARANTEE */}
      <section className="bg-accent px-5 py-12 text-[#F8EDE6]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#F8C9BD]">
          The promise
        </p>
        <h2 className="mt-4 font-serif text-[46px] font-normal leading-none">
          A 95+.
          <br />
          In writing.
        </h2>
        <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed">
          If your student completes the program and doesn't reach a 95+, they
          keep coming — on us — until they do. We can put that in writing
          because the Bulletproof Method earns it, every time.
        </p>
      </section>

      {/* PRICING */}
      <section className="bg-dark px-5 py-11">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
          Enroll
        </p>
        <h2 className="mt-3 font-serif text-[33px] font-normal leading-[1.05] text-text-on-dark">
          Two ways to begin.
        </h2>

        {/* $70 option */}
        <div className="mt-6 rounded-sm border border-border-dark p-5">
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
        </div>

        {/* $600 option */}
        <div className="mt-3.5 rounded-sm border-[1.5px] border-accent bg-accent-bg p-5">
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
        </div>

        <Link
          href="/enroll"
          className="mt-6 block w-full rounded-sm bg-accent py-4 text-center text-[15px] font-bold text-[#F8EDE6] transition-colors hover:bg-accent/90"
        >
          Reserve your summer seat →
        </Link>

        <p className="mt-4 text-center font-mono text-[9.5px] uppercase tracking-wide text-text-muted">
          AP Academy · Greater Toronto Area · Est. 2019
        </p>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-5 py-8">
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
      </footer>
    </div>
  );
}
