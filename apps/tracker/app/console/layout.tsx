import type { ReactNode } from "react";
import { SessionExpired } from "@/components/console/session-expired";
import { ownerViewer } from "@/lib/pages";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/**
 * The founder console gate (REQ-53, tracker ADR 0062). It sits in the layout,
 * outside loading.tsx, so a non-owner's notFound() is thrown before any 200
 * is streamed and lands on the tracker's usual 404 with no console chrome.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const gate = await ownerViewer();
  if (gate.kind === "expired") return <SessionExpired />;
  return children;
}
