-- Ripple — migration 005: admin invite generation (Phase 3)
--
-- Revoking an invite needs no new function — org_invites already has an admin-scoped
-- DELETE policy (migration 001). Creating one server-side (rather than letting the client
-- pick a code) avoids collisions and keeps code generation in one place.

create or replace function admin_create_invite(
  target_org_id uuid,
  invite_expires_at timestamptz default null,
  invite_max_uses int default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  attempt int := 0;
begin
  if not has_role(target_org_id, 'admin') then
    raise exception 'Only org admins can create invites';
  end if;

  loop
    new_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
    begin
      insert into org_invites (org_id, code, expires_at, max_uses, created_by)
      values (target_org_id, new_code, invite_expires_at, invite_max_uses, auth.uid());
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 5 then
        raise exception 'Could not generate a unique invite code, please retry';
      end if;
    end;
  end loop;

  return new_code;
end;
$$;

grant execute on function admin_create_invite(uuid, timestamptz, int) to authenticated;
