# 0018: Syllabus editing after publish is deferred
Status: superseded by 0030
Date: 2026-10-04

## Context
A post-publish weight change needs a new syllabus version, with categories copied and assessments remapped, all in one transaction.

## Decision
v0 edits categories freely while a student is in setup. Publishing confirms version 1 (`confirmed_by`, `confirmed_at`). After publish, weights are read-only in the UI. The schema already supports further versions.

## Alternatives considered
- Edit version 1 in place after publish: rewrites history without a trace.

## Consequences
Build "new syllabus version" when a real student's school changes a syllabus mid-term.
