"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Replace with your Formspree form ID
const FORMSPREE_ENDPOINT = "https://formspree.io/f/mkozzzgn";

function LeadForm({ id }: { id: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        router.push("/thank-you");
      } else {
        alert("Something went wrong. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-white p-6 shadow-xl md:p-8"
    >
      <div className="mb-4">
        <label
          htmlFor={`name-${id}`}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Parent&apos;s Name
        </label>
        <input
          type="text"
          id={`name-${id}`}
          name="name"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
          placeholder="Your name"
        />
      </div>
      <div className="mb-4">
        <label
          htmlFor={`phone-${id}`}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Phone Number
        </label>
        <input
          type="tel"
          id={`phone-${id}`}
          name="phone"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
          placeholder="(416) 123-4567"
        />
      </div>
      <div className="mb-6">
        <label
          htmlFor={`email-${id}`}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Email Address
        </label>
        <input
          type="email"
          id={`email-${id}`}
          name="email"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
          placeholder="you@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-teal px-6 py-4 font-bold text-white transition-all hover:bg-teal/90 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Sending..." : "Download Free Checklist"}
      </button>
    </form>
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
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 text-lg font-semibold text-gray-900">
          {question}
        </span>
        <span className="flex-shrink-0 text-2xl text-teal">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div className="pb-5">
          <p className="text-gray-600 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const faqs = [
    {
      question: "What if my child is in Grade 12—is it too late?",
      answer:
        "It depends. If you're still in first semester and grades aren't finalized, we can help. But Grade 11 is the ideal time because there's room to show upward trajectory. Download the checklist to assess where you stand.",
    },
    {
      question: "Do you guarantee admission to Waterloo?",
      answer:
        "No one can guarantee university admission. What we guarantee is systematic grade improvement and comprehensive application prep. We coach you through the academics, the Euclid contest, and the interview—everything in your control.",
    },
    {
      question: "Can we do one-off lessons instead of a full semester?",
      answer:
        "No. Real improvement takes time. Students who commit to the full semester see 10-15% grade increases. One-off lessons create false hope without results.",
    },
    {
      question: "What happens during the $19.99 trial?",
      answer:
        "It's a full 60-minute lesson. We'll work through actual problems your child is struggling with, diagnose weak spots, and show you the roadmap. If you continue, the $19.99 goes toward your semester package.",
    },
    {
      question:
        "My child goes to [specific high school]. Do you know their curriculum?",
      answer:
        "Yes. We work with students across the GTA (Markham, Richmond Hill, Aurora, Stouffville, Vaughan) and are familiar with York Region curricula, IB programs, and AP courses.",
    },
    {
      question: "What if we need to cancel mid-semester?",
      answer:
        "If you pay upfront, you're locked in for the semester (non-refundable). If you do the 2-payment option, your spot might be taken by another student in the second half if you cancel. We get lots of mid-semester applicants.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* SECTION 1: HERO */}
      <section id="hero" className="bg-navy px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <h1 className="mb-6 text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl">
                Is Your Grade 11 Student Ready for Waterloo Engineering?
              </h1>
              <p className="mb-8 text-lg leading-relaxed text-gray-300 md:text-xl">
                Most students think 90% is enough. After adjustment factors, you
                need 94-97%. Download our free 10-step checklist to see where
                your child stands—and what to fix before it&apos;s too late.
              </p>
              {/* Trust Badges - Mobile */}
              <div className="mb-8 space-y-3 lg:hidden">
                <div className="flex items-center justify-center gap-2 text-gray-300 lg:justify-start">
                  <span className="text-teal">&#10003;</span>
                  <span>10+ Grade 11-12 students coached to 85%+ averages</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-300 lg:justify-start">
                  <span className="text-teal">&#10003;</span>
                  <span>Specialized in Physics &amp; Advanced Functions</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-300 lg:justify-start">
                  <span className="text-teal">&#10003;</span>
                  <span>GTA-based, evening availability</span>
                </div>
              </div>
            </div>
            <div>
              <LeadForm id="hero" />
              {/* Trust Badges - Desktop */}
              <div className="mt-6 hidden space-y-2 lg:block">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-teal">&#10003;</span>
                  <span>10+ Grade 11-12 students coached to 85%+ averages</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-teal">&#10003;</span>
                  <span>Specialized in Physics &amp; Advanced Functions</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-teal">&#10003;</span>
                  <span>GTA-based, evening availability</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: THE PROBLEM */}
      <section className="bg-white px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:mb-16 md:text-3xl lg:text-4xl">
            Three Reasons Grade 11 Students Don&apos;t Get Into Waterloo
            Engineering
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {/* Column 1 */}
            <div className="rounded-xl bg-gray-light p-6 md:p-8">
              <div className="mb-4 text-4xl">&#128337;</div>
              <h3 className="mb-3 text-xl font-bold text-gray-900">
                They Start Too Late
              </h3>
              <p className="leading-relaxed text-gray-600">
                Most students wait until they bomb a test to get help. By then,
                they&apos;ve missed foundational concepts and spend months
                catching up instead of getting ahead.
              </p>
            </div>
            {/* Column 2 */}
            <div className="rounded-xl bg-gray-light p-6 md:p-8">
              <div className="mb-4 text-4xl">&#128200;</div>
              <h3 className="mb-3 text-xl font-bold text-gray-900">
                They Don&apos;t Know the Real Bar
              </h3>
              <p className="leading-relaxed text-gray-600">
                Waterloo publishes 93% admission averages, but your
                school&apos;s adjustment factor means you actually need 96-98%.
                Parents don&apos;t find out until it&apos;s too late.
              </p>
            </div>
            {/* Column 3 */}
            <div className="rounded-xl bg-gray-light p-6 md:p-8">
              <div className="mb-4 text-4xl">&#128218;</div>
              <h3 className="mb-3 text-xl font-bold text-gray-900">
                Grades Alone Aren&apos;t Enough
              </h3>
              <p className="leading-relaxed text-gray-600">
                Even with a 95% average, students get rejected. Waterloo wants
                Euclid scores, interview skills, and leadership. Most tutors
                only teach math—we prepare the full application.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: THE SOLUTION */}
      <section className="bg-gray-light px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900 md:mb-12 md:text-3xl lg:text-4xl">
            We Get Grade 11 Students Into Waterloo Engineering—Here&apos;s How
          </h2>
          <div className="mx-auto max-w-4xl">
            <div className="rounded-xl bg-white p-6 shadow-lg md:p-10">
              <p className="mb-6 text-lg leading-relaxed text-gray-700">
                AP Academy specializes in one thing: taking Grade 11 students
                who are struggling in physics and math (70-85% range) and
                systematically raising their grades to 85-90%+ by the end of the
                year.
              </p>
              <p className="mb-6 text-lg leading-relaxed text-gray-700">
                We don&apos;t use generic homework help. We use diagnostic
                testing to find exactly where your child is stuck, then build a
                custom roadmap to fix gaps before they compound in Grade 12.
              </p>
              <p className="mb-6 text-lg leading-relaxed text-gray-700">
                And because Waterloo admissions require more than just grades,
                we include:
              </p>
              <ul className="mb-6 space-y-3 text-lg text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-teal">&#10003;</span>
                  <span>Euclid Math Contest prep (free for semester students)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-teal">&#10003;</span>
                  <span>
                    Waterloo interview coaching (Application Information Form
                    video)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-teal">&#10003;</span>
                  <span>Personal project guidance (leadership for your AIF)</span>
                </li>
              </ul>
              <p className="text-lg font-semibold text-navy">
                You&apos;re not hiring a tutor. You&apos;re hiring a Waterloo
                admission specialist who happens to teach physics and math.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: THE OFFER */}
      <section className="bg-white px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:mb-16 md:text-3xl lg:text-4xl">
            Two Packages, One Goal: Get Your Child Into Waterloo
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Card 1: High Touch */}
            <div className="relative rounded-2xl border-2 border-teal bg-white p-6 shadow-xl md:p-8">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-teal px-4 py-1 text-sm font-bold text-white">
                Most Popular
              </div>
              <h3 className="mb-2 text-center text-2xl font-bold text-gray-900">
                High Touch
              </h3>
              <div className="mb-4 text-center">
                <span className="text-4xl font-bold text-navy">$55</span>
                <span className="text-gray-600">/hour</span>
              </div>
              <div className="mb-6 space-y-2 text-center text-gray-600">
                <p>2 lessons per week</p>
                <p>Full semester (Feb-June)</p>
                <p className="font-semibold text-gray-900">
                  Total: $1,760 (or 2 payments of $880)
                </p>
              </div>
              <p className="mb-6 rounded-lg bg-gray-light p-4 text-center text-gray-700">
                For students currently below 85% who need structured support and
                accountability.
              </p>
              <ul className="mb-8 space-y-3 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>32 one-on-one lessons (2x/week)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>Weekly progress reports to parents</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>Custom practice problem sets</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>Test prep sessions before every unit test</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>
                    <strong>BONUS:</strong> 4 Euclid Contest prep sessions ($280
                    value)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>
                    <strong>BONUS:</strong> 2 Waterloo interview coaching
                    sessions ($140 value)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>
                    <strong>BONUS:</strong> 1 personal project workshop ($70
                    value)
                  </span>
                </li>
              </ul>
              <a
                href="#hero"
                className="block w-full rounded-lg bg-teal py-4 text-center font-bold text-white transition-all hover:bg-teal/90 hover:shadow-lg"
              >
                Start with $19.99 Trial
              </a>
            </div>
            {/* Card 2: High Focus */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg md:p-8">
              <h3 className="mb-2 mt-4 text-center text-2xl font-bold text-gray-900">
                High Focus
              </h3>
              <div className="mb-4 text-center">
                <span className="text-4xl font-bold text-navy">$70</span>
                <span className="text-gray-600">/hour</span>
              </div>
              <div className="mb-6 space-y-2 text-center text-gray-600">
                <p>1 lesson per week</p>
                <p>Full semester (Feb-June)</p>
                <p className="font-semibold text-gray-900">
                  Total: $1,120 (or 2 payments of $560)
                </p>
              </div>
              <p className="mb-6 rounded-lg bg-gray-light p-4 text-center text-gray-700">
                For students already at 80%+ who want targeted help to reach
                90%+ and stand out.
              </p>
              <ul className="mb-8 space-y-3 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>16 one-on-one lessons (1x/week)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>Advanced problem-solving strategies</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>Test optimization techniques</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>On-demand support between sessions (email)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>
                    <strong>BONUS:</strong> 4 Euclid Contest prep sessions ($280
                    value)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>
                    <strong>BONUS:</strong> 2 Waterloo interview coaching
                    sessions ($140 value)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-teal">&#10003;</span>
                  <span>
                    <strong>BONUS:</strong> 1 personal project workshop ($70
                    value)
                  </span>
                </li>
              </ul>
              <a
                href="#hero"
                className="block w-full rounded-lg bg-navy py-4 text-center font-bold text-white transition-all hover:bg-navy/90 hover:shadow-lg"
              >
                Start with $19.99 Trial
              </a>
            </div>
          </div>
          <p className="mt-8 text-center text-lg font-semibold text-navy">
            Total Bonus Value: $490 (Included Free When You Commit Today)
          </p>
        </div>
      </section>

      {/* SECTION 5: HOW IT WORKS */}
      <section className="bg-gray-light px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:mb-16 md:text-3xl lg:text-4xl">
            From Struggling to Accepted in Four Simple Steps
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="relative text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal text-2xl font-bold text-white">
                1
              </div>
              <div className="mb-4 text-4xl">&#128197;</div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">
                Download the Checklist
              </h3>
              <p className="text-gray-600">
                See exactly where your child stands with our 10-step Waterloo
                readiness assessment.
              </p>
              {/* Connector - hidden on mobile, shown on lg */}
              <div className="absolute right-0 top-8 hidden h-0.5 w-8 bg-gray-300 lg:block lg:-right-4" />
            </div>
            {/* Step 2 */}
            <div className="relative text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal text-2xl font-bold text-white">
                2
              </div>
              <div className="mb-4 text-4xl">&#128222;</div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">
                Book Your Trial Lesson
              </h3>
              <p className="text-gray-600">
                We&apos;ll call you within 24 hours to schedule a $19.99 trial
                lesson. This goes toward your semester package if you continue.
              </p>
              <div className="absolute right-0 top-8 hidden h-0.5 w-8 bg-gray-300 lg:block lg:-right-4" />
            </div>
            {/* Step 3 */}
            <div className="relative text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal text-2xl font-bold text-white">
                3
              </div>
              <div className="mb-4 text-4xl">&#127909;</div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">
                Get a Custom Roadmap
              </h3>
              <p className="text-gray-600">
                During the trial, we&apos;ll diagnose exactly where your child
                is stuck and show you the plan to fix it.
              </p>
              <div className="absolute right-0 top-8 hidden h-0.5 w-8 bg-gray-300 lg:block lg:-right-4" />
            </div>
            {/* Step 4 */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal text-2xl font-bold text-white">
                4
              </div>
              <div className="mb-4 text-4xl">&#10004;</div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">
                Start Winning
              </h3>
              <p className="text-gray-600">
                Lock in your spot for the semester. Watch grades improve week by
                week. Get into Waterloo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: WHO THIS IS FOR */}
      <section className="bg-white px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:mb-16 md:text-3xl lg:text-4xl">
            Is AP Academy Right for Your Child?
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* This IS for you */}
            <div className="rounded-xl border-2 border-green-500 bg-green-50 p-6 md:p-8">
              <h3 className="mb-6 text-xl font-bold text-green-700">
                This IS for you if...
              </h3>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-green-500">&#10003;</span>
                  <span>
                    Your child is in Grade 11 taking Physics and/or Advanced
                    Functions
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500">&#10003;</span>
                  <span>
                    Current grades are 70-85% and need to reach 85-90%+
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500">&#10003;</span>
                  <span>
                    You&apos;re targeting Waterloo, UofT, McMaster, or other
                    competitive STEM programs
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500">&#10003;</span>
                  <span>
                    Your child is willing to put in the work but needs expert
                    guidance
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500">&#10003;</span>
                  <span>
                    You want more than generic tutoring—you want Waterloo
                    admission prep
                  </span>
                </li>
              </ul>
            </div>
            {/* This ISN'T for you */}
            <div className="rounded-xl border-2 border-red-400 bg-red-50 p-6 md:p-8">
              <h3 className="mb-6 text-xl font-bold text-red-600">
                This ISN&apos;T for you if...
              </h3>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-red-500">&#10007;</span>
                  <span>
                    Your child is already at 95%+ and just needs occasional help
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">&#10007;</span>
                  <span>
                    You&apos;re looking for quick fixes without consistent
                    effort
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">&#10007;</span>
                  <span>
                    You want group tutoring or franchise-style programs
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">&#10007;</span>
                  <span>
                    Your child isn&apos;t interested in STEM programs
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: FAQ */}
      <section className="bg-gray-light px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:mb-16 md:text-3xl lg:text-4xl">
            Common Questions Parents Ask
          </h2>
          <div className="rounded-xl bg-white p-6 shadow-lg md:p-8">
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
      <section id="final-cta" className="bg-navy px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-6 text-2xl font-bold text-white md:text-3xl lg:text-4xl">
            Download Your Free Waterloo Readiness Checklist Now
          </h2>
          <p className="mb-10 text-lg text-gray-300">
            Find out where your child stands in 10 steps. We&apos;ll call you
            within 24 hours to discuss next steps—no pressure, just clarity.
          </p>
          <LeadForm id="cta" />
        </div>
      </section>

      {/* SECTION 9: FOOTER */}
      <footer className="bg-gray-800 px-4 py-12">
        <div className="mx-auto max-w-6xl text-center">
          <h3 className="mb-2 text-xl font-bold text-white">
            AP Academy{" "}
            <span className="font-normal text-gray-400">
              (Ambition Pathways)
            </span>
          </h3>
          <p className="mb-4 text-gray-400">
            Grade 11-12 Physics &amp; Math Tutoring | Waterloo Engineering Prep
          </p>
          <p className="mb-6 text-gray-400">Serving the Greater Toronto Area</p>
          <div className="mb-8 space-y-1 text-gray-400">
            <p>
              Email:{" "}
              <a
                href="mailto:contact@apacademy.ca"
                className="text-teal hover:underline"
              >
                contact@apacademy.ca
              </a>
            </p>
            <p>
              Phone:{" "}
              <a href="tel:+14161234567" className="text-teal hover:underline">
                (416) 123-4567
              </a>
            </p>
          </div>
          <p className="text-sm text-gray-500">
            &copy; 2026 AP Academy. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
