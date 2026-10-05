"use client";

import { useRef, useState, useTransition } from "react";
import { confirmDraft, discardDraft, draftChanges, type DraftPreview, type DraftScope } from "@/app/actions/ai";
import { buttonClass, inputClass, secondaryButtonClass } from "../ui";

type Preview = Extract<DraftPreview, { ok: true }>;

/**
 * The composer (ADRs 0028, 0029): say what changed, paste material, or attach
 * photos, PDFs and transcripts. The draft changes nothing; only "Save
 * selected" writes, and only the ticked items. Certain items start ticked;
 * uncertain ones start unticked and say so. Success is shown only after the
 * server confirms (non-negotiable 6).
 */
export function Composer({ scope, limits, placeholder }: { scope: DraftScope; limits: { maxFiles: number; maxFileBytes: number; imageMaxEdge: number }; placeholder: string }) {
  const [draft, setDraft] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const id = `composer-${scope.courseId ?? scope.studentId}`;

  function run(work: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  }

  function toggle(item: Preview["items"][number], on: boolean) {
    const next = new Set(selected);
    if (on) {
      // A change needs what it depends on.
      const add = (i: number) => {
        if (next.has(i)) return;
        next.add(i);
        draft?.items[i]?.dependsOn.forEach(add);
      };
      add(item.index);
    } else {
      // Nothing that depends on this change can stay ticked without it.
      const drop = (i: number) => {
        if (!next.has(i)) return;
        next.delete(i);
        draft?.items.filter((d) => d.dependsOn.includes(i)).forEach((d) => drop(d.index));
      };
      drop(item.index);
    }
    setSelected(next);
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Check each change. Only ticked changes are saved. Nothing has been saved yet.</p>
        {draft.items.length === 0 ? (
          <p className="text-sm text-text-muted">No changes found.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {draft.items.map((item) => (
              <li key={item.index} className="py-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={selected.has(item.index)} onChange={(e) => toggle(item, e.target.checked)} />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {item.title}
                      {!item.certain && <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">Check this one</span>}
                    </span>
                    <span className="block text-sm text-text-muted">{item.detail}</span>
                    <span className="block text-sm">{item.before !== null && item.before !== "" ? `${item.before} → ${item.after}` : item.after}</span>
                    {item.source && <span className="block text-xs text-text-muted">From: &ldquo;{item.source}&rdquo;</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {draft.notes.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Not placed. Enter these by hand if they matter:</p>
            <ul className="list-disc pl-5 text-text-muted">
              {draft.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {draft.items.length > 0 && (
            <button
              type="button"
              disabled={pending || selected.size === 0}
              className={buttonClass}
              onClick={() =>
                run(async () => {
                  const r = await confirmDraft(draft.draftId, [...selected]);
                  if (r.ok) {
                    setDraft(null);
                    setMessage(r.message ?? "Saved");
                    setFileNames([]);
                    formRef.current?.reset();
                  } else setError(r.error);
                })
              }
            >
              {pending ? "Saving..." : `Save selected (${selected.size})`}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClass}
            onClick={() =>
              run(async () => {
                const r = await discardDraft(draft.draftId);
                if (r.ok) setDraft(null);
                else setError(r.error);
              })
            }
          >
            Discard
          </button>
          {error && <span role="alert" className="text-sm text-error">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        run(async () => {
          const form = new FormData();
          form.set("text", String(new FormData(element).get("text") ?? ""));
          const input = element.querySelector<HTMLInputElement>('input[type="file"]');
          const files = [...(input?.files ?? [])];
          if (files.length > limits.maxFiles) {
            setError(`Attach at most ${limits.maxFiles} files at a time.`);
            return;
          }
          for (const file of files) {
            const prepared = await downscale(file, limits.imageMaxEdge);
            if (prepared.size > limits.maxFileBytes) {
              setError(`${file.name} is too large. Files can be up to ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB.`);
              return;
            }
            form.append("files", prepared, prepared.name);
          }
          const r = await draftChanges(scope, form);
          if (r.ok) {
            setDraft(r);
            setSelected(new Set(r.items.filter((i) => i.certain).map((i) => i.index)));
          } else setError(r.error);
        });
      }}
    >
      <label htmlFor={`${id}-text`} className="text-sm">
        {placeholder}
      </label>
      <textarea id={`${id}-text`} name="text" rows={4} className={`${inputClass} text-sm`} placeholder="Say what changed, or paste what to read from" />
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${secondaryButtonClass} cursor-pointer`}>
          Add a photo or file
          <input
            type="file"
            name="files"
            multiple
            accept="image/*,application/pdf,.pdf,.vtt,.srt,.txt,text/plain,text/vtt"
            className="sr-only"
            onChange={(e) => setFileNames([...(e.target.files ?? [])].map((f) => f.name))}
          />
        </label>
        {fileNames.length > 0 && <span className="text-sm text-text-muted">{fileNames.join(", ")}</span>}
      </div>
      <p className="text-xs text-text-muted">
        Notes, a course outline, a portal screenshot, or a Zoom transcript. Write the student number on notes, not the name. The student&apos;s name and email addresses are removed from text before it is sent.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Drafting. This can take a minute..." : "Draft changes"}
        </button>
        <span aria-live="polite" className="text-sm">
          {message && <span className="text-ok">{message}</span>}
          {error && <span role="alert" className="text-error">{error}</span>}
        </span>
      </div>
    </form>
  );
}

/**
 * A photo as a JPEG no larger than `maxEdge` on its longest side. Anything
 * that is not an image, or that the browser cannot decode, is sent as is.
 */
async function downscale(file: File, maxEdge: number): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000 && file.type !== "image/heic") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
