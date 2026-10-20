import { Notice } from "@/components/ui";
import { peopleFreshness } from "@/lib/view/people-freshness";

/**
 * The one notice above a page that shows people data (REQ-38 AC11, AC12):
 * how old the local copy of names is, or nothing while it is fresh. The page
 * renders its data under it either way. A failed read shows nothing.
 */
export async function PeopleFreshness({ load }: { load?: () => Promise<string | null> }) {
  if (!load) return null;
  let text: string | null;
  try {
    text = peopleFreshness(await load(), new Date());
  } catch {
    return null;
  }
  return text ? <Notice tone="warn">{text}</Notice> : null;
}
