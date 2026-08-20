"use client";

import { OFFER } from "@/content/offer";
import { CONTACT } from "@/app/config";
import { track } from "@/lib/analytics";

// The escape hatch for parents who already know what they want (brief §4.7).
// Deliberately quieter than the path graphic — a single bordered band.

export default function SimpleOffer() {
  return (
    <section className="mx-auto max-w-[880px] px-5 pb-14 pt-4 md:px-10">
      <div className="rounded-2xl border border-border bg-surface p-7 text-center md:p-9">
        <p className="eyebrow">{OFFER.eyebrow}</p>
        <h2 className="mt-3 font-serif text-[28px] leading-tight text-dark md:text-[32px]">
          {OFFER.headline}
        </h2>
        <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-text-muted">
          {OFFER.description}
        </p>
        <p className="mt-4 text-[17px] text-dark">
          <span className="font-serif text-[30px] text-accent">${OFFER.price}</span>
          <span className="text-text-muted"> / {OFFER.priceUnit}</span>
          <span className="mx-2.5 text-text-faint">·</span>
          <span className="font-semibold">{OFFER.trialLine}</span>
        </p>
        <a
          href={CONTACT.calendly}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("offer_trial_click")}
          className="mt-6 inline-block rounded-xl bg-accent px-8 py-3.5 text-[15px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
        >
          {OFFER.cta}
        </a>
      </div>
    </section>
  );
}
