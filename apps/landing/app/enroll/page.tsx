"use client";

import Link from "next/link";
import {
  STRIPE_LESSON1_LINK,
  STRIPE_FULL_COURSE_LINK,
  STRIPE_BUNDLE_LINK,
  CONTACT,
  PRICING,
} from "../config";

// SVG Icons
const ShieldCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 2.5v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9v-5z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

const CalendarCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="15" rx="2"/>
    <path d="M8 3v4M16 3v4M8.5 13l2 2 4-4"/>
  </svg>
);

const GraduationIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-4 9 4-9 4z"/>
    <path d="M7 11v4c0 1 2.2 2 5 2s5-1 5-2v-4"/>
    <path d="M21 9v4"/>
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3"/>
    <path d="M3.5 19c.4-3 2.7-4.5 5.5-4.5s5.1 1.5 5.5 4.5"/>
    <path d="M16 5.5a3 3 0 0 1 0 5.6"/>
    <path d="M17.5 14.6c2 .6 3.2 2 3.5 4.4"/>
  </svg>
);

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
    <path d="M12 6c-1.6-1.1-3.6-1.6-6-1.5v12c2.4-.1 4.4.4 6 1.5 1.6-1.1 3.6-1.6 6-1.5v-12c-2.4-.1-4.4.4-6 1.5z"/>
    <path d="M12 6v12"/>
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2"/>
    <path d="M8 20h8M12 16v4"/>
  </svg>
);

// Purchasable Price Card
function PurchaseCard({
  title,
  price,
  priceNote,
  description,
  benefit,
  icon: Icon,
  stripeLink,
  buttonText,
  highlighted = false,
  informational = false
}: {
  title: string;
  price: string;
  priceNote?: string;
  description: string;
  benefit: string;
  icon: React.FC;
  stripeLink?: string;
  buttonText: string;
  highlighted?: boolean;
  informational?: boolean;
}) {
  const linkReady = stripeLink && stripeLink.length > 0;

  return (
    <div
      className={`flex flex-col rounded-2xl p-6 ${
        highlighted
          ? "border border-border-dark bg-accent-bg"
          : "border border-border bg-surface"
      }`}
    >
      <h3 className="text-center font-serif text-[22px]">{title}</h3>
      <div className="mx-auto mt-3 h-0.5 w-[30px] bg-accent"></div>
      <div className="mt-4 text-center">
        <span className="font-serif text-[48px] leading-none text-accent" dangerouslySetInnerHTML={{ __html: price }}></span>
        {priceNote && <span className="text-[14px] text-text-muted">{priceNote}</span>}
      </div>
      <p className="mx-auto mt-3.5 max-w-[32ch] text-center text-[14px] leading-relaxed text-text-muted">{description}</p>

      <div className={`mt-5 flex items-start gap-3 border-t border-dashed pt-4 ${highlighted ? "border-border-dark" : "border-border-accent"}`}>
        <span className="flex-none text-accent-muted [&_svg]:h-[22px] [&_svg]:w-[22px]"><Icon /></span>
        <span className="text-[13px] leading-snug text-text-secondary">{benefit}</span>
      </div>

      {/* CTA Button */}
      <div className="mt-5">
        {informational ? (
          <div className="rounded-lg border border-border bg-background px-4 py-3 text-center text-[13px] text-text-muted">
            Ask us to apply this at signup
          </div>
        ) : linkReady ? (
          <a
            href={stripeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-accent py-3.5 text-center text-[14px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90"
          >
            {buttonText}
          </a>
        ) : (
          <button
            disabled
            className="block w-full cursor-not-allowed rounded-lg bg-accent/40 py-3.5 text-center text-[14px] font-semibold text-text-on-dark/70"
          >
            {buttonText}
            <span className="ml-2 text-[11px] font-normal">(Link not set)</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function EnrollPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="mx-auto flex max-w-[1160px] items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" className="whitespace-nowrap font-serif text-[22px] tracking-tight">
          AP Academy
        </Link>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-muted hover:text-accent"
        >
          ← Back
        </Link>
      </header>

      {/* MAIN CONTENT */}
      <section className="mx-auto max-w-[1160px] px-5 pb-12 pt-6 md:px-10">
        <p className="eyebrow">Enroll</p>
        <h1 className="shead mt-3.5 text-[38px] md:text-[50px]">Choose your option</h1>
        <p className="mx-auto mt-3.5 max-w-[50ch] text-center text-[16px] leading-relaxed text-text-muted">
          Start low-risk with a single lesson, or commit to the full 2-week program.
        </p>

        {/* Pricing Cards */}
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PurchaseCard
            title="Start with Lesson 1"
            price={`$${PRICING.lesson1}`}
            description="Try one class first. Continue only if it feels right for your child."
            benefit="Best for families who want a low-risk start."
            icon={ShieldCheckIcon}
            stripeLink={STRIPE_LESSON1_LINK}
            buttonText="Get Started →"
          />
          <PurchaseCard
            title="Full 2-Week Course"
            price={`$${PRICING.fullCourse}`}
            priceNote=" / subject"
            description="10 lessons · Monday–Friday · same time each day"
            benefit="Best for students who want structure and consistent practice."
            icon={CalendarCheckIcon}
            stripeLink={STRIPE_FULL_COURSE_LINK}
            buttonText="Enroll Now →"
          />
          <PurchaseCard
            title="2-Subject Bundle"
            price={`$${PRICING.bundle}`}
            description={`Take 2 subjects in the same 2-week session and save $${PRICING.bundleSavings}.`}
            benefit="Ideal for students preparing for a stronger school year."
            icon={GraduationIcon}
            stripeLink={STRIPE_BUNDLE_LINK}
            buttonText="Get Bundle →"
          />
          <PurchaseCard
            title="Bring a Friend Bonus"
            price="Both save<br>$100"
            description="Applies to the full 2-week course when both students join the same class time."
            benefit="A simple way to save when friends learn together."
            icon={UsersIcon}
            buttonText=""
            highlighted
            informational
          />
        </div>

        {/* Trust bar */}
        <div className="mt-10 flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-4 md:flex-row md:justify-center md:gap-14">
          <div className="flex items-center gap-3 text-accent-muted [&_svg]:h-5 [&_svg]:w-5">
            <BookIcon />
            <span className="text-[14px] font-semibold text-dark">10 lessons per course</span>
          </div>
          <div className="flex items-center gap-3 text-accent-muted [&_svg]:h-5 [&_svg]:w-5">
            <MonitorIcon />
            <span className="text-[14px] font-semibold text-dark">Online Monday–Friday</span>
          </div>
          <div className="flex items-center gap-3 text-accent-muted [&_svg]:h-5 [&_svg]:w-5">
            <ShieldCheckIcon />
            <span className="text-[14px] font-semibold text-dark">Low-risk start</span>
          </div>
        </div>

        {/* Secure checkout note */}
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-wide text-text-muted">
          Secure checkout via Stripe · Receipt by email
        </p>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-5 py-8 md:px-10">
        <div className="mx-auto max-w-[1160px]">
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
        </div>
      </footer>
    </div>
  );
}
