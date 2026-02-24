"use client";

import { useState } from "react";

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
        <span className="pr-4 text-lg font-semibold text-text-primary">
          {question}
        </span>
        <span className="flex-shrink-0 text-2xl text-teal">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div className="pb-5">
          <p className="text-text-secondary leading-relaxed">{answer}</p>
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
    <div className="min-h-screen bg-navy">
      {/* SECTION 1: HERO */}
      <section className="px-4 py-20 md:py-28 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-3xl font-bold leading-tight text-text-primary md:text-4xl lg:text-5xl xl:text-6xl">
            We Get Grade 11–12 Students Into Waterloo Engineering.
          </h1>
          <p className="mb-10 text-lg leading-relaxed text-teal md:text-xl lg:text-2xl">
            90+ in math and physics. Euclid prep. AIF coaching. Interview drills. Built by a Waterloo Engineering grad.
          </p>
          <CTAButton />
          <p className="mt-6 text-sm text-text-secondary">
            Limited to 3 students per semester
          </p>
        </div>
      </section>

      {/* SECTION 2: PROBLEM */}
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-text-primary md:mb-16 md:text-3xl lg:text-4xl">
            Why Smart Students Still Get Rejected
          </h2>
          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {/* Card 1 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Grade 11 Is Where Waterloo Is Won or Lost
              </h3>
              <p className="leading-relaxed text-text-secondary">
                Grade 11 math and physics are the hardest courses your child has faced — and they're the foundation for Grade 12 Advanced Functions and Physics, the two courses Waterloo weighs most. A weak Grade 11 doesn't just hurt this year. It compounds into Grade 12 and tanks the application. Most students don't recover in time.
              </p>
            </div>
            {/* Card 2 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                You Can't Google Your Way Through This
              </h3>
              <p className="leading-relaxed text-text-secondary">
                Parents want to help but don't know how. Which extracurriculars actually matter? Is volunteering worth it or a waste of time? Should they do Euclid? Start coding? Join robotics? The information is scattered and contradictory — and the wrong choices cost a year you can't get back.
              </p>
            </div>
            {/* Card 3 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                A 95% Average Still Gets Rejected
              </h3>
              <p className="leading-relaxed text-text-secondary">
                Waterloo doesn't just want grades. They want proof your child is genuinely passionate about engineering — Euclid scores, programming projects, robotics, leadership. They read the AIF looking for evidence of real time spent and real results. Most tutors teach math. Nobody builds the full picture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: MECHANISM */}
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-text-primary md:mb-16 md:text-3xl lg:text-4xl">
            The Only Program That Covers Everything
          </h2>
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            {/* Pillar 1 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <div className="mb-4 text-3xl font-bold text-teal">01</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                1-on-1 Math & Physics Tutoring
              </h3>
              <p className="leading-relaxed text-text-secondary">
                Diagnostic-first. We find the exact gaps, build a custom plan, and push grades to 90+. No generic homework help.
              </p>
            </div>
            {/* Pillar 2 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <div className="mb-4 text-3xl font-bold text-teal">02</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Euclid Competition Prep
              </h3>
              <p className="leading-relaxed text-text-secondary">
                The single highest-signal extracurricular for Waterloo Engineering admissions. Dedicated prep sessions with contest-level problems.
              </p>
            </div>
            {/* Pillar 3 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <div className="mb-4 text-3xl font-bold text-teal">03</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                AIF Coaching
              </h3>
              <p className="leading-relaxed text-text-secondary">
                We write, review, and polish your child's Application Information Form from scratch. Every sentence built to show Waterloo what they want to see.
              </p>
            </div>
            {/* Pillar 4 */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <div className="mb-4 text-3xl font-bold text-teal">04</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Extracurricular Strategy & Interview Prep
              </h3>
              <p className="leading-relaxed text-text-secondary">
                We map out exactly how your child should spend their time outside the classroom — what to pursue, what to skip, and how to present it in their AIF and interview.
              </p>
            </div>
          </div>
          <p className="mt-12 text-center text-xl font-bold text-text-primary md:text-2xl">
            This isn't tutoring. It's a complete Waterloo Engineering admission system.
          </p>
          <div className="mt-10 text-center">
            <CTAButton />
          </div>
        </div>
      </section>

      {/* SECTION 4: PROOF / CREDIBILITY */}
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-text-primary md:mb-16 md:text-3xl lg:text-4xl">
            Built by Someone Who's Done It
          </h2>
          <div className="rounded-xl border border-border bg-navy-light p-8 md:p-12">
            <p className="text-lg leading-relaxed text-text-secondary md:text-xl">
              AP Academy was built by a Waterloo Engineering graduate who's coached 10+ students through competitive STEM admissions. Every lesson, every strategy, every AIF review comes from firsthand experience with the exact system your child is applying to.
            </p>
          </div>

          {/* TESTIMONIALS: Uncomment when available
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-navy-light p-6">
              <p className="mb-4 text-text-secondary italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-secondary">School Name — Outcome</p>
            </div>
            <div className="rounded-xl border border-border bg-navy-light p-6">
              <p className="mb-4 text-text-secondary italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-secondary">School Name — Outcome</p>
            </div>
            <div className="rounded-xl border border-border bg-navy-light p-6">
              <p className="mb-4 text-text-secondary italic">"Quote from student here..."</p>
              <p className="font-bold text-text-primary">Student Name</p>
              <p className="text-sm text-text-secondary">School Name — Outcome</p>
            </div>
          </div>
          */}

          <div className="mt-10 text-center">
            <CTAButton />
          </div>
        </div>
      </section>

      {/* SECTION 5: HOW IT WORKS */}
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-text-primary md:mb-16 md:text-3xl lg:text-4xl">
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">1</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Book a Strategy Call
              </h3>
              <p className="leading-relaxed text-text-secondary">
                We'll assess where your child stands and whether AP Academy is the right fit. No pressure, just clarity.
              </p>
            </div>
            {/* Step 2 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">2</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Get a Custom Roadmap
              </h3>
              <p className="leading-relaxed text-text-secondary">
                If we're a match, we build a semester plan targeting exactly what your child needs — grades, Euclid, AIF, everything.
              </p>
            </div>
            {/* Step 3 */}
            <div className="text-center">
              <div className="mb-6 text-6xl font-bold text-teal">3</div>
              <h3 className="mb-4 text-xl font-bold text-text-primary">
                Watch Them Get In
              </h3>
              <p className="leading-relaxed text-text-secondary">
                Weekly sessions, weekly parent updates, and a clear path to Waterloo Engineering.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: WHO THIS IS FOR */}
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-text-primary md:mb-16 md:text-3xl lg:text-4xl">
            Is AP Academy Right for Your Child?
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* This IS for you */}
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <h3 className="mb-6 text-xl font-bold text-teal">
                This IS for you if...
              </h3>
              <ul className="space-y-4 text-text-secondary">
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
            <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
              <h3 className="mb-6 text-xl font-bold text-red-muted">
                This ISN'T for you if...
              </h3>
              <ul className="space-y-4 text-text-secondary">
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
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-text-primary md:mb-16 md:text-3xl lg:text-4xl">
            Common Questions Parents Ask
          </h2>
          <div className="rounded-xl border border-border bg-navy-light p-6 md:p-8">
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
      <section
        id="booking"
        className="bg-gradient-to-b from-navy to-navy-light px-4 py-20 md:py-28"
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-2xl font-bold text-text-primary md:text-3xl lg:text-4xl">
            Your Child's Waterloo Admission Starts With One Call.
          </h2>
          <p className="mb-10 text-lg text-text-secondary md:text-xl">
            Book a free strategy call. We'll assess where your child stands, build a plan, and tell you honestly if AP Academy is the right fit.
          </p>
          <CTAButton large />
          {/* TODO: Replace button with Calendly embed or external Calendly link */}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-navy px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row md:items-start">
            {/* Left side */}
            <div className="text-center md:text-left">
              <h3 className="mb-2 text-xl font-bold text-text-primary">
                AP Academy
              </h3>
              <p className="text-text-secondary">
                Grade 11–12 Math & Physics | Waterloo Engineering Prep
              </p>
              <p className="text-text-secondary">
                Serving the Greater Toronto Area
              </p>
            </div>
            {/* Right side */}
            <div className="text-center md:text-right">
              <p className="text-text-secondary">
                Email:{" "}
                <a
                  href="mailto:contact@apacademy.ca"
                  className="text-teal hover:text-teal-bright hover:underline"
                >
                  contact@apacademy.ca
                </a>
              </p>
              <p className="text-text-secondary">
                Phone:{" "}
                <a
                  href="tel:+14161234567"
                  className="text-teal hover:text-teal-bright hover:underline"
                >
                  (416) 123-4567
                </a>
              </p>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8 text-center">
            <p className="text-sm text-text-secondary">
              &copy; 2026 AP Academy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
