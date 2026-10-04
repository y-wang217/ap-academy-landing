# 0016: Invite is a prefilled email from the teacher; the login is claimed by email
Status: accepted
Date: 2026-10-04

## Context
"Publish ... sends invite." Sending email from the app needs either the Supabase service-role key on the server or a new email service. A magic link sent server-side on the student's behalf fails, because the PKCE code verifier is stored in the teacher's browser, not the student's.

## Decision
Publishing sets `published_at` and shows the teacher a ready-to-send invite: a `mailto:` link with the message filled in, plus the text to copy. The student signs in at www.apacademy.ca/tracker with that email. On first load the tracker calls `tracker.claim_student_invites()`, which links unclaimed, published student records whose email matches the verified login email, and adds a student membership.

## Alternatives considered
- `auth.admin.inviteUserByEmail`: needs the service-role key in the app.
- A transactional email provider: a new service and a new secret, for a few invites a month.

## Consequences
Revisit when invites become frequent; the claim function stays the same either way.
