"use client";

import { CONTACT } from "@/app/config";
import { track } from "@/lib/analytics";

// Every book-a-call CTA goes through this so book_call_click carries its
// placement (brief §8). The hero additionally fires hero_cta_click.

type Props = {
  placement: "hero" | "header" | "stage" | "offer" | "closing";
  className?: string;
  children: React.ReactNode;
};

export default function BookCallLink({ placement, className, children }: Props) {
  return (
    <a
      href={CONTACT.calendly}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (placement === "hero") track("hero_cta_click");
        track("book_call_click", { placement });
      }}
      className={className}
    >
      {children}
    </a>
  );
}
