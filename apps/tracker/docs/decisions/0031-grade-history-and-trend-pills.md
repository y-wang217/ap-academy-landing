# 0031: Grade history is replayed on the assessment date; the pill follows four rules
Status: accepted
Date: 2026-10-06
## Context
The step 10 dashboard shows each top-6 course as a grade-over-time line against its target, with a status pill. Nothing was stored per day, and the only timestamp on a mark is the entry stamp, which the owner ruled out for anything a student sees (ADR 0030).
## Decision
- `lib/domain/history.ts` rebuilds the grade on each date that has a scored mark by running the grade engine over the marks held or due by that date. Every point is reproducible from the rows; nothing is cached. An undated mark counts at every point, so the last point always equals the headline grade.
- `lib/domain/trend.ts` applies the owner's rules in order: no marks is "No grades yet"; a course `focusGapPoints` (2) or more below its target is "Needs focus", whatever its direction; otherwise a rise of `trendRisePoints` (1) or more between the latest point and the point `trendWindowMarks` (3) dated marks earlier is "Improving"; anything else is "Stable". The focus threshold deliberately equals the teacher's suggestion threshold.
- The dashboard lists every course in the six-course plan, whatever its status, since every one of them moves the average. Active courses outside the plan are listed separately without a chart.
- The chart is inline SVG with no library. One series per chart, so the pill is the legend; the grade number stays in text ink and only the line and dots wear the tone. Each dot has a 24px hit target and the same reveal on keyboard focus as on tap. The three tones come from the app palette: green for a rise, amber for a gap, neutral otherwise; red stays for errors.
## Alternatives considered
- Storing a grade snapshot per day: a stale cache is a correctness bug (ADR 0009).
- Plotting on the entry stamp: one onboarding sitting collapses weeks of marks onto one day.
- A chart library: a dependency needs an ADR and brings its own palette and fonts; the chart here is one line and a few dots.
- The mock's blue, teal and red: red is reserved for errors in this app, and the owner chose the app palette.
## Consequences
A course whose marks are all undated shows "No grades yet" on the chart while its headline grade still shows; the teacher sees a "No date" notice on those rows. The window is in dated marks, not days, so a course with three marks in one week and none since reads "Stable" once the rise is outside the window.
