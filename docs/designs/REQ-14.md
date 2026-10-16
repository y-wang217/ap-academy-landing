# REQ-14: Encrypt nightly backups to a public key, not a shared passphrase

Notion card: https://app.notion.com/p/3f9d6ae73dd781ea8a1ac2cd35887233 (Risk: High, blocked by REQ-13, done).

Nightly backups are encrypted to a GPG public key held as the `BACKUP_PUBLIC_KEY`
secret, so nothing in GitHub can decrypt them; only the offline private key can restore.

## Acceptance criteria
- AC1: with `BACKUP_PUBLIC_KEY` set, `backup.sh <out>` leaves exactly one file, `apacademy-db-<stamp>.tar.gz.gpg`, with a `:pubkey enc packet:` and no `:symkey enc packet:`.
- AC2: with the key unset or empty, `backup.sh` exits non-zero and writes nothing, even if `BACKUP_PASSPHRASE` is set.
- AC3: `backup.sh` fails and writes nothing if the key holds secret material or is not exactly one primary public key.
- AC4: `backup.sh` and `restore.sh` use a temporary `GNUPGHOME` inside their work dir; the caller's keyring is untouched.
- AC5: `restore.sh` decrypts with `BACKUP_PRIVATE_KEY` + `BACKUP_PRIVATE_KEY_PASSPHRASE`; counts, samples and audit log match.
- AC6: `restore.sh` on a `.gpg` exits non-zero before touching the target if either variable is missing or the key is not the recipient.
- AC7: `manifest.txt` is unchanged (same lines, same order).
- AC8: `pnpm test:restore` generates its own throwaway keypair.
- AC9: `BACKUP_PASSPHRASE` and `--symmetric` appear nowhere in `scripts/` or `.github/workflows/`; `backup.yml` checks `SUPABASE_DB_URL` and `BACKUP_PUBLIC_KEY` and keeps skip-with-notice.
- AC10: `docs/RESTORE.md` covers keypair generation, where the private key lives (never GitHub/Vercel), the new restore command, and opening pre-switch archives.

## Approach
- `backup.sh`: require the key before `pg_dump`; temp `GNUPGHOME`; inspect with `--import-options show-only` (refuse `sec`/`ssb`, require exactly one `pub`); build the tarball in the work dir; `--trust-model always --recipient <fpr> --encrypt`; log `encrypted to <fpr>` on stderr.
- `restore.sh`: for `.gpg`, require both variables before any `psql`; temp `GNUPGHOME`; import the private key; decrypt with the passphrase on fd 3.
- `restore-drill.sh`: generate drill and "other" keypairs, run the AC1 to AC7 checks, assert the caller keyring stays empty.
- `.github/workflows/backup.yml`: blocked for the builder by the guard hook; the diff is in the PR body for a human to commit.
- Docs: `docs/RESTORE.md`, tracker ADR 0020 amendment, `apps/tracker/docs/PLAN.md` line 131.

Out of scope: moving backups off GitHub artifacts, retention, rotating the old passphrase, re-encrypting old artifacts, key rotation, multiple recipients, signing.
