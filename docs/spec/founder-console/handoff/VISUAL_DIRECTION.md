# AP Academy // Command Bridge: Visual Direction

## Hero idea
"An eccentric founder captaining an education company from the bridge of a retro-futurist vessel." The visual feel sits between **In Other Waters** (honest, calm scientific instruments) and **Still There / Objects in Space / HighFleet** (tactile command consoles), using the owner's sunset-magenta-orange pixel-art reference as an atmospheric signature.

## Source files
- `../06_VISUAL_ASSETS/founder-command-bridge-reference.png`: the approved directional hero render; **not** a usable screenshot background because it contains baked UI text and fictional figures.
- `../06_VISUAL_ASSETS/numbered-panel-guide.jpg`: numbered feature regions for mapping to components.
- Detail crops: `sales-radar-detail.png`, `rolodex-detail.png`, `metric-panels-detail.png`, `physical-console-detail.png`.
- `../07_PREVIEW/index.html`: self-contained design exploration showing scalable HTML/SVG/CSS and fictional data (clearly labelled).
- `../07_PREVIEW/assets/bridge-skyline.svg`: separable, text-free decorative asset created for this handoff.

## Composition (desktop ~ 1440–1920 px)
A. Top cinematic horizon: 14–23% of height, panoramic orange sun and purple city with subtle framing, not a separate application function. Text-free responsive sky asset; safe to hide on small screens.
B. Strong header rail: `AP ACADEMY // FOUNDER CONSOLE`, mode switch Sales / Creation / Operations, authentic last-sync status and clock. No false "online" when services are failing.
C. Main focus: **Sales Radar and NEXT contact**; a larger Rolodex surface than secondary metrics. Gold/amber edge for the single suggested action.
D. Right/top: compact metrics and teacher capacity.
E. Below: due follow-ups, activity dispatch, exception signals, payment readouts. Panels reflow rather than shrinking text to illegibility.
F. Bottom "physical" rail: non-essential decorative trim, 3–6 meaningful status indicators, keyboard shortcuts help. No meaningless buttons.

## Design tokens (proposal, adjustable during implementation)
| Token | Value | Intended use |
|---|---|---|
| `--canvas` | `#100D18` | overall backdrop |
| `--surface` | `#1D1422` | instrument panel |
| `--surface-raised` | `#281926` | raised controls |
| `--border` | `#754454` | metal/glass edge |
| `--amber` | `#FFC078` | active focus and information |
| `--coral` | `#FF6B65` | urgent / strong actions |
| `--magenta` | `#E14E87` | secondary data series |
| `--cyan` | `#6FCDD2` | synced data / compare |
| `--green` | `#86D7A0` | verified healthy state, not default |
| `--muted` | `#BB9DAF` | supporting labels |
| `--text` | `#FFE8D1` | primary readable content |
| `--shadow-glow` | `0 0 22px #FF6B6533` | controlled glow |

Typography: restrained narrow display sans for headings + legible mono or tabular digits for readouts. Recommended CSS fallbacks `system-ui` and `ui-monospace`, no downloaded font files. Use reliable 12–16px minimum for secondary labels; no 7px sci-fi type for real data.

## Original composition translated into components
| # | Visual region | Production component | Truthful behavior |
|---|---|---|---|
| 01 | circular sales radar | `LeadRadar` + accessible `LeadStageTable` | represents stages/counts from records, no made-up "territories" |
| 02 | Rolodex queue | `NextLeadPanel` + `LeadQueue` | sorted from verifiable due/action records, one selected |
| 03 | trials and enrolments | `ConversionPanel` | computed cohort definition and linked evidence |
| 04 | teacher load | `TeacherCapacity` | confirmed hours and availability; unknown if no roster/availability |
| 05 | cashflow pulse | `FinancePulse` | verified payment records only; currency CAD |
| 06 | daily dispatch | `ActivityRail` | attributed source event + timestamp |
| 07 | follow-ups | `FollowUpQueue` | due time, owner, one clear next action |
| 08 | signals | `SignalList` | actionable exceptions, deduped, with dismiss/snooze provenance |
| 09 | lower cockpit rail | `SystemStatus` | real integration freshness and local controls |

## Interaction / motion
- Radar: gentle sweeping sector (8–12 seconds per pass), purely decorative; reduced-motion makes it static. Stage data and labels remain available in text.
- Incoming lead: short amber pulse no longer than 1.5 seconds; accompanied by screen-reader announce + textual "NEW" label; respects protected teaching blocks/quiet mode.
- Rolodex selection: subtle horizontal slide/focus shift (150–220 ms), never make user wait before calling.
- Chart: modest reveal when data arrives, not continuous random fluctuations.
- Hover/tactility: 1px edge lift and light reflection; keyboard focus more visible than hover.

## Mobile / accessibility
At <= 900 px, collapse skyline into a narrow strip and move NEXT lead above radar/metrics. At <= 640 px, single-column: action, top KPI, alerts, queue, remaining details; no sideways scroll, no fixed cockpit art obstructing form controls. Decorative gauges always have a table/list or accurate `aria-label` equivalent.

## Fidelity rule
This should look like a **crafted fictional command OS** with real business information, not a screenshot sliced into clickable rectangles and not a generic admin theme painted purple. Each module has a named reusable component, responsive sizing and data/empty/loading/error variants. Fidelity includes ambience, composition, rhythm, panel edges, typography, color hierarchy and motion, **not** false numbers or tiny illegible labels.

## External references (inspiration only; third-party art not licensed or bundled)
- In Other Waters screenshots: https://www.mobygames.com/game/143975/in-other-waters/screenshots/
- Still There screenshots: https://kotaku.com/games/still-there/gallery
- Retro Sci-Fi Terminal: https://ophidic.itch.io/retro-sci-fi-terminal
- HighFleet UI: https://store.steampowered.com/app/1434950/HighFleet/
- Objects in Space: https://store.steampowered.com/app/824070/Objects_in_Space/
