Tracker: parent views
Recorded verbatim (2026-10-16) before any work began. The owner asked for three parent-facing cards on the Dev Requirements board (calendar, invoice and credit, grades), then for a design prompt that sets the UI skeleton and gets a visual from another AI, in the existing styles. The prompt below went out with `build-step-10-mock.webp` attached. The seven mocks that came back are in `parent-views/`.

---

Lets put some parent facing ui on the board
Cards for calendar view
Invoice/credit view
And tracker view (grades)

---

Wait make the design actually look like a good dashboard. I remember we had a design session which provided good examples

Give me a prompt that sets the skeleton of the ui and uses a visual from chatgpt to find the best usable version that still follows our existing styles

---

The prompt, as sent:

You designed the AP Academy student dashboard mock I'm attaching (Sam L., six course sparklines). We shipped it. Now I need the same treatment for three parent-facing screens in the same app. Same product, same visual system, new audience: a parent checking on their child in under a minute on a phone.

## Hard constraints (the mock must map onto existing code)

Palette. Use these exact tokens, nothing else. Your first mock used blue/teal/red; we remapped those to green/neutral/amber when building. This time design in the real palette:
- background #FBEFE8 (page), surface #FFFBF6 (cards)
- text #221C17, muted text #6E655B
- accent #D2502A (primary buttons, links). Used sparingly.
- border rgba(193,77,43,0.16)
- ok #2F6F4A on #E4F1E8, warn #8A5300 on #FBEFD5, error #A3271B on #FBE3DF
- No other hues. No gradients, no shadows, no illustrations, no icons unless a plain glyph is unavoidable.

Shapes and type. System sans-serif. Cards are rounded-2xl (16px) with a 1px border on surface, 16px padding, 12px gap inside, 16px gap between cards. Pills are rounded-full, 12px semibold text, tinted background from the ok/warn/neutral set. Primary buttons are rounded-full accent fill with light text; secondary are rounded-full bordered surface. Big numbers: 36px semibold. Labels: 14px muted. Footnotes: 12px muted. Max content width 720px, 16px side gutter. Everything designed at 375px first; show the 375px version.

Copy. Plain, short, factual. No exclamation marks, no em-dashes, no motivational language, no admission likelihood language ("on track for Waterloo" is not allowed; "1.8 below target" is). Wherever a grade appears, the footer line "Current grades are calculated based on existing marked grades." must be present.

Reuse the attached mock's parts where they fit: the header strip (name / target / big number), the per-course row (label + pill, sparkline with dashed target line, number on the right), the "Next priority / Upcoming" split at the bottom.

## The three screens

Shell shared by all three: a top bar ("AP Academy", parent's email, Sign out), a child switcher only when the parent has more than one child (a row of pills with first names), then three tabs: Grades, Calendar, Billing. Tabs sit under the top bar, not at the bottom.

1. Grades (parent view of the attached dashboard)
Same data as the student dashboard, read-only: target program and target average, average of graded courses with gap to target, one row per course with the pill (Improving / Stable / Needs focus / No grades yet), sparkline against target, current grade, "% marked". No Done buttons, no tap-to-reveal hint. Add one thing a parent wants that a student doesn't: a compact "Recent marks" list under the courses (last 5 scored items across courses: date, course code, title, score as earned/possible and %). Then "Next priority" and "Upcoming" as in the attached mock.

2. Calendar
Month view of the child's tutoring classes. Each class is a block on its day showing time, course code and teacher first name. Colour by course using only tints of the palette (background/surface/ok-bg/warn-bg with text ink), never a per-course hue. States a parent must read at a glance: scheduled, cancelled (struck through, muted), moved (small "moved from Tue 5:30" note), makeup (a "Makeup" pill). Above the grid: month switcher (previous / month name / next) and a one-line summary "8 classes this month · 2 done · 6 upcoming". Below the grid: a plain list of this week's classes for the phone, since a month grid at 375px is cramped; show how the grid degrades at 375px (dots per day, tap to see the day's list) versus 720px (full blocks).

3. Billing
Top: this month's position in one card: "October invoice" with amount, issued date, due date, and a status pill (Paid / Due / Overdue). If there are open credits, a second line "Credit applied: -$60 (missed Oct 3 MHF4U)". Then "Credits" card: a list of credit rows with date, course, hours, amount, and a status pill (Open / Applied / Made up / Forfeited), with the open total at the top. Then "Past invoices": a list of months, amount, status, each a row that opens the PDF. Rate line at the bottom: "Rate: $60/h · 2h/week". No payment buttons; we invoice by email and take e-transfer. Nothing here is interactive except opening a PDF.

## What I want back

Step 1: Before drawing, write the skeleton for each screen as an ordered list of sections, each with the fields it shows and its empty state (no grades yet, no classes this month, no invoices yet). Keep it to one screen of text.

Step 2: Render three visual variants of the Billing screen only, at 375px, each exploring a different hierarchy (A: this month's number dominates; B: list-first, everything is rows; C: a two-column summary strip like the dashboard header, then lists). Say in one line each which you'd pick and why.

Step 3: Take the strongest variant's hierarchy and render all three screens at 375px in that style, plus the Calendar at 720px. One image per screen, same fidelity as the attached mock. Real-looking sample data: one child, "Sam L.", Grade 12, six courses, October 2026, $60/h, two classes a week.

Do not add features beyond what's listed. If something in the brief conflicts with the constraints, keep the constraints and tell me.

---

What came back (2026-10-16), in `parent-views/`:

| file | what |
|---|---|
| `billing-variant-a.webp` | Billing, the number dominates |
| `billing-variant-b.webp` | Billing, list first |
| `billing-variant-c.webp` | Billing, dashboard-style summary strip. Chosen. |
| `grades-375.webp` | Grades tab at 375px |
| `calendar-375.webp` | Calendar tab at 375px: dots per day, tap for the day, This week list |
| `billing-375.webp` | Billing tab at 375px, variant C with the child header |
| `calendar-720.webp` | Calendar tab at 720px: full blocks |

Three corrections the designer applies; the mocks are not resent:

1. Calendar, 375px: the dots use a different colour per course. Dots carry state (scheduled, moved, cancelled), the same tones as the 720px blocks and the week list. Never a per-course hue.
2. Billing: the sample data nets the Oct 3 credit off the October invoice. Under the ops rule (OPS SYSTEM, "Missed sessions and credits", 2026-10-15) an Open credit nets off the next invoice. The design shows it on November.
3. Grades: the line under the numbers repeats "Average of 4 graded courses. 1.8 below target." That slot is the story line (ADR 0032), not a restatement.

---

Amendment 2026-10-17 (REQ-31, tracker ADR 0051). The text above is kept as written. Since REQ-31 the Calendar summary reads "N classes this month · P past · U upcoming" (past, not done: it only says the end time has passed), and a one-off class shows the purpose the owner declared (Makeup, Trial or Extra, or "Class" when none is set) instead of always "Makeup". A makeup that names the class it replaces shows "Makeup for Tue Oct 13".
