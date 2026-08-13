import Hero from "@/components/Hero";
import PathToWaterloo from "@/components/PathToWaterloo";
import ReviewsCarousel from "@/components/ReviewsCarousel";
import SimpleOffer from "@/components/SimpleOffer";
import FAQ from "@/components/FAQ";
import BookCallLink from "@/components/BookCallLink";
import SiteFooter from "@/components/SiteFooter";
import { FAQS } from "@/content/faq";

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: [
          faq.paragraphs[0],
          ...(faq.bullets ? [faq.bullets.map((b) => `• ${b}`).join(" ")] : []),
          ...faq.paragraphs.slice(1),
        ].join("\n\n"),
      },
    })),
  };
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />

      {/* Header + hero share a viewport-height block sized so the first path
          node peeks above the fold on a 390px viewport — the peek causes the scroll. */}
      <div className="flex min-h-[calc(100svh-270px)] flex-col md:min-h-[calc(100svh-160px)]">
        <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-5 py-5 md:px-10">
          <span className="whitespace-nowrap font-serif text-[22px] tracking-tight">AP Academy</span>
          <BookCallLink
            placement="header"
            className="rounded-lg bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90"
          >
            Book a call
          </BookCallLink>
        </header>

        <Hero />
      </div>

      <PathToWaterloo />

      <ReviewsCarousel />

      <SimpleOffer />

      <FAQ />

      {/* CLOSING CTA */}
      <section className="mx-auto max-w-[880px] px-5 pb-20 pt-4 text-center md:px-10">
        <h2 className="shead text-[34px] md:text-[42px]">See the path for your child</h2>
        <p className="mx-auto mt-3.5 max-w-[46ch] text-center text-[16px] leading-relaxed text-text-muted">
          A 30-minute call with Mr. Charlie. Bring your child&apos;s current
          marks and goals — leave with a clear next step.
        </p>
        <BookCallLink
          placement="closing"
          className="mt-7 inline-block rounded-xl bg-accent px-10 py-4 text-[16px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
        >
          Book a call with Mr. Charlie
        </BookCallLink>
      </section>

      <SiteFooter />
    </div>
  );
}
