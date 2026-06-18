"use client";

import Image from "next/image";
import Link from "next/link";
import { VSL_EMBED_URL, CONTACT, PRICING } from "../config";

function CTAButton({
  href,
  large = false,
  children,
}: {
  href: string;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-lg bg-accent font-bold text-white transition-all hover:bg-accent-hover hover:shadow-lg ${
        large ? "px-10 py-5 text-lg" : "px-8 py-4"
      }`}
    >
      {children}
    </Link>
  );
}

function VideoEmbed() {
  // If no URL is set, show placeholder
  if (!VSL_EMBED_URL) {
    return (
      <div className="relative mx-auto aspect-video w-full max-w-[800px] overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
          <svg
            className="h-16 w-16 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm">Video coming soon</span>
        </div>
      </div>
    );
  }

  // Detect YouTube vs Vimeo and render appropriate embed
  const isYouTube =
    VSL_EMBED_URL.includes("youtube.com") ||
    VSL_EMBED_URL.includes("youtu.be");
  const isVimeo = VSL_EMBED_URL.includes("vimeo.com");

  // Extract video ID and build embed URL
  let embedSrc = VSL_EMBED_URL;

  if (isYouTube) {
    // Convert watch URL to embed URL if needed
    const videoId =
      VSL_EMBED_URL.match(/(?:v=|\/embed\/|youtu\.be\/)([^&?/]+)/)?.[1] || "";
    embedSrc = `https://www.youtube.com/embed/${videoId}`;
  } else if (isVimeo) {
    // Convert vimeo.com/123456 to player.vimeo.com/video/123456
    const videoId = VSL_EMBED_URL.match(/vimeo\.com\/(\d+)/)?.[1] || "";
    embedSrc = `https://player.vimeo.com/video/${videoId}`;
  }

  return (
    <div className="relative mx-auto aspect-video w-full max-w-[800px] overflow-hidden rounded-xl bg-black">
      <iframe
        src={embedSrc}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="How AP Academy Summer Intensive Works"
      />
    </div>
  );
}

export default function InfoPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <section className="px-4 py-12 md:py-16">
        <div className="mx-auto max-w-[800px] text-center">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm text-text-muted hover:text-accent"
          >
            ← Back to home
          </Link>
          <h1 className="mb-4 text-[28px] font-bold leading-tight text-navy md:text-[36px]">
            How the Summer Intensive Works
          </h1>
          <p className="text-[18px] text-text-secondary">
            Watch this short video to see if this is right for your child.
          </p>
        </div>
      </section>

      {/* VIDEO */}
      <section className="px-4 pb-12">
        <VideoEmbed />
      </section>

      {/* CTA */}
      <section className="px-4 py-12 md:py-16">
        <div className="mx-auto max-w-[500px] text-center">
          <p className="mb-6 text-text-secondary">
            {PRICING.sessions} × {PRICING.sessionLength} lessons.{" "}
            {PRICING.guaranteeScore}+ guarantee. Start with just $
            {PRICING.deposit}.
          </p>
          <CTAButton href="/enroll" large>
            Reserve a spot — ${PRICING.deposit}
          </CTAButton>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-4 py-8">
        <div className="mx-auto flex max-w-[800px] flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="AP Academy"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="font-semibold text-text-primary">AP Academy</span>
          </div>
          <div className="text-sm text-text-muted">
            <a href={`mailto:${CONTACT.email}`} className="hover:text-accent">
              {CONTACT.email}
            </a>
            {" · "}
            <a
              href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`}
              className="hover:text-accent"
            >
              ({CONTACT.phone.slice(0, 3)}) {CONTACT.phone.slice(4)}
            </a>
            {" · "}
            <Link href="/privacy" className="hover:text-accent">
              Privacy Policy
            </Link>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-text-muted">
          © {new Date().getFullYear()} AP Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
