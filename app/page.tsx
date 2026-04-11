"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import Image from "next/image";
import { BookOpen, Target, TrendingUp, Calendar, Clock, Users } from "lucide-react";

function useABTest() {
  const searchParams = useSearchParams();
  const variant = searchParams.get("v") === "b" ? "b" : "a";
  const utmContent = searchParams.get("utm_content") || "";
  return { variant, utmContent };
}

function TypeformButton({ variant, utmContent }: { variant: string; utmContent: string }) {
  return (
    <button
      data-tf-popup="GwhmMSJC"
      data-tf-hidden={`variant=${variant},utm_content=${utmContent}`}
      data-tf-size="100"
      className="inline-block rounded-lg bg-teal px-8 py-4 font-bold text-white transition-all hover:bg-teal-bright hover:shadow-lg cursor-pointer"
    >
      See If You Qualify
    </button>
  );
}

function HeroAssessmentButton({ variant, utmContent }: { variant: string; utmContent: string }) {
  return (
    <>
      <TypeformButton variant={variant} utmContent={utmContent} />
      <p className="mt-3 text-sm text-text-muted">Free · 2 minutes · Limited spots</p>
      <Script src="//embed.typeform.com/next/embed.js" strategy="lazyOnload" />
    </>
  );
}

function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 text-lg font-bold text-text-primary">
          {question}
        </span>
        <span className="flex-shrink-0 text-2xl text-teal">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div className="pb-5">
          <p className="text-[17px] leading-[1.75] text-text-secondary">{answer}</p>
        </div>
      )}
    </div>
  );
}

function CTAButton({ large = false }: { large?: boolean }) {
  return (
    <a
      href="#booking"
      className={`inline-block rounded-lg bg-teal font-bold text-white transition-all hover:bg-teal-bright hover:shadow-lg ${
        large ? "px-10 py-5 text-lg" : "px-8 py-4"
      }`}
    >
      Book Your Spot
    </a>
  );
}

