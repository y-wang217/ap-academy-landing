"use client";

import { OFFERS, type Offer } from "@/content/offer";
import { CONTACT } from "@/app/config";
import { track } from "@/lib/analytics";

// The two offers, side by side. The tutoring card books a call; the intensive
// card goes to /enroll, where the Stripe links live.

function OfferCard({ offer }: { offer: Offer }) {
  const href = offer.id === "tutoring" ? CONTACT.calendly : "/enroll";
  const external = offer.id === "tutoring";
  return (
    <article
      className={`flex h-full flex-col rounded-2xl border p-7 md:p-8 ${
        offer.featured ? "border-border-dark bg-accent-bg" : "border-border bg-surface"
      }`}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-muted">{offer.eyebrow}</p>
      <h3 className="mt-2 font-serif text-[28px] leading-tight text-dark md:text-[30px]">{offer.headline}</h3>
      <p className="mt-4 text-[17px] text-dark">
        <span className="font-serif text-[40px] leading-none text-accent">${offer.price}</span>
        <span className="text-text-muted"> / {offer.priceUnit}</span>
      </p>
      <p className="mt-2 text-[15px] font-semibold text-dark">{offer.subline}</p>
      <p className="mt-3 text-[14.5px] leading-relaxed text-text-secondary">{offer.description}</p>
      <ul className="mt-5 flex-1 space-y-2">
        {offer.bullets.map((b) => (
          <li key={b} className="bul">
            <span className="dot" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        onClick={() => track(offer.id === "tutoring" ? "offer_trial_click" : "offer_intensive_click")}
        className={`mt-7 inline-block rounded-xl px-7 py-3.5 text-center text-[15px] font-bold transition-colors ${
          offer.featured
            ? "bg-accent text-text-on-dark hover:bg-accent/90"
            : "border border-border-dark bg-surface text-dark hover:bg-accent-bg"
        }`}
      >
        {offer.cta}
      </a>
    </article>
  );
}

export default function Offers() {
  return (
    <section id="offers" className="mx-auto max-w-[1160px] scroll-mt-6 px-5 pb-16 pt-2 md:px-10 md:pb-24">
      <p className="eyebrow">Offers</p>
      <h2 className="shead mt-3.5 text-[34px] md:text-[46px]">Two ways to work with us</h2>
      <div className="mx-auto mt-10 grid max-w-[960px] gap-4 md:grid-cols-2">
        {OFFERS.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </div>
    </section>
  );
}
