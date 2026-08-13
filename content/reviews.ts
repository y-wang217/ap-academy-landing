// Curated testimonials for the proof section. Each entry should be a real,
// verifiable review — never ship placeholder or invented entries. When a quote
// comes from a Google review, link it via sourceUrl so the badge can point at
// the original.

export type Review = {
  quote: string;
  attribution: string; // "Parent of a grade 12 student", "Alex L."
  rating: 1 | 2 | 3 | 4 | 5 | null;
  source: "google" | "direct";
  sourceUrl?: string;
  dateLabel?: string; // "August 2026"
};

export const REVIEWS: Review[] = [];
