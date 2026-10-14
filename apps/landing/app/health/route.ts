// Liveness check. Imports nothing, so it answers even when Supabase is unset
// or paused, and is never prerendered, so a 200 means a live function replied.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response("ok", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
