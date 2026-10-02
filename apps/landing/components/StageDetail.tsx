"use client";

import { useEffect, useRef } from "react";
import type { Stage } from "@/content/path";
import StageContent from "./StageContent";

// Native <dialog> gives us the top-layer focus trap, Esc handling, and focus
// return to the invoking node for free; open/close state and the URL are owned
// by <PathToWaterloo>.

type Props = {
  stage: Stage | null;
  onClose: () => void;
};

export default function StageDetail({ stage, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (stage && !dialog.open) dialog.showModal();
    if (!stage && dialog.open) dialog.close();
  }, [stage]);

  return (
    <dialog
      ref={ref}
      id="stage-dialog"
      aria-labelledby="stage-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="stage-dialog m-auto w-[calc(100vw-32px)] max-w-[620px] rounded-2xl border border-border bg-surface p-0 text-inherit"
    >
      {stage && (
        <div className="max-h-[85svh] overflow-y-auto p-6 md:p-8">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent-light hover:text-accent-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <StageContent
            stage={stage}
            headingId="stage-dialog-title"
            headingTag="h2"
            source={`stage:${stage.slug}`}
          />
        </div>
      )}
    </dialog>
  );
}
