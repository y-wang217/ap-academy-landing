"use client";

import { Suspense } from "react";
import Script from "next/script";
import Image from "next/image";
import { students } from "./students";

// TODO: Replace with actual Calendly URL
const CALENDLY_URL = "https://calendly.com/y-wang217/30min";

function SocialProofBar() {
  // Double the array for seamless infinite scroll
  const duplicatedStudents = [...students, ...students];

  return (
    <section className="border-y border-border bg-surface py-6">
      <div className="mx-auto max-w-[1200px]">
        <p className="mb-4 text-center text-sm font-medium text-text-muted">
          Students we've helped so far:
        </p>
        <div className="pause-on-hover overflow-hidden">
          <div className="animate-scroll flex gap-8 whitespace-nowrap">
            {duplicatedStudents.map((student, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2"
              >
                <span className="font-semibold text-text-primary">{student.name}</span>
                <span className="text-text-muted">—</span>
                <span className="text-text-secondary">{student.program}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTAButton({ large = false }: { large?: boolean }) {
  return (
    <a
      href="#booking"
      className={`inline-block rounded-lg bg-accent font-bold text-white transition-all hover:bg-accent-hover hover:shadow-lg ${
        large ? "px-10 py-5 text-lg" : "px-8 py-4"
      }`}
    >
      Book a Qualifying Call
    </a>
  );
}

function HomeContent() {
  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <section id="hero" className="px-4 py-16 md:py-20 lg:py-24">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: Copy */}
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">
                10-Day MHF4U Intensive
              </p>
              <h1 className="mb-6 text-[32px] font-bold leading-tight text-navy md:text-[42px] lg:text-[52px]">
                Master MHF4U Before Day One
              </h1>
              <p className="mb-8 text-[18px] leading-relaxed text-text-secondary md:text-[20px]">
                The entire Grade 12 Advanced Functions course in 10 days. Start the semester with a 95+.
              </p>
              <CTAButton large />
            </div>
            {/* Right: Photo placeholder */}
            <div className="flex justify-center lg:justify-end">
              {/* HERO_PHOTO_PLACEHOLDER - Replace with actual photo */}
              <div className="flex h-[400px] w-[320px] items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface text-text-muted md:h-[480px] md:w-[380px]">
                <span className="text-center text-sm">
                  HERO_PHOTO_PLACEHOLDER<br />
                  (Portrait/action shot)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF BAR */}
      <SocialProofBar />

      {/* THE BULLETPROOF METHOD */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="mb-12 text-[28px] font-bold text-navy md:text-[36px]">
            The Bulletproof Method
          </h2>
          <div className="space-y-6">
            <div className="flex items-center gap-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-white">
                1
              </span>
              <p className="text-[18px] text-text-primary md:text-[20px]">
                Diagnose every gap with a pre-assessment.
              </p>
            </div>
            <div className="flex items-center gap-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-white">
                2
              </span>
              <p className="text-[18px] text-text-primary md:text-[20px]">
                Drill the exact problem types that show up on the test until they're automatic.
              </p>
            </div>
            <div className="flex items-center gap-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-white">
                3
              </span>
              <p className="text-[18px] text-text-primary md:text-[20px]">
                Verify mastery with a full mock exam before day one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* QUALIFYING VIDEO */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="mb-4 text-[28px] font-bold text-navy md:text-[36px]">
            Is This for Your Student?
          </h2>
          <p className="mb-10 text-[18px] text-text-secondary">
            This is a 1-on-1 intensive for a specific type of student. Watch before booking.
          </p>
          {/* QUALIFYING_VIDEO_EMBED - Replace with YouTube/Vimeo embed */}
          <div className="relative mx-auto aspect-video w-full max-w-[700px] overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface">
            <div className="absolute inset-0 flex items-center justify-center text-text-muted">
              <span className="text-center text-sm">
                QUALIFYING_VIDEO_EMBED<br />
                (YouTube or Vimeo embed)
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[600px] text-center">
          <p className="mb-6 text-[20px] text-text-primary md:text-[22px]">
            Only 5 spots per session. Book your qualifying call now.
          </p>
          <CTAButton large />
        </div>
      </section>

      {/* BOOKING (Calendly Embed) */}
      <section id="booking" className="bg-surface px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="mb-8 text-[28px] font-bold text-navy md:text-[32px]">
            Book Your Qualifying Call
          </h2>
          <div className="mx-auto max-w-[700px]">
            <div
              className="calendly-inline-widget"
              data-url={CALENDLY_URL}
              data-resize="true"
            />
            <Script
              src="https://assets.calendly.com/assets/external/widget.js"
              strategy="lazyOnload"
            />
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
            <a href="mailto:y.wang217@gmail.com" className="hover:text-accent">
              y.wang217@gmail.com
            </a>
            {" · "}
            <a href="tel:+15195898217" className="hover:text-accent">
              (519) 589-8217
            </a>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-text-muted">
          © 2026 AP Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <HomeContent />
    </Suspense>
  );
}
