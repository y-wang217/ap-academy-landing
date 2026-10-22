import type { PanelStatus } from "../../../lib/console/panel-view";

const BADGES: Record<PanelStatus, { label: string; shape: string }> = {
  ready: { label: "Current", shape: "filled" },
  empty: { label: "Empty", shape: "hollow" },
  loading: { label: "Loading", shape: "dotted" },
  stale: { label: "Stale", shape: "triangle" },
  error: { label: "Error", shape: "cross" },
  unverifiable: { label: "Unverified", shape: "dash-ring" },
};

function Shape({ shape }: { shape: string }) {
  switch (shape) {
    case "filled":
      return <circle cx="6" cy="6" r="4.5" fill="currentColor" />;
    case "hollow":
      return <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />;
    case "dotted":
      return <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 2" />;
    case "triangle":
      return <path d="M6 1.5 L11 10.5 H1 Z" fill="currentColor" />;
    case "cross":
      return <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="2" />;
    default:
      return <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />;
  }
}

/** A panel's status as text plus a shape; colour is secondary (REQ-55 AC3). */
export function StatusBadge({ status }: { status: PanelStatus }) {
  const { label, shape } = BADGES[status];
  return (
    <span className="console-badge" data-status={status}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" data-shape={shape}>
        <Shape shape={shape} />
      </svg>
      <span>{label}</span>
    </span>
  );
}
