// The two ways to work with us. Prices come from app/config.ts so a tuning
// pass edits one place; the copy lives here.

import { PRICING } from "@/app/config";

export type Offer = {
  id: "tutoring" | "intensive";
  eyebrow: string;
  headline: string;
  price: number;
  priceUnit: string;
  subline: string; // the line under the price
  description: string;
  bullets: string[];
  cta: string;
  featured: boolean;
};

export const OFFERS: Offer[] = [
  {
    id: "tutoring",
    eyebrow: "During the school year",
    headline: "1-on-1 tutoring",
    price: 60,
    priceUnit: "hour",
    subline: "Your first lesson is free.",
    description:
      "One student, one instructor, one plan. Grade 11 and 12 math, physics, chemistry and biology, online and live.",
    bullets: [
      "Weekly, twice weekly, or ahead of a test",
      "Every lesson logged within 24 hours",
      "Stop any time, no packages",
    ],
    cta: "Book a free trial lesson",
    featured: true,
  },
  {
    id: "intensive",
    eyebrow: "Before the school year",
    headline: "The course intensive",
    price: PRICING.fullCourse,
    priceUnit: "subject",
    subline: `Start with lesson 1 for $${PRICING.lesson1}.`,
    description: `One grade 12 course front to back in ${PRICING.sessions} lessons, Monday to Friday over two weeks, before the student takes it for marks.`,
    bullets: [
      `${PRICING.sessions} lessons, ${PRICING.sessionLength} each, same time daily`,
      `${PRICING.guaranteeScore}+ on our final, or we keep teaching free`,
      "Advanced Functions, Calculus, Physics, Chemistry",
    ],
    cta: "See the intensive",
    featured: false,
  },
];