function StickyMobileCTA() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const heroSection = document.getElementById("hero");
      const bookingSection = document.getElementById("booking");

      if (!heroSection || !bookingSection) return;

      const heroBottom = heroSection.getBoundingClientRect().bottom;
      const bookingTop = bookingSection.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;

      // Show when scrolled past hero, hide when booking section is in view
      const pastHero = heroBottom < 100;
      const atBooking = bookingTop < windowHeight;

      setIsVisible(pastHero && !atBooking);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // Check initial state

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <a
      href="#booking"
      className={`fixed bottom-0 left-0 right-0 z-[9999] flex h-14 items-center justify-center bg-teal font-bold text-white text-base md:hidden transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      Book Your Spot — Only 5 Students
    </a>
  );
}

function HomeContent() {
  const { variant, utmContent } = useABTest();

  const headline = variant === "b"
    ? "Start Grade 12 Math With a 95%"
    : "Get a 95+ in MHF4U Before the Semester Even Starts";

  const faqs = [
    {
      question: "When does the 10-day intensive run?",
      answer:
        "We run intensives before each semester — typically late August for Semester 1 and late January for Semester 2. Book a call to confirm the exact dates for the upcoming session.",
    },
    {
      question: "What exactly is covered in 10 days?",
      answer:
        "We cover the entire MHF4U curriculum: polynomial functions, rational functions, exponential & logarithmic functions, trigonometry, and function operations. You'll complete practice problems, unit tests, and a final assessment — all before Day 1 of school.",
    },
    {
      question: "How many hours per day?",
      answer:
        "Expect 3-4 hours of focused work daily — a mix of 1-on-1 instruction, guided practice, and independent problem sets. It's intense but manageable. Students finish the program feeling confident, not burned out.",
    },
    {
      question: "What if my child is already decent at math?",
      answer:
        "Even better. If they're sitting at 80-85%, this program can push them to 95+. We move faster with stronger students and go deeper on the challenging units. The goal is mastery, not just passing.",
    },
    {
      question: "Why only 5 students?",
      answer:
        "Because I teach every session personally. With 5 students max, I can give real attention to each one — catch mistakes early, adjust pacing, and make sure no one falls behind. Quality over quantity.",
    },
    {
      question: "What happens after the 10 days?",
      answer:
        "Your child starts the semester having already mastered the material. While classmates are learning concepts for the first time, your child is reviewing and reinforcing. That head start compounds all semester.",
    },
  ];

  return (
    <div className="min-h-screen bg-navy pb-14 md:pb-0">
      {/* Sticky Mobile CTA */}
      <StickyMobileCTA />

      {/* SECTION 1: HERO */}
      <section id="hero" className="px-4 py-20 md:py-24 lg:py-28">
        <div className="mx-auto max-w-[800px] text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-teal">
            10-Day MHF4U Intensive · Only 5 Spots
          </p>
          <h1 className="mb-6 text-[28px] font-bold leading-tight text-text-primary md:text-[36px] lg:text-[48px]">
            {headline}
          </h1>
          <p className="mb-10 text-[18px] leading-relaxed text-text-secondary md:text-[20px]">
            Master the entire Grade 12 Advanced Functions course in 10 days — before school begins. Start the semester ahead, not catching up.
          </p>
          <HeroAssessmentButton variant={variant} utmContent={utmContent} />
        </div>
      </section>

      {/* SECTION 2: PROBLEM */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            Why Most Students Struggle in MHF4U
          </h2>
          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {/* Card 1 */}
            <div className="flex flex-col rounded-xl border border-border bg-navy-light p-7 pb-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8 md:pb-10">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                The Pace Is Brutal
              </h3>
              <p className="mb-6 text-[17px] leading-[1.75] text-text-card">
                MHF4U moves fast. By the time most students realize they're behind, they've already bombed the first test.
              </p>
              <div className="mt-auto flex justify-center">
                <Clock className="h-6 w-6 text-teal" />
              </div>
            </div>
            {/* Card 2 */}
            <div className="flex flex-col rounded-xl border border-border bg-navy-light p-7 pb-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8 md:pb-10">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Grade 11 Gaps Compound
              </h3>
              <p className="mb-6 text-[17px] leading-[1.75] text-text-card">
                MHF4U builds on MCR3U. Any weakness in functions, factoring, or trig becomes a crisis in Grade 12.
              </p>
              <div className="mt-auto flex justify-center">
                <TrendingUp className="h-6 w-6 text-teal" />
              </div>
            </div>
            {/* Card 3 */}
            <div className="flex flex-col rounded-xl border border-border bg-navy-light p-7 pb-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8 md:pb-10">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Catching Up Is Nearly Impossible
              </h3>
              <p className="mb-6 text-[17px] leading-[1.75] text-text-card">
                Once you're behind, you're learning new material while trying to fix old gaps. The hole just gets deeper.
              </p>
              <div className="mt-auto flex justify-center">
                <Target className="h-6 w-6 text-teal" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: MECHANISM */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            The 10-Day Head Start
          </h2>
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            {/* Pillar 1 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <BookOpen className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">01</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Full Curriculum Coverage
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                We teach the entire MHF4U course — every unit, every concept — before Day 1 of school. Not a preview. The whole thing.
              </p>
            </div>
            {/* Pillar 2 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <Users className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">02</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Small Group, Personal Attention
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Only 5 students per cohort. Every question gets answered. Every gap gets fixed. No one gets left behind.
              </p>
            </div>
            {/* Pillar 3 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <Target className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">03</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Daily Practice & Testing
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Learn in the morning, practice in the afternoon. Unit tests throughout. Your child knows exactly where they stand.
              </p>
            </div>
            {/* Pillar 4 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <Calendar className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">04</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Semester-Long Advantage
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                When school starts, your child already knows the material. Class becomes review. Tests become easy. Confidence compounds.
              </p>
            </div>
          </div>
          <p className="mt-12 text-center text-[20px] font-bold text-teal md:text-[22px]">
            10 days of focused work = an entire semester of advantage.
          </p>
          <div className="mt-10 text-center">
            <TypeformButton variant={variant} utmContent={utmContent} />
            <p className="mt-3 text-sm text-text-muted">Free · 2 minutes · Limited spots</p>
          </div>
        </div>
      </section>

      {/* SECTION 4: PROOF / CREDIBILITY */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            Built by Someone Who's Done It
          </h2>
          <div className="rounded-xl border border-border bg-navy-light p-8 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-12">
            <p className="max-w-[600px] mx-auto text-[17px] leading-[1.75] text-text-card md:text-[18px]">
              I'm Charlie — Waterloo Software Engineering grad. I've tutored dozens of students through MHF4U. I know exactly where students struggle and how to fix it fast. This intensive is designed to do in 10 days what most students take 5 months to learn.
            </p>
          </div>

          {/* TESTIMONIALS: Uncomment when available
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <p className="mb-4 text-text-card italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-muted">School Name — Outcome</p>
            </div>
          </div>
          */}

          <div className="mt-10 text-center">
            <p className="mb-4 text-sm text-text-muted">Ready to get ahead?</p>
            <CTAButton />
          </div>
        </div>
      </section>

      {/* SECTION 5: HOW IT WORKS */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">1</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Book a Quick Call
              </h3>
              <p className="text-[17px] leading-[1.75] text-text-secondary">
                We'll confirm your child is a good fit and lock in their spot. Takes 15 minutes.
              </p>
            </div>
            {/* Step 2 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">2</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Complete the 10-Day Intensive
              </h3>
              <p className="text-[17px] leading-[1.75] text-text-secondary">
                Daily sessions covering the full MHF4U curriculum. Practice problems, unit tests, and a final assessment.
              </p>
            </div>
            {/* Step 3 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">3</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Start the Semester Ahead
              </h3>
              <p className="text-[17px] leading-[1.75] text-text-secondary">
                Your child walks into Day 1 already knowing the material. The rest of the semester is review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: WHO THIS IS FOR */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            Is This Right for Your Child?
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* This IS for you */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <h3 className="mb-6 text-xl font-bold text-teal">
                This IS for you if...
              </h3>
              <ul className="space-y-4 text-[17px] leading-[1.75] text-text-card">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    Your child is taking MHF4U next semester
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    They want to hit 90-95%+ in math
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    They're willing to put in 10 days of focused work
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    You'd rather get ahead than play catch-up all semester
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    They're targeting competitive university programs (engineering, CS, business)
                  </span>
                </li>
              </ul>
            </div>
            {/* This ISN'T for you */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <h3 className="mb-6 text-xl font-bold text-red-muted">
                This ISN'T for you if...
              </h3>
              <ul className="space-y-4 text-[17px] leading-[1.75] text-text-card">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    Your child isn't willing to commit to 10 consecutive days
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    They're looking for a quick fix without real effort
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    They've already started MHF4U and need catch-up help
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    They're not serious about their math grade
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: FAQ */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            Common Questions
          </h2>
          <div className="mx-auto max-w-[700px] rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 8: FINAL CTA */}
      <section className="px-4 py-20 md:py-20">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="mb-6 text-[28px] font-bold text-text-primary md:text-[32px]">
            Only 5 Spots Per Session. Don't Wait Until They're Gone.
          </h2>
          <p className="mb-10 text-[17px] leading-[1.75] text-text-secondary md:text-[18px]">
            Book a quick call to confirm your child's spot. We'll make sure they're a good fit and answer any questions.
          </p>
          <CTAButton large />
        </div>
      </section>

      {/* SECTION 9: BOOKING (Calendly Embed) */}
      <section id="booking" className="bg-navy-booking px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="mb-6 text-[28px] font-bold text-text-primary md:text-[32px]">
            Book Your Spot
          </h2>
          <p className="mb-10 text-[17px] leading-[1.75] text-text-secondary md:text-[18px]">
            Pick a time for a quick 15-minute call. We'll confirm fit and lock in your child's spot.
          </p>

          {/* Calendly inline embed */}
          <div className="mx-auto max-w-[700px]">
            <div
              className="calendly-inline-widget"
              data-url="https://calendly.com/y-wang217/30min"
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
      <footer className="bg-navy px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row md:items-start">
            {/* Left side */}
            <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
              <Image
                src="/logo.png"
                alt="AP Academy - MHF4U intensive tutoring"
                width={64}
                height={64}
                className="rounded-lg"
              />
              <div className="text-center md:text-left">
                <h3 className="mb-2 text-xl font-bold text-text-primary">
                  AP Academy
                </h3>
                <p className="text-text-muted">
                  10-Day MHF4U Intensive
                </p>
                <p className="text-text-muted">
                  Serving the Greater Toronto Area
                </p>
              </div>
            </div>
            {/* Right side */}
            <div className="text-center md:text-right">
              <p className="text-text-muted">
                Email:{" "}
                <a
                  href="mailto:y.wang217@gmail.com"
                  className="text-teal hover:text-teal-bright hover:underline"
                >
                  y.wang217@gmail.com
                </a>
              </p>
              <p className="text-text-muted">
                Phone:{" "}
                <a
                  href="tel:+15195898217"
                  className="text-teal hover:text-teal-bright hover:underline"
                >
                  (519) 589-8217
                </a>
              </p>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8 text-center">
            <p className="mb-4 text-xs text-text-muted">
              Serving students across the GTA including Markham, Richmond Hill, Vaughan, Newmarket, Toronto, and Mississauga — online sessions available province-wide.
            </p>
            <p className="text-sm text-text-muted">
              &copy; 2026 AP Academy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-navy" />}>
      <HomeContent />
    </Suspense>
  );
}
