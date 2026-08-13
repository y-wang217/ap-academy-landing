import type { Stage } from "@/content/path";
import VideoFacade from "./VideoFacade";
import LeadMagnetForm from "./LeadMagnetForm";
import BookCallLink from "./BookCallLink";

// The body of a stage — brief §4.3 order: beat, why-this-matters, video slot,
// lead magnet, book-a-call link. Rendered inside the <StageDetail> dialog and
// server-side on /path/[slug]; the heading tag differs per context.

type Props = {
  stage: Stage;
  headingId?: string;
  headingTag?: "h1" | "h2";
  /** Where this render lives, for lead-magnet attribution ("stage:aif", "page:aif"). */
  source: string;
};

export default function StageContent({ stage, headingId, headingTag: Heading = "h2", source }: Props) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-muted">
        Stage {stage.index}
      </p>
      <Heading id={headingId} className="mt-2 font-serif text-[32px] leading-tight text-dark md:text-[38px]">
        {stage.title}
      </Heading>
      <p className="mt-2 text-[15px] italic text-text-muted">{stage.beat}</p>

      <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Why this matters
      </h3>
      <div className="mt-3 flex flex-col gap-3">
        {stage.body.map((para) => (
          <p key={para.slice(0, 32)} className="text-[15px] leading-[1.7] text-text-secondary">
            {para}
          </p>
        ))}
      </div>

      {stage.video && (
        <div className="mt-6">
          <VideoFacade
            provider={stage.video.provider}
            videoId={stage.video.id}
            posterSrc={stage.video.poster}
            durationLabel={stage.video.durationLabel}
            title={`${stage.title} — AP Academy`}
            analyticsStage={stage.slug}
          />
        </div>
      )}

      <div className="mt-6">
        <LeadMagnetForm source={source} cta={stage.leadMagnetCta} />
      </div>

      <p className="mt-5 text-center">
        <BookCallLink
          placement="stage"
          className="font-mono text-[12px] uppercase tracking-[0.1em] text-accent-muted underline-offset-4 hover:underline"
        >
          Talk it through for my child&apos;s situation →
        </BookCallLink>
      </p>
    </div>
  );
}
