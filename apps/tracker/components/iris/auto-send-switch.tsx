"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, Notice, secondaryButtonClass } from "@/components/ui";
import { AUTO_TEXT, gateFailText } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in settings-actions.tsx).
const API = "/tracker/api/iris";

/**
 * The global Sending switch (REQ-49 AC12). Turning it on needs the tick, the
 * Unpause pattern; turning it off never asks. A failed save keeps the old
 * state and shows one error line.
 */
export function SendingSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(on ? { sendingEnabled: true, confirmed: true } : { sendingEnabled: false }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setTicked(false);
      router.refresh();
    } catch {
      setError(AUTO_TEXT.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <p className="text-sm" data-sending-enabled={enabled ? "on" : "off"}>
        {AUTO_TEXT.sending}: <strong>{enabled ? AUTO_TEXT.on : AUTO_TEXT.off}</strong>
      </p>
      {enabled ? (
        <div>
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => save(false)}>
            {AUTO_TEXT.turnOff}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} disabled={busy} data-sending-tick />
            <span>{AUTO_TEXT.sendingTick}</span>
          </label>
          <div>
            <button type="button" className={buttonClass} disabled={busy || !ticked} onClick={() => save(true)} data-sending-on>
              {AUTO_TEXT.turnOn}
            </button>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/**
 * One reply type's switch (REQ-49 AC10, AC13). The server runs the gate; a
 * 422 lists what is still missing under the type, and the old state is kept.
 */
export function AutoSendSwitch({ type, enabled }: { type: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/reply-types/${encodeURIComponent(type)}/auto-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: on }),
      });
      if (res.status === 422) {
        const body = (await res.json().catch(() => null)) as { failing?: string[] } | null;
        setError(`${AUTO_TEXT.gateFailed}: ${gateFailText(body?.failing ?? [])}`);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(AUTO_TEXT.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1" role="status" aria-live="polite">
      <div>
        <button
          type="button"
          className={enabled ? secondaryButtonClass : buttonClass}
          disabled={busy}
          onClick={() => save(!enabled)}
          data-auto-send-switch={type}
        >
          {enabled ? AUTO_TEXT.turnOff : AUTO_TEXT.turnOn}
        </button>
      </div>
      {error && <Notice tone="error"><span data-auto-send-error={type}>{error}</span></Notice>}
    </div>
  );
}
