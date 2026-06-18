"use client";

import Link from "next/link";
import { VSL_EMBED_URL, CONTACT, PRICING } from "../config";

function VideoEmbed() {
  // If no URL is set, show placeholder
  if (!VSL_EMBED_URL) {
    return (
      <div className="relative mx-auto aspect-video w-full max-w-[800px] overflow-hidden rounded-sm border-2 border-dashed border-border bg-surface">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
          <svg
            className="h-16 w-16 opacity-40"
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
          <span className="font-mono text-[11px] uppercase tracking-wide">
            Video coming soon
          </span>
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
    const videoId =
      VSL_EMBED_URL.match(/(?:v=|\/embed\/|youtu\.be\/)([^&?/]+)/)?.[1] || "";
    embedSrc = `https://www.youtube.com/embed/${videoId}`;
  } else if (isVimeo) {
    const videoId = VSL_EMBED_URL.match(/vimeo\.com\/(\d+)/)?.[1] || "";
    embedSrc = `https://player.vimeo.com/video/${videoId}`;
  }

  return (
    <div className="relative mx-auto aspect-video w-full max-w-[800px] overflow-hidden rounded-sm bg-dark">
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
      {/* NAV */}
      <nav className="flex items-center justify-between px-5 py-5">
        <Link
          href="/"
          className="font-serif text-[21px] tracking-tight text-dark"
        >
          AP Academy
        </Link>
        <Link
          href="/enroll"
          className="font-mono text-[10px] uppercase tracking-wider text-dark hover:text-accent"
        >
          Enroll →
        </Link>
      </nav>

      {/* HEADER */}
      <section className="px-5 pt-4 pb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-text-muted hover:text-accent"
        >
          ← Back
        </Link>
        <h1 className="mt-6 font-serif text-[36px] font-normal leading-[1.1] tracking-tight text-dark sm:text-[42px]">
          How the Summer
          <br />
          Intensive Works
        </h1>
        <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-text-secondary">
          Watch this short video to see if this is right for your child.
        </p>
      </section>

      {/* VIDEO */}
      <section className="px-5 pb-10">
        <VideoEmbed />
      </section>

      {/* CTA */}
      <section className="bg-dark px-5 py-10">
        <div className="mx-auto max-w-[400px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Ready to start?
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-text-on-dark-faint">
            {PRICING.sessions} × {PRICING.sessionLength} lessons.{" "}
            {PRICING.guaranteeScore}+ guarantee. Start with just $
            {PRICING.deposit}.
          </p>
          <Link
            href="/enroll"
            className="mt-6 inline-block rounded-sm bg-accent px-8 py-4 text-[15px] font-bold text-[#F8EDE6] transition-colors hover:bg-accent/90"
          >
            Reserve a spot — ${PRICING.deposit}
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-5 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="font-serif text-[18px] text-dark">AP Academy</span>
          <div className="flex flex-wrap justify-center gap-3 text-[12px] text-text-muted">
            <a
              href={`mailto:${CONTACT.email}`}
              className="hover:text-accent"
            >
              {CONTACT.email}
            </a>
            <span>·</span>
            <a
              href={`tel:+1${CONTACT.phone.replace(/-/g, "")}`}
              className="hover:text-accent"
            >
              ({CONTACT.phone.slice(0, 3)}) {CONTACT.phone.slice(4)}
            </a>
            <span>·</span>
            <Link href="/privacy" className="hover:text-accent">
              Privacy
            </Link>
          </div>
          <p className="text-[11px] text-text-faint">
            © {new Date().getFullYear()} AP Academy
          </p>
        </div>
      </footer>
    </div>
  );
}
