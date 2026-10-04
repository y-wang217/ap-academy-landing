# 0011: AI produces draft change sets only (deferred to v1)
Status: accepted
Date: 2026-10-04

## Context
If AI writes straight to tables, one bad parse corrupts grades.

## Decision
Deferred to v1. When built, AI runs only in a server route that outputs a Zod-validated draft change set, which the teacher previews and confirms. Manual edits use the same change-set shape. Nothing is saved without confirmation; student names are stripped from prompts.

## Alternatives considered
- AI with write access: rejected outright.

## Consequences
Nothing in v0 depends on this.
