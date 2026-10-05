import BookCallLink from "./BookCallLink";
import HeroGraphic from "./HeroGraphic";

// Two columns above the fold: the claim and the call on the left, a lesson
// log card on the right. The secondary link scrolls to the roster, which is
// the proof the claim rests on.

export default function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-[1160px] items-center gap-10 px-5 pb-12 pt-6 md:grid-cols-[1.05fr_0.95fr] md:px-10 md:pb-16 md:pt-10 lg:gap-16">
      <div>
        <p className="eyebrow text-left!">AP Academy</p>
        <h1 className="shead mt-4 text-left! text-[40px] md:text-[54px] lg:text-[62px]">
          We help students get into <span className="text-accent">Waterloo</span>.
        </h1>
        <p className="mt-5 max-w-[44ch] text-[16.5px] leading-relaxed text-text-secondary md:text-[18px]">
          1-on-1 tutoring in grade 11 and 12 math, physics and chemistry. Teachers with
          more than ten years in the subject, every lesson logged, every mark tracked.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <BookCallLink
            placement="hero"
            className="inline-block whitespace-nowrap rounded-xl bg-accent px-8 py-4 text-center text-[16px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
          >
            Book a call with Mr. Charlie
          </BookCallLink>
          <a
            href="#roster"
            className="inline-block text-center font-mono text-[12px] sm:text-left uppercase tracking-[0.12em] text-accent-muted underline-offset-4 hover:underline"
          >
            See how our students are doing ↓
          </a>
        </div>
      </div>
      <HeroGraphic />
    </section>
  );
}
