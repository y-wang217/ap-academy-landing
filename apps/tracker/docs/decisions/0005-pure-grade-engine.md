# 0005: Pure, deterministic grade engine, normalized over scored categories
Status: accepted
Date: 2026-10-04

## Context
Grades are the product. A grade that silently changes because of a UI detail, a time zone or a missing category destroys trust.

## Decision
`lib/domain/grades.ts` imports nothing from React, Next or Supabase. It is deterministic and unit-tested. A course grade is the weighted mean of category percentages over the categories that have scores: sum(category_pct x weight) / sum(weights of scored categories). No scored categories returns null ("No grades yet"), never 0. Full precision is kept; rounding happens only in the UI, to 1 decimal place.

## Alternatives considered
- Treat empty categories as 0: punishes students for work that has not happened.
- Require all categories before showing a grade: a student would see nothing until the final exam.

## Consequences
Components never compute grades. A grade shown before all categories are scored is a current grade, labelled as such (UX rule).
