# 0046: A parent's email is the only new personal field
Status: accepted
Date: 2026-10-16

## Context
ADR 0012 limits personal data to a student's first name, last initial, grade level and email. Parent accounts need a way to recognise the parent.

## Decision
- **Extends ADR 0012.** The one new field is the parent's email, stored lower-cased in `tracker.parent_links` and compared with the verified magic-link address. No parent name, phone or address is stored.
- **What a parent can read about a child** is the child's first name, last initial and published flag through `tracker.my_children()`, plus the rows named in ADR 0045. They never see the student's email or any other child.
- **The Notion link is an ID, not data.** `students.notion_student_id` holds the Students & Parents page ID so later cards can look the child up; nothing is copied from Notion.
- **Removal is real.** `remove_parent_link` deletes the row; the audit log keeps the before image.

## Consequences
- The privacy policy does not change in this card because the parent is told by the owner and signs in with their own address. Revisit if parents are ever invited by the app.
