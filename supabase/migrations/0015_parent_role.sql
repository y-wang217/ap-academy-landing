-- REQ-22 (Parent 1/4): the parent role. Its own file because Postgres refuses
-- to use a new enum value in the transaction that added it, and apply_migration
-- runs each file as one transaction. 0016_parent_links.sql uses the value only
-- inside plpgsql bodies.

alter type tracker.membership_role add value if not exists 'parent';
