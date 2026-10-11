import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useSession } from './SessionProvider';
import type { Membership } from './useMembership';

// Unlike useMembership() (which collapses to one "primary" context for the main app screens),
// this returns every active membership — needed anywhere a user might have to pick between
// their real group and their personal collection, both of which can now have admin-level
// thresholds worth setting independently (migration 010).
export function useMemberships() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['memberships', userId],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, org_id, role, organizations(name, waterbody_name, is_platform_org, is_personal)')
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
    enabled: !!userId,
  });
}
