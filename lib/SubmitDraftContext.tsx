import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { SensorReadings } from './readings';

export type SubmitDraft = {
  orgId: string | null; // which of the user's active orgs this submission is for — set once
  // at the start of the flow (Home), before location/photo/data steps begin.
  orgName: string | null;
  lat: number | null;
  lng: number | null;
  siteId: string | null;
  siteName: string | null;
  capturedAt: string; // ISO timestamp, set once when the location step loads
  weather: string | null;
  photoUri: string | null;
  readings: SensorReadings;
  notes: string;
};

function emptyDraft(): SubmitDraft {
  return {
    orgId: null,
    orgName: null,
    lat: null,
    lng: null,
    siteId: null,
    siteName: null,
    capturedAt: new Date().toISOString(),
    weather: null,
    photoUri: null,
    readings: {},
    notes: '',
  };
}

type SubmitDraftContextValue = {
  draft: SubmitDraft;
  updateDraft: (patch: Partial<SubmitDraft>) => void;
  resetDraft: () => void;
};

const SubmitDraftContext = createContext<SubmitDraftContextValue | null>(null);

export function SubmitDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<SubmitDraft>(emptyDraft);

  const value = useMemo<SubmitDraftContextValue>(
    () => ({
      draft,
      updateDraft: (patch) => setDraft((prev) => ({ ...prev, ...patch })),
      resetDraft: () => setDraft(emptyDraft()),
    }),
    [draft]
  );

  return <SubmitDraftContext.Provider value={value}>{children}</SubmitDraftContext.Provider>;
}

export function useSubmitDraft() {
  const ctx = useContext(SubmitDraftContext);
  if (!ctx) {
    throw new Error('useSubmitDraft must be used within a SubmitDraftProvider');
  }
  return ctx;
}
