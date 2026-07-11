import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useSession } from './SessionProvider';

export type Membership = {
  id: string;
  org_id: string;
  role: 'admin' | 'reviewer' | 'member';
  organizations: { name: string; waterbody_name: string | null } | null;
};

export function useMembership() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['membership', userId],
    queryFn: async (): Promise<Membership | null> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, org_id, role, organizations(name, waterbody_name)')
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Membership | null;
    },
    enabled: !!userId,
  });
}
