# 0043: The daily text greets a teacher by honorific and name
Status: accepted
Date: 2026-10-15

## Context
Staff names start with an honorific ("Mr. Charlie"). The daily text took the first word as the first name, so every greeting read "Hi Mr., ...".

## Decision
- `greetingName` in `lib/domain/schedule/daily-texts.ts`: when the first word is Mr, Ms, Mrs, Dr, Miss, Mx or Prof (any case, optional dot) and a second word exists, the greeting is those two words as written. Otherwise it is the first word.
- The fingerprint keeps hashing the copy text, so a template change still rewrites the block Charlie copies from.

## Consequences
- On the day this ships, blocks already ticked get one false "Resend: schedule changed after you texted" label at the next hourly refresh. It lasts that one date. Hashing only the schedule lines would not avoid it, and a migration to split the hashes is out of proportion.
- "Mr.Charlie" (no space) is one word and greets as written; fix it in the Staff data.
