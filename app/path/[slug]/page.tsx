import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STAGES } from "@/content/path";
import { CONTACT } from "@/app/config";
import StageContent from "@/components/StageContent";
import StageIllustration from "@/components/StageIllustration";
import SiteFooter from "@/components/SiteFooter";

// Server-rendered stage pages: the SEO / no-JS ground truth that the homepage
// dialog progressively enhances (?stage=<slug> shows the same content).

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return STAGES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const stage = STAGES.find((s) => s.slug === slug);
  if (!stage) return {};
  const title = `${stage.title} — The Path to Waterloo | AP Academy`;
  return {
    title,
    description: stage.hook,
    alternates: {
      canonical: `https://ap-academy-landing.vercel.app/path/${stage.slug}`,
    },
    openGraph: {
      title,
      description: stage.hook,
      url: `https://ap-academy-landing.vercel.app/path/${stage.slug}`,
      siteName: "AP Academy",
      locale: "en_CA",
      type: "article",
    },
  };
}

export default async function StagePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const stage = STAGES.find((s) => s.slug === slug);
  if (!stage) notFound();

  const idx = STAGES.findIndex((s) => s.slug === stage.slug);
  const prev = idx > 0 ? STAGES[idx - 1] : null;
  const next = idx < STAGES.length - 1 ? STAGES[idx + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" className="whitespace-nowrap font-serif text-[22px] tracking-tight text-dark">
          AP Academy
        </Link>
        <a
          href={CONTACT.calendly}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90"
        >
          Book a call
        </a>
      </header>

      <main className="mx-auto max-w-[680px] px-5 pb-16 pt-4 md:px-10">
        <Link
          href="/#path"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-text-muted hover:text-accent"
        >
          ← The Path to Waterloo
        </Link>

        <div className="mt-8 flex justify-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full border border-border-accent bg-surface text-dark shadow-sm">
            <StageIllustration illustration={stage.illustration} className="h-[68px] w-[68px]" />
          </span>
        </div>

        <div className="mt-8">
          <StageContent stage={stage} headingTag="h1" source={`page:${stage.slug}`} />
        </div>

        <nav className="mt-12 flex items-center justify-between gap-4 border-t border-border pt-6 text-[13px]" aria-label="Stages">
          {prev ? (
            <Link href={`/path/${prev.slug}`} className="font-mono text-[11.5px] uppercase tracking-[0.1em] text-accent-muted hover:underline">
              ← Stage {prev.index}: {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/path/${next.slug}`} className="text-right font-mono text-[11.5px] uppercase tracking-[0.1em] text-accent-muted hover:underline">
              Stage {next.index}: {next.title} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}
