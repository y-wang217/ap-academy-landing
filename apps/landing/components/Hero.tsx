import BookCallLink from "./BookCallLink";

export default function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center justify-center px-5 pb-14 pt-10 text-center md:pb-20 md:pt-16">
      <p className="eyebrow">AP Academy</p>
      <h1 className="shead mt-4 text-[42px] md:text-[60px] lg:text-[68px]">
        We help students get into Waterloo.
      </h1>
      <p className="mx-auto mt-5 max-w-[44ch] text-[16.5px] leading-relaxed text-text-secondary md:text-[18px]">
        Getting in isn&apos;t luck — it&apos;s a four-stage path, and it&apos;s
        navigable with the right guide.
      </p>
      <BookCallLink
        placement="hero"
        className="mt-8 inline-block rounded-xl bg-accent px-9 py-4 text-[16px] font-bold text-text-on-dark transition-colors hover:bg-accent/90"
      >
        Book a call with Mr. Charlie
      </BookCallLink>
    </section>
  );
}
