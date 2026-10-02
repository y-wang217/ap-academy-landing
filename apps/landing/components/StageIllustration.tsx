import type { Stage } from "@/content/path";

// Placeholder line-art illustrations for the four path stages. Final art
// arrives as separate SVG files with the same group ids so the session-3
// animation can target parts (#storm-bolt etc.) without markup changes.

type Props = {
  illustration: Stage["illustration"];
  className?: string;
};

const SHARED = {
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Compass({ className }: { className?: string }) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <g id="compass-dial">
        <circle cx="24" cy="24" r="17" />
        <path d="M24 4v3M24 41v3M4 24h3M41 24h3" />
      </g>
      <g id="compass-needle" className="text-accent">
        <path d="M31 17l-4.4 9.6L17 31l4.4-9.6z" />
      </g>
    </svg>
  );
}

function Threshold({ className }: { className?: string }) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <g id="threshold-door">
        <path d="M13 43V13a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v30" />
        <path d="M7 43h34" />
      </g>
      <g id="threshold-line" className="text-accent">
        <path d="M13 20h22" strokeDasharray="3.5 3.5" />
        <path d="M20 31l3 3 6-6" />
      </g>
    </svg>
  );
}

function Storm({ className }: { className?: string }) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <g id="storm-cloud">
        <path d="M34 28a6.5 6.5 0 0 0-.6-13A9.5 9.5 0 0 0 15 12.6 7.5 7.5 0 0 0 13.5 28z" />
      </g>
      <g id="storm-bolt" className="text-accent">
        <path d="M25 28l-5.5 8H25l-3.5 8 9.5-11h-5.5l4-5z" />
      </g>
    </svg>
  );
}

function Dawn({ className }: { className?: string }) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <g id="dawn-sun" className="text-accent">
        <path d="M15 31a9 9 0 0 1 18 0" />
        <path d="M24 13v4M11.3 18.3l2.8 2.8M36.7 18.3l-2.8 2.8" />
      </g>
      <g id="dawn-path">
        <path d="M6 31h36" />
        <path d="M19 43l4.2-9M29 43l-4.2-9" />
      </g>
    </svg>
  );
}

const ILLUSTRATIONS: Record<Stage["illustration"], typeof Compass> = {
  compass: Compass,
  threshold: Threshold,
  storm: Storm,
  dawn: Dawn,
};

export default function StageIllustration({ illustration, className }: Props) {
  const Art = ILLUSTRATIONS[illustration];
  return <Art className={className} />;
}
