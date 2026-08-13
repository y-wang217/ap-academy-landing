import { STAGES } from "@/content/path";
import StageIllustration from "./StageIllustration";

// Static form of the signature component: correct layout at all three
// breakpoints with a real SVG connector. Hover states, keyboard nav, the
// scroll-triggered path draw, and the detail panel are session 3.

const PATH_STROKE = "var(--color-border-dark)";

function StageCopy({
  index,
  title,
  hook,
  align = "center",
}: {
  index: number;
  title: string;
  hook: string;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "text-center" : "text-left"}>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-muted">
        Stage {index}
      </p>
      <h3 className="mt-1.5 font-serif text-[24px] leading-tight text-dark md:text-[26px]">
        {title}
      </h3>
      <p
        className={`mt-2 max-w-[30ch] text-[14px] leading-relaxed text-text-secondary ${centered ? "mx-auto" : ""}`}
      >
        {hook}
      </p>
    </div>
  );
}

function NodeDisc({
  illustration,
  size,
}: {
  illustration: (typeof STAGES)[number]["illustration"];
  size: "sm" | "md" | "lg";
}) {
  const disc =
    size === "sm" ? "h-16 w-16" : size === "md" ? "h-28 w-28" : "h-40 w-40";
  const art =
    size === "sm"
      ? "h-10 w-10"
      : size === "md"
        ? "h-[68px] w-[68px]"
        : "h-[104px] w-[104px]";
  return (
    <span
      className={`flex ${disc} flex-none items-center justify-center rounded-full border border-border-accent bg-surface text-dark shadow-sm`}
    >
      <StageIllustration illustration={illustration} className={art} />
    </span>
  );
}

export default function PathToWaterloo() {
  return (
    <section id="path" className="mx-auto max-w-[1160px] px-5 pb-16 pt-2 md:px-10 md:pb-24">
      <p className="eyebrow">The Path to Waterloo</p>
      <h2 className="shead mt-3.5 text-[34px] md:text-[46px] lg:text-[52px]">
        Four stages stand between grade 10 and an offer
      </h2>
      <p className="mx-auto mt-3.5 max-w-[56ch] text-center text-[16px] leading-relaxed text-text-muted">
        Most families only ever hear about marks. Marks are stage two.
      </p>

      {/* <640px — vertical stack, left-gutter spine */}
      <ol className="relative mt-10 flex flex-col gap-10 sm:hidden">
        <div className="absolute bottom-10 left-[31px] top-10 w-0.5" aria-hidden="true">
          <svg
            className="h-full w-full"
            viewBox="0 0 2 100"
            preserveAspectRatio="none"
          >
            <path d="M1 0v100" stroke={PATH_STROKE} strokeWidth="2" />
          </svg>
        </div>
        {STAGES.map((stage) => (
          <li key={stage.slug} className="relative flex items-start gap-5">
            <NodeDisc illustration={stage.illustration} size="sm" />
            <div className="pt-0.5">
              <StageCopy
                index={stage.index}
                title={stage.title}
                hook={stage.hook}
                align="left"
              />
            </div>
          </li>
        ))}
      </ol>

      {/* 640–1023px — 2×2 grid, S-curve connector */}
      <div className="relative mt-12 hidden sm:block lg:hidden">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M23.8 9.6 C40 3.5, 60 15.5, 76.2 9.6 C97 2.5, 99 40, 72 51 C52 58.5, 34 52, 23.8 65.1 C40 59, 60 71, 76.2 65.1"
            stroke={PATH_STROKE}
            strokeWidth="0.4"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ol className="relative grid grid-cols-2 gap-x-8 gap-y-16">
          {STAGES.map((stage) => (
            <li key={stage.slug} className="relative flex flex-col items-center gap-4">
              <NodeDisc illustration={stage.illustration} size="md" />
              <StageCopy index={stage.index} title={stage.title} hook={stage.hook} />
            </li>
          ))}
        </ol>
      </div>

      {/* ≥1024px — horizontal, one connecting path */}
      <div className="relative mt-14 hidden lg:block">
        <svg
          className="absolute left-0 top-0 h-40 w-full"
          viewBox="0 0 1200 160"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M137 80 C240 52, 342 108, 445 80 S652 52, 755 80 S960 108, 1063 80"
            stroke={PATH_STROKE}
            strokeWidth="2"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ol className="relative grid grid-cols-4 gap-x-8">
          {STAGES.map((stage) => (
            <li key={stage.slug} className="flex flex-col items-center gap-5">
              <NodeDisc illustration={stage.illustration} size="lg" />
              <StageCopy index={stage.index} title={stage.title} hook={stage.hook} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
