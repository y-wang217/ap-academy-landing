// Curated testimonials for the proof section. Each entry must be a real,
// verifiable review — never ship placeholder or invented entries. When a quote
// comes from a Google review, set source: "google" and link the profile via
// sourceUrl so the badge points at the original.
//
// The proof section hides itself while this list is empty; with 1–2 entries it
// renders a static grid, with 3+ a scroll-snap carousel.

export type Review = {
  quote: string;
  attribution: string; // "Parent of a grade 12 student", "Alex L."
  rating: 1 | 2 | 3 | 4 | 5 | null;
  source: "google" | "direct";
  sourceUrl?: string;
  dateLabel?: string; // "August 2026"
};

// The AP Academy Google Business Profile reviews panel.
export const GOOGLE_REVIEWS_URL =
  "https://www.google.com/search?q=ap+academy+google+review#mpd=~87304919827272142/customers/reviews";

export const REVIEWS: Review[] = [
  // Paste the real Google review here, e.g.:
  // {
  //   quote: "…the review text…",
  //   attribution: "Parent name",
  //   rating: 5,
  //   source: "google",
  //   sourceUrl: GOOGLE_REVIEWS_URL,
  //   dateLabel: "August 2026",
  // },
];
