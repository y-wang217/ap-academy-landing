"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import Image from "next/image";
import { Calculator, Trophy, FileText, Compass } from "lucide-react";

function HeroAssessmentButton() {
  return (
    <>
      <button
        data-tf-popup="GwhmMSJC"
        data-tf-size="100"
        className="inline-block rounded-lg bg-teal px-8 py-4 font-bold text-white transition-all hover:bg-teal-bright hover:shadow-lg cursor-pointer"
      >
        Take the Free Readiness Assessment
      </button>
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

function AIFTooltip() {
  return (
    <span className="relative inline-block group">
      <span className="border-b border-dotted border-teal cursor-help">AIF</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a2d4a] text-white text-sm rounded-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 z-50">
        Application Information Form — Waterloo's required essay for engineering applicants.
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a2d4a]"></span>
      </span>
    </span>
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
      Book a Free Strategy Call
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
      Book a Free Strategy Call
    </a>
  );
}

export default function Home() {
  const faqs = [
    {
      question: "What if my child is already in Grade 12 — is it too late?",
      answer:
        "Not necessarily, but the sooner we start, the more we can do. Grade 12 students can still improve grades, prep for Euclid, and get AIF coaching — but the window is tight. Book a call and we'll be honest about what's realistic.",
    },
    {
      question: "Do you guarantee admission to Waterloo?",
      answer:
        "No one can guarantee admission — and anyone who does is lying. What we guarantee is that your child will have the strongest possible application: competitive grades, Euclid prep, a polished AIF, and interview confidence. We put every piece in place.",
    },
    {
      question: "Why only 3 students per semester?",
      answer:
        "Because this is 1-on-1 and I teach every session personally. I'd rather deliver exceptional results for 3 students than mediocre results for 20. As we grow, we'll add carefully trained instructors — but quality comes first.",
    },
    {
      question: "How is this different from regular tutoring?",
      answer:
        "Regular tutors help with homework. We build a complete Waterloo admission strategy — grades, Euclid, AIF, extracurriculars, and interview prep. It's the difference between hiring someone to explain a problem set and hiring someone to get your child into Waterloo.",
    },
    {
      question: "What subjects do you cover?",
      answer:
        "Grade 11 Functions, Grade 11 Physics, Grade 12 Advanced Functions, Grade 12 Physics, and Euclid Contest prep. Everything Waterloo Engineering weighs most.",
    },
    {
      question: "How do parents stay informed?",
      answer:
        "You get a written progress update every Friday — what we covered, how your child performed, and what's coming next week. You'll never have to wonder how things are going.",
    },
  ];

  return (
    <div className="min-h-screen bg-navy pb-14 md:pb-0">
      {/* Sticky Mobile CTA */}
      <StickyMobileCTA />

      {/* SECTION 1: HERO */}
      <section id="hero" className="px-4 py-20 md:py-24 lg:py-28">
        <div className="mx-auto max-w-[800px] text-center">
          <h1 className="mb-6 text-[28px] font-bold leading-tight text-text-primary md:text-[36px] lg:text-[48px]">
            Want to Get Your Child Into Waterloo Engineering?
          </h1>
          <p className="mb-10 text-[18px] leading-relaxed text-teal md:text-[20px]">
            See exactly where they stand — free assessment built by a Waterloo Engineering grad.
          </p>
          <HeroAssessmentButton />
        </div>
      </section>

      {/* SECTION 2: PROBLEM */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            Why Smart Students Still Get Rejected
          </h2>
          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {/* Card 1 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Grade 11 Is Where Waterloo Is Won or Lost
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Grade 11 math and physics are the hardest courses your child has faced — and they're the foundation for Grade 12 Advanced Functions and Physics, the two courses Waterloo weighs most. A weak Grade 11 doesn't just hurt this year. It compounds into Grade 12 and tanks the application. Most students don't recover in time.
              </p>
            </div>
            {/* Card 2 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                You Can't Google Your Way Through This
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Parents want to help but don't know how. Which extracurriculars actually matter? Is volunteering worth it or a waste of time? Should they do Euclid? Start coding? Join robotics? The information is scattered and all over the place — and the wrong choices cost a year you can't get back.
              </p>
            </div>
            {/* Card 3 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                A 95% Average Still Gets Rejected
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Waterloo doesn't just want grades. They want proof your child is genuinely passionate about engineering — Euclid scores, programming projects, robotics, leadership. They read the <AIFTooltip /> looking for evidence of real time spent and real results. Most tutors teach math. Nobody builds the full picture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: MECHANISM */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            The Only Program That Covers Everything
          </h2>
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            {/* Pillar 1 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <Calculator className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">01</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                1-on-1 Math & Physics Tutoring
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Diagnostic-first. We find the exact gaps, build a custom plan, and push grades to 90+. No generic homework help.
              </p>
            </div>
            {/* Pillar 2 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <Trophy className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">02</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Euclid Competition Prep
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                Waterloo loves Euclid scores. We run focused prep sessions with real contest problems so your child stands out.
              </p>
            </div>
            {/* Pillar 3 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <FileText className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">03</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                AIF Coaching
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                We write, review, and polish your child's Application Information Form from scratch. Every sentence built to show Waterloo what they want to see.
              </p>
            </div>
            {/* Pillar 4 */}
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:p-8">
              <Compass className="mb-3 h-9 w-9 text-teal" />
              <div className="mb-4 text-3xl font-bold text-teal">04</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Extracurricular Strategy & Interview Prep
              </h3>
              <p className="max-w-[600px] text-[17px] leading-[1.75] text-text-card">
                We tell your child exactly what to do outside of class. What to pursue. What to skip. And how to talk about it in their AIF and interview.
              </p>
            </div>
          </div>
          <p className="mt-12 text-center text-[20px] font-bold text-teal md:text-[22px]">
            This isn't tutoring. It's a full system to get your child into Waterloo Engineering.
          </p>
          <div className="mt-10 text-center">
            <button
              data-tf-popup="GwhmMSJC"
              data-tf-size="100"
              className="inline-block rounded-lg bg-teal px-8 py-4 font-bold text-white transition-all hover:bg-teal-bright hover:shadow-lg cursor-pointer"
            >
              Take the Free Readiness Assessment
            </button>
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
              Students of Charlie typically see a 10% grade increase on their next physics or math test. He went to Waterloo Software Engineering and knows first hand what it takes to make it.
            </p>
          </div>

          {/* TESTIMONIALS: Uncomment when available
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <p className="mb-4 text-text-card italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-muted">School Name — Outcome</p>
            </div>
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <p className="mb-4 text-text-card italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-muted">School Name — Outcome</p>
            </div>
            <div className="rounded-xl border border-border bg-navy-light p-7 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <p className="mb-4 text-text-card italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-muted">School Name — Outcome</p>
            </div>
          </div>
          */}

          <div className="mt-10 text-center">
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
                Book a Strategy Call
              </h3>
              <p className="text-[17px] leading-[1.75] text-text-secondary">
                We'll assess where your child stands and whether AP Academy is the right fit. No pressure, just clarity.
              </p>
            </div>
            {/* Step 2 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">2</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Get a Custom Roadmap
              </h3>
              <p className="text-[17px] leading-[1.75] text-text-secondary">
                If we're a match, we build a clear plan for the semester. Grades, Euclid, AIF — all of it mapped out. Parents receive a weekly update so you always know where your child stands.
              </p>
            </div>
            {/* Step 3 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">3</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Watch Them Get In
              </h3>
              <p className="text-[17px] leading-[1.75] text-text-secondary">
                Weekly lessons. Weekly parent updates. A clear path to Waterloo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: WHO THIS IS FOR */}
      <section className="px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[900px]">
          <h2 className="mb-12 text-center text-[28px] font-bold text-text-primary md:mb-16 md:text-[32px]">
            Is AP Academy Right for Your Child?
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
                    Your child is in Grade 11 or 12 taking Physics and/or Functions/Advanced Functions
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    Current grades are 70–85% and need to reach 90+
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    You're targeting Waterloo Engineering or competitive STEM programs
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    Your child is willing to put in the work but needs expert guidance and a real system
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal">&#10003;</span>
                  <span>
                    You want more than tutoring — you want a Waterloo admission strategy
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
                    Your child is already at 95%+ and just needs occasional help
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    You're looking for quick fixes without consistent effort
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    You want group tutoring or franchise-style programs
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-red-muted">&#10007;</span>
                  <span>
                    Your child isn't interested in engineering or STEM
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
            Common Questions Parents Ask
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
            Your Child's Waterloo Admission Starts With One Call.
          </h2>
          <p className="mb-10 text-[17px] leading-[1.75] text-text-secondary md:text-[18px]">
            Book a free strategy call. We'll assess where your child stands, build a plan, and tell you honestly if AP Academy is the right fit.
          </p>
          <CTAButton large />
        </div>
      </section>

      {/* SECTION 9: BOOKING (Calendly Embed) */}
      <section id="booking" className="bg-navy-booking px-4 py-15 md:py-15">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="mb-6 text-[28px] font-bold text-text-primary md:text-[32px]">
            Book Your Free Strategy Call
          </h2>
          <p className="mb-10 text-[17px] leading-[1.75] text-text-secondary md:text-[18px]">
            Pick a time that works. We'll spend 20 minutes assessing where your child stands and whether AP Academy is the right fit.
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
                alt="AP Academy - Waterloo Engineering tutoring for Grade 11 students in the GTA"
                width={64}
                height={64}
                className="rounded-lg"
              />
              <div className="text-center md:text-left">
                <h3 className="mb-2 text-xl font-bold text-text-primary">
                  AP Academy
                </h3>
                <p className="text-text-muted">
                  Grade 11–12 Math & Physics | Waterloo Engineering Prep
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
              Serving Grade 11 and 12 students across the GTA including Markham, Richmond Hill, Vaughan, Newmarket, Toronto, and Mississauga — online tutoring available province-wide.
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
