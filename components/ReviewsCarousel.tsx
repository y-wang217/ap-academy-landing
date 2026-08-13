"use client";

import { useRef } from "react";
import { REVIEWS, type Review } from "@/content/reviews";

// Proof section (brief §4.6). Native scroll-snap, no carousel library, never
// autoplays. Hidden entirely while content/reviews.ts is empty; 1–2 entries
// render as a static grid instead of a carousel with lonely slides.

function Stars({ rating }: { rating: Review["rating"] }) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5 text-accent" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill={i < rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.3l6-.8z" />
        </svg>
      ))}
    </div>
  );
}

function SourceBadge({ review }: { review: Review }) {
  const label = review.source === "google" ? "Google review" : "Shared with us directly";
  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
      {label}
    </span>
  );
  if (review.sourceUrl) {
    return (
      <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
        {badge}
      </a>
    );
  }
  return badge;
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <Stars rating={review.rating} />
      <blockquote className="flex-1 text-[15px] leading-[1.7] text-text-secondary">
        &ldquo;{review.quote}&rdquo;
      </blockquote>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[13.5px] font-semibold text-dark">
          {review.attribution}
          {review.dateLabel && (
            <span className="ml-2 font-normal text-text-faint">{review.dateLabel}</span>
          )}
        </span>
        <SourceBadge review={review} />
      </footer>
    </article>
  );
}

export default function ReviewsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  if (REVIEWS.length === 0) return null;

  const scrollByCard = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    track.scrollBy({ left: dir * ((card?.clientWidth ?? 360) + 20), behavior: "smooth" });
  };

  return (
    <section className="mx-auto max-w-[1160px] px-5 pb-14 pt-4 md:px-10">
      <p className="eyebrow">Proof</p>
      <h2 className="shead mt-3.5 text-[34px] md:text-[42px]">What families say</h2>

      {REVIEWS.length <= 2 ? (
        <div className={`mx-auto mt-9 grid max-w-[880px] gap-4 ${REVIEWS.length === 2 ? "md:grid-cols-2" : ""}`}>
          {REVIEWS.map((review) => (
            <ReviewCard key={review.quote.slice(0, 32)} review={review} />
          ))}
        </div>
      ) : (
        <div className="relative mt-9">
          <div
            ref={trackRef}
            tabIndex={0}
            role="region"
            aria-label="Family reviews"
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            {REVIEWS.map((review) => (
              <div key={review.quote.slice(0, 32)} className="w-[85%] flex-none snap-start sm:w-[400px]">
                <ReviewCard review={review} />
              </div>
            ))}
          </div>
          <div className="mt-4 hidden justify-center gap-3 sm:flex">
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => scrollByCard(dir)}
                aria-label={dir === -1 ? "Previous reviews" : "More reviews"}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-accent-muted transition-colors hover:bg-accent-light focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-5 w-5 ${dir === -1 ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
