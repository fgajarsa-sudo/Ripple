import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useSession } from './SessionProvider';

export type Membership = {
  id: string;
  org_id: string;
  role: 'admin' | 'reviewer' | 'member';
  organizations: {
    name: string;
    waterbody_name: string | null;
    is_platform_org: boolean;
    is_personal: boolean;
  } | null;
};

// A user can now have up to two simultaneous active memberships: one real conservation group
// plus a personal independent-collection org (migration 010). Home/Submit/History still only
// show one "default" context at a time — the real group always wins when both exist, since
// that's the richer, more social context; the personal collection is the fallback when it's
// the only membership. Anywhere both need to be reachable at once (the admin section, so a
// user can set thresholds for either), use useMemberships() instead and let the admin layout
// resolve which one is active via an explicit org id rather than this single-value guess.
export function useMembership() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['membership', userId],
    queryFn: async (): Promise<Membership | null> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, org_id, role, organizations(name, waterbody_name, is_platform_org, is_personal)')
        .eq('status', 'active');
      if (error) throw error;

      const memberships = (data ?? []) as unknown as Membership[];
      if (memberships.length === 0) return null;

      const realGroup = memberships.find((m) => !m.organizations?.is_personal);
      return realGroup ?? memberships[0];
    },
    enabled: !!userId,
  });
}
