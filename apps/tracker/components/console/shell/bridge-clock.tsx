"use client";

import { useEffect, useState } from "react";
import { bridgeClock } from "../../../lib/console/format";

/** Toronto wall time. The server renders the first value; the client takes over and updates every 15 s. */
export function BridgeClock({ initialIso }: { initialIso: string }) {
  const [now, setNow] = useState(initialIso);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return (
    <time dateTime={now} className="console-clock tabular-nums" suppressHydrationWarning>
      {bridgeClock(new Date(now))}
    </time>
  );
}
