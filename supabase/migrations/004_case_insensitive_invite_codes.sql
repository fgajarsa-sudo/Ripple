-- Ripple — migration 004: case-insensitive invite code redemption
--
-- Found via live TestFlight testing: redeem_org_invite() did an exact-case match on `code`,
-- so a code stored as 'TESTJOIN' silently rejected 'testjoin' with "Invalid invite code" —
-- easy to hit from autocorrect/keyboard behavior despite the client's
-- autoCapitalize="characters" hint (that only affects the on-screen keyboard, not a hard
-- transform of what actually gets typed/pasted). Fixed here so it's robust regardless of
-- the client; the client is also being updated to normalize to uppercase before sending.

create or replace function redeem_org_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite org_invites%rowtype;
begin
  select * into invite from org_invites where upper(code) = upper(invite_code) for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;
  if invite.expires_at is not null and invite.expires_at < now() then
    raise exception 'Invite code has expired';
  end if;
  if invite.max_uses is not null and invite.use_count >= invite.max_uses then
    raise exception 'Invite code has reached its use limit';
  end if;

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), invite.org_id, 'member', 'active');

  update org_invites set use_count = use_count + 1 where id = invite.id;
end;
$$;
