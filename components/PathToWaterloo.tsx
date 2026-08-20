"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STAGES, type Stage } from "@/content/path";
import StageIllustration from "./StageIllustration";
import StageDetail from "./StageDetail";
import { track } from "@/lib/analytics";

// The signature component. One responsive node list (so keyboard order and
// ARIA state exist exactly once); the three breakpoint connectors are
// presentational SVG layers behind it. Opening a stage pushes ?stage=<slug>
// so the browser back button closes the panel and the link is shareable;
// /path/<slug> renders the same content server-side.

const PATH_STROKE = "var(--color-border-dark)";

function isStageSlug(value: string | null): value is Stage["slug"] {
  return STAGES.some((s) => s.slug === value);
}

function slugFromLocation(): Stage["slug"] | null {
  const raw = new URLSearchParams(window.location.search).get("stage");
  return isStageSlug(raw) ? raw : null;
}

export default function PathToWaterloo() {
  const [activeSlug, setActiveSlug] = useState<Stage["slug"] | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const graphicRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openedViaPush = useRef(false);

  // URL sync: the query string is the source of truth for the open panel.
  useEffect(() => {
    const readFromUrl = () => setActiveSlug(slugFromLocation());
    readFromUrl();
    window.addEventListener("popstate", readFromUrl);
    return () => window.removeEventListener("popstate", readFromUrl);
  }, []);

  const openStage = (slug: Stage["slug"]) => {
    setActiveSlug(slug);
    // Preserve Next's router state object when touching history directly.
    window.history.pushState(window.history.state, "", `?stage=${slug}`);
    openedViaPush.current = true;
    track("stage_open", { stage: slug });
  };

  const closeStage = useCallback(() => {
    if (openedViaPush.current) {
      openedViaPush.current = false;
      window.history.back();
    } else {
      // Deep link (?stage= present on load): nothing of ours on the history
      // stack, so strip the param in place.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      setActiveSlug(null);
    }
  }, []);

  // Draw the connector once when the graphic scrolls into view. The attribute
  // is toggled on the DOM node directly: server HTML ships data-drawn="true"
  // (visible without JS); this rewinds it post-hydration and replays the draw.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = graphicRef.current;
    if (!el) return;
    el.dataset.drawn = "false";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.drawn = "true";
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onNodeKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % STAGES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + STAGES.length) % STAGES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = STAGES.length - 1;
    if (next !== null) {
      e.preventDefault();
      setFocusIdx(next);
      nodeRefs.current[next]?.focus();
    }
  };

  const activeStage = STAGES.find((s) => s.slug === activeSlug) ?? null;

  return (
    <section id="path" className="mx-auto max-w-[1160px] px-5 pb-16 pt-2 md:px-10 md:pb-24">
      <p className="eyebrow">The Path to Waterloo</p>
      <h2 className="shead mt-3.5 text-[34px] md:text-[46px] lg:text-[52px]">
        Four stages stand between grade 10 and an offer
      </h2>
      <p className="mx-auto mt-3.5 max-w-[56ch] text-center text-[16px] leading-relaxed text-text-muted">
        Most families only ever hear about marks. Marks are stage two.
      </p>

      <div ref={graphicRef} data-drawn="true" className="relative mt-10 sm:mt-12 lg:mt-14">
        {/* <640px — left-gutter spine */}
        <div className="absolute bottom-10 left-[31px] top-10 w-0.5 sm:hidden" aria-hidden="true">
          <svg className="h-full w-full" viewBox="0 0 2 100" preserveAspectRatio="none">
            <path d="M1 0v100" pathLength={1} className="connector-path" stroke={PATH_STROKE} strokeWidth="2" />
          </svg>
        </div>

        {/* 640–1023px — S-curve */}
        <svg
          className="absolute inset-0 hidden h-full w-full sm:block lg:hidden"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M22.7 8.8 C40 3, 58 14.5, 75 8.8 C96 2, 98 39, 71 50 C51 57.5, 33 51, 22.7 63.9 C39 58, 58 69.5, 75 63.9"
            pathLength={1}
            className="connector-path"
            stroke={PATH_STROKE}
            strokeWidth="0.4"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* ≥1024px — one horizontal path through the disc row */}
        <svg
          className="absolute left-0 top-0 hidden h-40 w-full lg:block"
          viewBox="0 0 1200 160"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M127 80 C230 52, 332 108, 437 80 S642 52, 745 80 S952 108, 1055 80"
            pathLength={1}
            className="connector-path"
            stroke={PATH_STROKE}
            strokeWidth="2"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <ol className="relative grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-16 lg:grid-cols-4">
          {STAGES.map((stage, i) => (
            <li key={stage.slug} className="relative">
              <button
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                type="button"
                tabIndex={focusIdx === i ? 0 : -1}
                aria-expanded={activeSlug === stage.slug}
                aria-haspopup="dialog"
                aria-controls="stage-dialog"
                onClick={() => openStage(stage.slug)}
                onKeyDown={(e) => onNodeKeyDown(e, i)}
                onFocus={() => setFocusIdx(i)}
                className="stage-node group -m-2 flex w-full items-start gap-5 rounded-2xl p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:flex-col sm:items-center sm:gap-4 sm:text-center"
              >
                <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full border border-border-accent bg-surface text-dark shadow-sm sm:h-28 sm:w-28 lg:h-40 lg:w-40">
                  <StageIllustration
                    illustration={stage.illustration}
                    className="h-10 w-10 sm:h-[68px] sm:w-[68px] lg:h-[104px] lg:w-[104px]"
                  />
                </span>
                <span className="block pt-0.5 sm:pt-0">
                  <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-accent-muted">
                    Stage {stage.index}
                  </span>
                  <span className="mt-1.5 block font-serif text-[24px] leading-tight text-dark md:text-[26px]">
                    {stage.title}
                  </span>
                  <span className="stage-reveal mt-2 block max-w-[30ch] text-[14px] leading-relaxed text-text-secondary sm:mx-auto">
                    {stage.hook}
                  </span>
                  <span className="stage-reveal mt-2 block font-mono text-[11.5px] uppercase tracking-[0.1em] text-accent-muted">
                    Learn more →
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <StageDetail stage={activeStage} onClose={closeStage} />
    </section>
  );
}
