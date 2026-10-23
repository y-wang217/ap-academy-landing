# 0078: Iris sends a reply type on its own only behind two switches, with fail-safes
Status: accepted
Date: 2026-10-23

## Context
Iris 4/9 to 8/9 built drafting, the approval queue, the eval harness (ADR 0074), the readiness card and sending after Approve (ADR 0069). Every reply still waited for Charlie. Founder decision 5 says a reply type Charlie approved unedited 20 times in a row, and that passed the eval gate (spec 6.4, decision 21), may send on its own, behind a per-type switch and one global switch, both off by default (decision 19 quiet hours, decision 13 automated line, decision 20 fail-safes). An email cannot be taken back, and until this card the owner could switch `iris.reply_types.auto_send_enabled` with a direct PostgREST update and no gate check at all.

## Decision
- **Two switches, both off.** `iris.settings.sending_enabled` (Sending enabled) is the global switch; turning it on needs a confirm tick. Each reply type has `auto_send_enabled`. Nothing is switched on by a deploy.
- **The switch goes through the gate.** Migration 0031 revokes the owner's column grant on `auto_send_enabled`. The only way to switch a type is `iris.set_auto_send`, owner only. The route `POST /api/iris/reply-types/[type]/auto-send` first runs the full TS gate (`evaluateGate` over the latest recorded eval run, policy and model), then calls `set_auto_send`, which enforces the floor again in SQL: off the never list, and an unedited streak of 20 at the current policy version. A never-list type never shows a switch and is refused with 422. Switching off always succeeds.
- **The gate in the run.** After drafting and before the phone backup, each draft whose message ended drafted is checked: not paused, Sending on, the type on, not on the never list, message drafted (not needs Charlie), one intent, no flags, confidence at or above the threshold, one student where the intent is child-scoped, the draft's policy equal to the streak's, and an unedited version 1 by Iris. A failure writes one `auto_send_skipped` event naming every failing condition. A pass calls `iris.auto_approve_draft` (service_role only), which re-checks the switches and the draft under the message lock, approves with `approval_mode = 'auto'` and creates one `mode = 'auto'` send with 0 attempts. Auto approvals never count in the streak or the totals.
- **Quiet hours.** Between `quiet_start` and `quiet_end` (21:00 to 07:00 America/Toronto, wrapping midnight, DST-safe through `localToUtc`) the send's `lease_until` is the next 07:00, so `claim_send` answers busy until then and the first run at or after 07:00 sends it. By day the run sends it at once. Manual approvals are unaffected.
- **The automated line** is appended by code after the signature for `mode = 'auto'` only. It is not policy text, so `POLICY_VERSION` stays 5.
- **Three fail-safes.** An edit or reject of a draft of an enabled type switches it off (`edited_after_enable`) and resets the streak, inside `iris.count_review`. A failed auto send switches its type off (`send_failed`) and keeps the streak, inside `iris.mark_send_failed`. A changed `POLICY_VERSION` switches every type off and restarts every streak at the next run (`iris.reset_for_policy`, `policy_changed`, idempotent). Each writes an `auto_send_disabled` event; the audit trigger on `reply_types` records every switch change.
- **Withdrawn.** A held auto send whose type or Sending switch is off by the time it is claimed is withdrawn: the send row is removed (0 attempts, nothing sent), the draft and message go back to the manual queue, and `claim_send` answers `withdrawn`. Paused leaves it waiting. This is how Charlie stops one 07:00 send.

## Alternatives considered
- **Mirror the whole gate in SQL**, eval numbers included: rejected. The eval scores live in JSON on `eval_runs` and the TS gate already owns them; SQL enforces only the floor that a direct call could skip.
- **Keep the raw column grant** and trust the UI: rejected. A crafted PATCH could switch a type on with no gate and no `enabled_at` or `enabled_by`.
- **A `sends.send_after` column** for quiet hours: rejected. `lease_until` already makes `claim_send` and the stuck-send list wait; `drafts.send_after` records the time for display.
- **Send a held reply anyway, or fail it, when its switch went off**: rejected. Charlie turning a type off means "not without me", so it goes back to his queue.
- **Count auto approvals in the streak**: rejected. Only Charlie's own reviews build or break it.

## Consequences
- Parent email can now go out with no person in the loop. Charlie decides per type, and each fail-safe hands control back to him.
- The SQL keeps its own copies of the never list and the streak of 20; a scan test pins them to `NEVER_AUTO_SEND` and `TUNING.irisAutoSendStreak`.
- The Agent Playbook's level 5 rule needs the one-line amendment in the REQ-49 design; Charlie pastes it.
- Revisit if a type needs auto-send by day only, if quiet hours should move from the UI, or if the eval gate should be re-checked on every run rather than at switch time.
