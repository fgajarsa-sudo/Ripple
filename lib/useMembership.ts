import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useSession } from './SessionProvider';

export type Membership = {
  id: string;
  org_id: string;
  role: 'admin' | 'reviewer' | 'member';
  organizations: { name: string; waterbody_name: string | null; is_platform_org: boolean } | null;
};

// A user can now have up to two simultaneous active memberships: one real conservation group
// plus Independent Observers (migration 009). The app still only shows one "active" context
// at a time (Home, Submit, Admin, etc. all assume a single org) — the real group always wins
// when both exist, since that's the richer context (admin surface, group alerts, thresholds);
// Independent Observers is the fallback when it's the only membership. Surfacing both at once
// (a true context switcher) wasn't in scope for this launch.
export function useMembership() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['membership', userId],
    queryFn: async (): Promise<Membership | null> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, org_id, role, organizations(name, waterbody_name, is_platform_org)')
        .eq('status', 'active');
      if (error) throw error;

      const memberships = (data ?? []) as unknown as Membership[];
      if (memberships.length === 0) return null;

      const realGroup = memberships.find((m) => !m.organizations?.is_platform_org);
      return realGroup ?? memberships[0];
    },
    enabled: !!userId,
  });
}
