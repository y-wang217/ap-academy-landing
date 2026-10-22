/** The console's three modes (REQ-55 AC2). The URL's ?mode= picks one; anything else is Sales. */
export const CONSOLE_MODES = ["sales", "creation", "operations"] as const;
export type ConsoleMode = (typeof CONSOLE_MODES)[number];

export const MODE_LABELS: Record<ConsoleMode, string> = { sales: "Sales", creation: "Creation", operations: "Operations" };

export function parseMode(value: unknown): ConsoleMode {
  const first = Array.isArray(value) ? value[0] : value;
  return CONSOLE_MODES.find((m) => m === first) ?? "sales";
}

/** The tab a key moves to in a tablist of `count` tabs, or null when the key is not a move. */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
