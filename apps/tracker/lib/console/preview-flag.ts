/**
 * The kit preview route (REQ-55 AC10, tracker ADR 0066). app/console/preview/page.preview.tsx
 * is a page only when CONSOLE_PREVIEW=1 adds "preview.tsx" to pageExtensions; any other build
 * leaves the file out entirely. The page also calls notFound() at request time without the flag.
 */
export const PREVIEW_ENV = "CONSOLE_PREVIEW";

type Env = Record<string, string | undefined>;

export const previewEnabled = (env: Env) => env[PREVIEW_ENV] === "1";

export function pageExtensionsFor(env: Env): string[] {
  const base = ["tsx", "ts", "jsx", "js"];
  return previewEnabled(env) ? [...base, "preview.tsx"] : base;
}
