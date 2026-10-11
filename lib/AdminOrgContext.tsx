import { createContext, useContext, type ReactNode } from 'react';

type AdminOrg = {
  orgId: string;
  orgName: string;
  isPersonal: boolean;
};

const AdminOrgContext = createContext<AdminOrg | null>(null);

export function AdminOrgProvider({ value, children }: { value: AdminOrg; children: ReactNode }) {
  return <AdminOrgContext.Provider value={value}>{children}</AdminOrgContext.Provider>;
}

// Admin screens read the active org from here rather than calling useMembership() directly —
// useMembership() only ever returns one "primary" org, which can't represent a user who needs
// to manage thresholds for both their real group and their personal collection. The admin
// layout resolves which org is active (via an explicit org id param, defaulting to the
// primary membership) and provides it here once, so every admin screen stays in sync.
export function useAdminOrg(): AdminOrg {
  const ctx = useContext(AdminOrgContext);
  if (!ctx) {
    throw new Error('useAdminOrg() must be used within the (admin) route group');
  }
  return ctx;
}
