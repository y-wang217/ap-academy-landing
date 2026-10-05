/**
 * A transcript reduced to its words (ADR 0028). Zoom and most meeting tools
 * export WebVTT or SRT: cue numbers, timestamps and "Speaker Name:" labels,
 * then the spoken line. The model needs the lines; the labels are display
 * names and are dropped before the name strip runs. Pure.
 */

const TIMESTAMP = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s+-->\s+(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}/;
const CUE_NUMBER = /^\s*\d+\s*$/;
const HEADER = /^(WEBVTT|NOTE|STYLE|REGION|Kind:|Language:)/;
/** "Jane Doe: hello" or "<v Jane Doe>hello" (VTT voice tag). */
const SPEAKER = /^\s*(?:<v\s+[^>]*>|[^:\n<>]{1,60}:\s+)/;

export const TRANSCRIPT_EXTENSIONS = [".vtt", ".srt", ".txt"] as const;

export function isTranscriptName(name: string): boolean {
  const lower = name.toLowerCase();
  return TRANSCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The words of a transcript, one spoken line per line, repeats collapsed. */
export function transcriptWords(raw: string): string {
  const lines: string[] = [];
  let inHeaderBlock = false;
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (HEADER.test(line)) {
      inHeaderBlock = line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION");
      continue;
    }
    if (inHeaderBlock) {
      if (line.trim() === "") inHeaderBlock = false;
      continue;
    }
    if (line.trim() === "" || CUE_NUMBER.test(line) || TIMESTAMP.test(line)) continue;
    const words = line.replace(SPEAKER, "").replace(/<\/?[^>]+>/g, "").trim();
    if (words.length === 0) continue;
    // Live captions repeat a cue as it grows; keep the last full line only.
    if (lines.length > 0 && words.startsWith(lines[lines.length - 1])) lines[lines.length - 1] = words;
    else if (lines.length === 0 || lines[lines.length - 1] !== words) lines.push(words);
  }
  return lines.join("\n");
}
