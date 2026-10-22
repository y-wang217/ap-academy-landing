"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { IRIS_TEXT } from "@/lib/view/iris-text";

/** After Approve (REQ-44 AC14): the reply with its signature, and Copy. Charlie sends it from Gmail until Iris 8/9. */
export function CopyReply({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2" data-copy-reply>
      <p className="text-sm">{IRIS_TEXT.approvedCopy}</p>
      <pre className="whitespace-pre-wrap break-words rounded border border-border p-2 font-sans text-sm" data-approved-text>{text}</pre>
      <div>
        <button
          type="button"
          className={`${buttonClass} w-full sm:w-auto`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? IRIS_TEXT.copied : IRIS_TEXT.copy}
        </button>
      </div>
    </div>
  );
}
