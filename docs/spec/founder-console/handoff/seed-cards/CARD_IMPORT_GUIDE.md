# Seed-to-real-Notion import guide

1. Read `../00_START_HERE/PASTE_INTO_CLAUDE_CODE.md` first.
2. Discover existing Notion Dev Requirements schema from current `.claude/pipeline.json`; do not assume property option spellings (`Risk`, `Priority`, etc.) are unchanged. Check existing cards first to avoid duplicates.
3. Create/update only missing cards from `cards.json` (or the matching human-readable `FC-*.md`), let the board assign real `REQ-N` IDs. Copy the seed ACs and scope to the page body. Set *status* to Ready if all blockers are done, otherwise Backlog. Translate each `blocked_by_seed_ids` to real card relation `Blocked by`.
4. Preserve pipeline control state and WIP. Design is written by existing designer into Notion using `docs/designs/_TEMPLATE.md`; after approval builder copies it to `docs/designs/REQ-N.md`. These seed documents are NOT already approved designs.
5. Keep FC→REQ mapping and any superseded/merged cards in intake receipt. If Notion cannot be reached, stop at preparation and explain blocker, do not create unsynchronized filesystem tasks instead.

The separate "setter/trial UI cards" in `/ops/setter` and `/ops/trials` are NOT the Dev Requirements cards. Do not confuse the two concepts.
