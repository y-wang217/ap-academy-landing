import type { Metadata } from "next";
import Flashcards from "./flashcards";
import { WORDS } from "./words";

export const metadata: Metadata = {
  title: "SAT Vocabulary Flashcards | Free, No Sign-Up",
  description: `Practice ${WORDS.length} of the most common SAT vocabulary words. Free flashcards and a multiple-choice quiz — no account needed to start.`,
  alternates: {
    canonical: "https://ap-academy-landing.vercel.app/sat",
  },
  openGraph: {
    title: "SAT Vocabulary Flashcards | Free, No Sign-Up",
    description: `Practice ${WORDS.length} of the most common SAT vocabulary words. Free, instant, no account needed.`,
    url: "https://ap-academy-landing.vercel.app/sat",
    siteName: "AP Academy",
    locale: "en_CA",
    type: "website",
  },
};

export default function SatPage() {
  return <Flashcards />;
}
