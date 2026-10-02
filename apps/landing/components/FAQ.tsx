"use client";

import { FAQS, type FAQEntry } from "@/content/faq";
import { track } from "@/lib/analytics";

// Native <details>/<summary> accordion (brief §4.8) — expand/collapse needs no
// JS; the only script here is the faq_open analytics event.

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 flex-none text-accent transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function FAQItem({ faq }: { faq: FAQEntry }) {
  const [firstParagraph, ...restParagraphs] = faq.paragraphs;

  return (
    <details
      className="group border-b border-border"
      onToggle={(e) => {
        if (e.currentTarget.open) track("faq_open", { question: faq.question });
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
        <span className="text-[15px] font-semibold text-dark md:text-[16px]">{faq.question}</span>
        <Chevron />
      </summary>
      <div className="pb-5 text-[14px] leading-[1.7] text-text-secondary md:text-[15px]">
        <p>{firstParagraph}</p>
        {faq.bullets && (
          <ul className="ml-5 mt-3 list-disc space-y-1.5">
            {faq.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {restParagraphs.map((para, i) => (
          <p key={i} className="mt-3">
            {para}
          </p>
        ))}
      </div>
    </details>
  );
}

export default function FAQ() {
  return (
    <section className="mx-auto max-w-[880px] px-5 pb-12 pt-12 md:px-10">
      <p className="eyebrow">FAQ</p>
      <h2 className="shead mt-3.5 text-[38px] md:text-[50px]">Frequently Asked Questions</h2>
      <p className="mx-auto mt-3.5 max-w-[60ch] text-center text-[16px] leading-relaxed text-text-muted">
        Everything parents usually ask before booking a call.
      </p>

      <div className="mt-10">
        {FAQS.map((faq) => (
          <FAQItem key={faq.question} faq={faq} />
        ))}
      </div>
    </section>
  );
}
