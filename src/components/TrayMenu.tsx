import React from 'react';
import { StatusLight, type Status } from './StatusLight';

interface TrayMenuProps {
  status: Status;
  configPath: string;
  snapshotCount: number;
  onWatch: () => void;
  onHistory: () => void;
  onRestore: () => void;
  onFix: () => void;
  onSettings: () => void;
}

export function TrayMenu({
  status,
  configPath,
  snapshotCount,
  onWatch,
  onHistory,
  onRestore,
  onFix,
  onSettings,
}: TrayMenuProps) {
  const statusLabel =
    status === 'ok'
      ? 'Config healthy'
      : status === 'warning'
        ? 'Config warning'
        : 'Configuration error detected';

  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <StatusLight status={status} label={statusLabel} />
      <div>Config path: {configPath}</div>
      <div>Snapshot count: {snapshotCount}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={onWatch}>
          Watch
        </button>
        <button type="button" onClick={onHistory}>
          History
        </button>
        <button type="button" onClick={onRestore}>
          Restore
        </button>
        <button type="button" onClick={onFix}>
          LLM Fix
        </button>
        <button type="button" onClick={onSettings}>
          Settings
        </button>
      </div>
    </section>
  );
}

export default TrayMenu;
