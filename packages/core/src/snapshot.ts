export interface Snapshot {
  id: string;
  timestamp: string;
  openclawVersion: string;
  trigger: 'change' | 'corrupt' | 'manual' | 'pre-upgrade';
  configHash: string;
  diffSummary: string;
  diffPatch: string;
  configSnapshot: unknown;
}

export const snapshotStore = {
  create: async (_reason: string): Promise<Snapshot> => {
    throw new Error('TODO: ALA-411');
  },
  list: async (): Promise<Snapshot[]> => [],
  get: async (_id: string): Promise<Snapshot | null> => null,
  restore: async (_id: string): Promise<void> => {},
  diff: async (_id1: string, _id2: string): Promise<string> => '',
};
