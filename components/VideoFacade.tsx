"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

// Poster + play button that swaps in the provider iframe only after a click,
// so third-party player JS never loads on page load.

type Props = {
  provider: "youtube" | "vimeo" | "mux";
  videoId: string;
  title: string;
  posterSrc?: string;
  durationLabel?: string;
  /** Stage slug (or other id) reported with playback analytics events. */
  analyticsStage?: string;
};

function embedSrc(provider: Props["provider"], videoId: string): string {
  switch (provider) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    case "vimeo":
      return `https://player.vimeo.com/video/${videoId}?autoplay=1`;
    case "mux":
      return `https://player.mux.com/${videoId}?autoplay=true`;
  }
}

export default function VideoFacade({
  provider,
  videoId,
  title,
  posterSrc,
  durationLabel,
  analyticsStage,
}: Props) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-dark">
        <iframe
          src={embedSrc(provider, videoId)}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setPlaying(true);
        track("stage_video_play", { stage: analyticsStage });
      }}
      aria-label={`Play video: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-dark text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {posterSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- poster comes from the video provider CDN; next/image remote config isn't set up
        <img
          src={posterSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      ) : (
        <span className="absolute inset-0 bg-gradient-to-br from-dark to-[#3a2f27]" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-text-on-dark shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none">
          <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-7 w-7" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>
      </span>
      {durationLabel && (
        <span className="absolute bottom-3 right-3 rounded-md bg-dark/80 px-2 py-1 font-mono text-[11px] text-text-on-dark">
          {durationLabel}
        </span>
      )}
    </button>
  );
}
