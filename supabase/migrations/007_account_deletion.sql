-- Ripple — migration 007: account-deletion cascade behavior + nightly aggregate refresh
--
-- Phase 5 item 1 (account deletion) deletes a user's auth.users row via the GoTrue admin API
-- (service role only, see delete-account Edge Function). profiles cascades from that
-- (on delete cascade, migration 001) — that's where all PII actually lives (display_name,
-- expo_push_token), so deleting it is the whole job. But per spec §13 Phase 5, the org keeps
-- the user's submissions, just with the attribution nulled out ("former member") rather than
-- deleted — that requires these FKs to move from their default NO ACTION/CASCADE to SET NULL.

-- submissions.user_id: was NOT NULL + implicit ON DELETE CASCADE (would have deleted the
-- org's own submissions right along with the departing member).
alter table submissions alter column user_id drop not null;
alter table submissions drop constraint submissions_user_id_fkey;
alter table submissions add constraint submissions_user_id_fkey
  foreign key (user_id) references profiles (id) on delete set null;

-- submissions.reviewed_by: nullable already, but implicit ON DELETE NO ACTION would block
-- deleting the account of anyone who has ever reviewed a submission.
alter table submissions drop constraint submissions_reviewed_by_fkey;
alter table submissions add constraint submissions_reviewed_by_fkey
  foreign key (reviewed_by) references profiles (id) on delete set null;

-- notifications.sent_by: was NOT NULL + implicit ON DELETE NO ACTION — same problem for any
-- admin who has ever composed a notification.
alter table notifications alter column sent_by drop not null;
alter table notifications drop constraint notifications_sent_by_fkey;
alter table notifications add constraint notifications_sent_by_fkey
  foreign key (sent_by) references profiles (id) on delete set null;

-- org_invites.created_by: nullable already, but implicit ON DELETE NO ACTION would block
-- deleting the account of whoever generated an invite code.
alter table org_invites drop constraint org_invites_created_by_fkey;
alter table org_invites add constraint org_invites_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- submissions_update_columns_guard (migration 001) locks every column except the review/AI
-- ones. Postgres fires row-level triggers for FK-cascaded SET NULL updates too, so without
-- this change the guard would reject the cascade's own "set user_id to null" update and abort
-- the whole account deletion. Carve out exactly that one transition — user_id going to NULL —
-- without opening the door to a submission being reassigned to a different user.
create or replace function enforce_submission_update_columns()
returns trigger
language plpgsql
as $$
declare
  old_row jsonb := to_jsonb(old) - 'review_status' - 'reviewed_by' - 'reviewer_note'
                    - 'ai_urgency' - 'ai_summary' - 'ai_flags' - 'user_id';
  new_row jsonb := to_jsonb(new) - 'review_status' - 'reviewed_by' - 'reviewer_note'
                    - 'ai_urgency' - 'ai_summary' - 'ai_flags' - 'user_id';
begin
  if old_row is distinct from new_row then
    raise exception
      'Only review_status, reviewed_by, reviewer_note, ai_urgency, ai_summary, ai_flags, and clearing user_id may be updated on submissions';
  end if;
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'submissions.user_id may only be cleared (set to null), never reassigned';
  end if;
  return new;
end;
$$;

-- Phase 5 item 3: nightly refresh of the PII-stripped aggregates matview (migration 001).
-- CONCURRENTLY avoids blocking reads against agg_daily_site_readings while it runs — legal
-- here because of the unique index (agg_daily_site_readings_mv_uq) migration 001 already
-- created on the matview.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'refresh-agg-daily-site-readings',
  '17 3 * * *',
  $$refresh materialized view concurrently agg_daily_site_readings_mv$$
);
