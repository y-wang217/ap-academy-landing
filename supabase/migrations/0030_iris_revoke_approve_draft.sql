-- Revoke iris.approve_draft (REQ-48 follow-up), under tracker ADR 0069.
--
-- 0028 kept approve_draft granted so the app deployed before REQ-48 could
-- still approve while 0028 was live and the card was not. The card is live
-- now and the tracker approves only through approve_draft_for_send, so an
-- approval always creates its send. Revoking the old path means a draft can
-- no longer be approved without one. The function stays; only its grant goes.
-- Tested by supabase/tests/iris_sends.sql.

revoke execute on function iris.approve_draft(uuid, integer) from authenticated;
