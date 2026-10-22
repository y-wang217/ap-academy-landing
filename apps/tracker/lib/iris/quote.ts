/**
 * The new part of a reply (REQ-43). Pure. Drops `>` lines and cuts at the
 * first Gmail "On ... wrote:" (one or two lines), an Outlook
 * "-----Original Message-----", or a From: line followed within 3 lines by
 * Sent: or Date:. A message that is all quote falls back to its first 2,000
 * characters, so the classifier always sees something.
 */
const FALLBACK_CHARS = 2000;

export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>/.test(line)) continue;
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*On\s.+/.test(line) && (/wrote:\s*$/.test(line) || /wrote:\s*$/.test(lines[i + 1] ?? ""))) break;
    if (/^\s*From:\s/.test(line) && lines.slice(i + 1, i + 4).some((l) => /^\s*(Sent|Date):\s/.test(l))) break;
    out.push(line);
  }
  const kept = out.join("\n").trim();
  return kept === "" ? text.slice(0, FALLBACK_CHARS) : kept;
}
