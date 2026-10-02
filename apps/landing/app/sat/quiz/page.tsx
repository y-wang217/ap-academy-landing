import type { Metadata } from "next";
import Quiz from "./quiz";

export const metadata: Metadata = {
  title: "SAT Vocabulary Quiz | AP Academy",
  description:
    "Multiple-choice SAT vocabulary practice. Four definitions, one word, instant feedback.",
  alternates: {
    canonical: "https://ap-academy-landing.vercel.app/sat/quiz",
  },
};

export default function SatQuizPage() {
  return <Quiz />;
}
