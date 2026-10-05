import { REVIEWS, type Review } from "@/content/reviews";

// The one review that sits directly under the hero. Takes the first Google
// review in content/reviews.ts, so it is verifiable by a click. Hides itself
// while the list is empty.

function Stars({ rating }: { rating: Review["rating"] }) {
  if (!rating) return null;
  return (
    <div className="flex gap-1 text-accent-light" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className="h-5 w-5" fill={i < rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.3l6-.8z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewBand() {
  const review = REVIEWS.find((r) => r.source === "google") ?? REVIEWS[0];
  if (!review) return null;

  const sourceLabel = review.source === "google" ? "Google review" : "Shared with us directly";

  return (
    <section className="bg-dark text-text-on-dark" aria-label="Parent review">
      <div className="mx-auto grid max-w-[1160px] gap-7 px-5 py-10 md:grid-cols-[auto_1fr] md:items-center md:gap-14 md:px-10 md:py-12">
        <div className="flex items-center gap-5 md:block">
          <Stars rating={review.rating} />
          {review.rating && (
            <p className="font-serif text-[40px] leading-none md:mt-3 md:text-[48px]">
              {review.rating}.0<span className="text-[20px] text-text-on-dark-faint"> / 5</span>
            </p>
          )}
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-on-dark-muted md:mt-3">
            {review.sourceUrl ? (
              <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                {sourceLabel} ↗
              </a>
            ) : (
              sourceLabel
            )}
          </p>
        </div>
        <blockquote className="border-l-2 border-accent-light/40 pl-5 md:pl-7">
          <p className="font-serif text-[20px] leading-[1.45] md:text-[24px]">&ldquo;{review.quote}&rdquo;</p>
          <footer className="mt-4 text-[13.5px] text-text-on-dark-muted">
            <span className="font-semibold text-text-on-dark">{review.attribution}</span>
            {review.dateLabel && <span> · {review.dateLabel}</span>}
          </footer>
        </blockquote>
      </div>
    </section>
  );
}
