# 0028: AI intake reads photos, PDFs, transcripts and instructions; notes carry a student number, not a name
Status: accepted
Date: 2026-10-05

## Context
Step 8 built AI drafting as a text box on one course (ADR 0026). The owner's
intake is a photo of their own trial-lesson notes, a course outline, a portal
screenshot, or the transcript of a recorded trial lesson, and the way they want
to change data is to say what changed ([`spec/build-step-9.md`](../spec/build-step-9.md)).
Two things in ADR 0026 stood in the way: the input was text only, and the
privacy rule (strip the student's name before the text leaves) cannot be
applied to pixels.

## Decision
- **Sources.** A draft request carries one text field and up to
  `TUNING.aiMaxFiles` attachments. The text is either material to read (a
  paste, a transcript) or an instruction ("move the physics test to Friday,
  she got 38 out of 42"), or both; the model is told to treat it as whichever
  it is. Attachments are images (JPEG, PNG, WebP, GIF), PDFs, or transcript
  files (`.vtt`, `.srt`, `.txt`). Transcript files are reduced to their words
  on the server (`lib/ai/transcript.ts`): cue numbers, timestamps and speaker
  labels are dropped before the name strip runs. Images are downscaled in the
  browser to the longest edge the API uses, so a phone photo is a few hundred
  kilobytes, not several megabytes.
- **Budget.** The text cap is `TUNING.aiMaxTextChars`, sized for a 90-minute
  transcript. Files are capped by count and by bytes (`TUNING.aiMaxFileBytes`),
  and the server action body limit is raised to match. Tokens spent are
  recorded per draft in `tracker.ai_drafts`, as before; the daily per-org
  draft limit stands. A token count call before each draft was considered and
  rejected: it is a second round trip for a limit that bytes and characters
  already hold.
- **Names.** The text strip from ADR 0026 stands and now also runs on
  transcript words. Images and PDFs are not scanned. The rule that keeps names
  out of them is an operating procedure, not code: every student has a
  **student number** (`tracker.students.student_number`, assigned per org on
  insert, shown on the teacher's screens as `S-0012`), and notes written
  during a trial lesson carry that number, never the name. The owner writes
  the notes, so the rule is theirs to keep. A first name that does slip into
  a photo reaches Anthropic's API; the owner accepted that on 2026-10-05.
- **Transcripts.** The procedure is a recorded trial lesson with Zoom's
  transcript saved. Zoom display names are speaker labels and are dropped
  with the labels. The student's own first name in the spoken words is caught
  by the strip; other people's names in the words are not.
- **ADR 0026** stays in force for the provider, the model, the off-by-default
  rule and the draft record. Its **Privacy** and **Limits** bullets are
  superseded by this ADR.

## Alternatives considered
- Scrub names out of images before sending: no reliable way to do it, and a
  failed scrub is worse than a known rule.
- Require the teacher to crop names out: costs the convenience the feature
  exists for.
- Audio upload and transcription: a second service and a second ADR. Zoom's
  transcript is enough for now.

## Consequences
- Migration `0007_tracker_intake` adds the student number and lets a draft
  record stand without a course. Apply with sign-off (workspace rule).
- The privacy policy line for AI drafting now covers photos and transcripts.
- Cost per draft rises with images; the per-org daily limit is the brake.
