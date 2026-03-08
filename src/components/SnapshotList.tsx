import React from 'react';

export interface Snapshot {
  id: string;
  timestamp: string;
  openclawVersion: string;
  trigger: 'change' | 'manual' | 'startup';
  diffSummary: string;
  configHash: string;
  diffPatch: string;
  configSnapshot: Record<string, unknown>;
}

interface SnapshotListProps {
  snapshots: Snapshot[];
  onRestore: (snapshotId: string) => void;
}

export function SnapshotList({ snapshots, onRestore }: SnapshotListProps) {
  if (snapshots.length === 0) {
    return <p>No snapshots available.</p>;
  }

  return (
    <section aria-label="snapshot-list">
      {snapshots.map((snapshot) => (
        <article
          key={snapshot.id}
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div>{snapshot.id}</div>
          <div>{snapshot.openclawVersion}</div>
          <div>{snapshot.diffSummary}</div>
          <button type="button" onClick={() => onRestore(snapshot.id)}>
            Restore
          </button>
        </article>
      ))}
    </section>
  );
}

export default SnapshotList;
