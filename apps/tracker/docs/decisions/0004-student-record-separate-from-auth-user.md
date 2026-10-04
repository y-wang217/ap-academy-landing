# 0004: Student record separate from the auth user
Status: accepted
Date: 2026-10-04

## Context
A teacher sets up a student before the student has ever signed in. Parents and siblings may need access later.

## Decision
`tracker.students` is its own table with a nullable `user_id`. The record exists from setup; the login is linked when the student first signs in with the invited email (0016).

## Alternatives considered
- The auth user as the student record: forces an account before setup and makes guardians awkward.

## Consequences
Adding guardians later is a new `student_guardians` table plus a read-only role, not a rewrite.
