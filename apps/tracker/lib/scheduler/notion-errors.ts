/**
 * What a failed Notion call means for a retry (REQ-35). Duck-typed on the
 * error's name, so client-safe code and fakes never import lib/notion.
 *
 * - retryable: a network error or abort (no status), a 429, a 5xx, or an
 *   error that is not from Notion at all (a storage blip); the attempt cap bounds it.
 * - permanent: any other Notion status (400, 401, 403, 404), or a RenderError.
 * - ambiguous: the retryable cases except 429. Notion may have applied the
 *   call anyway, so a non-idempotent call must not simply be repeated.
 */
type NotionLike = { name: "NotionError"; status?: number; retryAfterSeconds?: number };
const asNotion = (e: unknown): NotionLike | null =>
  e instanceof Error && e.name === "NotionError" ? (e as unknown as NotionLike) : null;

export function isRetryable(e: unknown): boolean {
  const n = asNotion(e);
  if (!n) return !(e instanceof Error && e.name === "RenderError");
  return n.status === undefined || n.status === 429 || n.status >= 500;
}

export function isAmbiguous(e: unknown): boolean {
  const n = asNotion(e);
  return !!n && (n.status === undefined || n.status >= 500);
}

export function isRateLimited(e: unknown): boolean {
  return asNotion(e)?.status === 429;
}

export function retryAfterOf(e: unknown): number | undefined {
  return asNotion(e)?.retryAfterSeconds;
}
