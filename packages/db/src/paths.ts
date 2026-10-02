const PROBE_ORIGIN = "https://origin.invalid";

/**
 * Where to send someone after login. Only same-origin relative paths are
 * honoured; anything else returns `fallback`, so `next` can't be used as an
 * open redirect. Rejects protocol-relative paths in every spelling a browser
 * accepts (`//x`, `/\x`, and ones hidden behind tabs or newlines, which URL
 * parsers strip).
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return value;
}

/**
 * The root-level login page, outside every app's basePath, carrying the path
 * to come back to. A path, not a URL (see `redirectKeepingCookies`).
 * Slashes are left readable: `/login?next=/tracker`.
 */
export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(next).replace(/%2F/gi, "/")}`;
}
