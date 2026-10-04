# 0019: The reference example is 96.4695 at full precision
Status: accepted
Date: 2026-10-04

## Context
The brief gives its reference example as 96.47%, "approximately 96.4709". Computed exactly, (30/32 + 41/42)/2 x 50 + (2.9/3) x 20 + 1 x 10, divided by 80, is 96.469494...

## Decision
The engine keeps full precision, and the test asserts the exact value 96.4694940... and the displayed 96.5 (1 decimal) and 96.47 (2 decimals). The brief's 96.4709 comes from rounding the intermediate category percentages.

## Alternatives considered
- Round intermediates to match 96.4709: violates "full precision, round only in the UI".

## Consequences
None. The displayed value matches the brief.
