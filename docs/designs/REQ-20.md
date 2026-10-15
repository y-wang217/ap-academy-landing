# Design: REQ-20: Greet teachers by name in the daily texts

Copied from the Notion card (https://app.notion.com/p/3fad6ae73dd7811f9be2f46e4f5dac3f). Risk: Low.

**Summary:** The copy-ready daily texts greet a teacher by the name the Staff database uses, so "Mr. Charlie" gets "Hi Mr. Charlie," and not "Hi Mr.,".

## Acceptance criteria
- AC1: "Mr. Charlie" gives `Hi Mr. Charlie, ` in both message shapes.
- AC2: A leading honorific (Mr, Ms, Mrs, Dr, Miss, Mx, Prof; any case; optional dot) plus the next word is the greeting; "Mr. Charlie Wang" gives "Mr. Charlie".
- AC3: No honorific greets by the first word; existing tests pass unchanged.
- AC4: Single-word names, a lone honorific ("Mr."), extra spaces, and look-alikes ("Drew", "Mrsomething") behave as listed in the tests.
- AC5: The fingerprint formula is unchanged.
- AC6: Only the greeting changes.

## Approach
Export a pure `greetingName(name)` from `apps/tracker/lib/domain/schedule/daily-texts.ts` and use it for `first`. Unit tests in `daily-texts.test.ts`. ADR in `apps/tracker/docs/decisions/` (0043; 0042 was taken by REQ-16). No migration, no e2e.

## Deploy-day Resend label
The fingerprint hashes the copy text, so blocks already ticked on the deploy day get one false "Resend" label. Accepted (default a): it lasts one date and hashing only the schedule lines would not avoid it.
