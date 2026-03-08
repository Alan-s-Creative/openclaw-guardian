import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SnapshotList, { type Snapshot } from './components/SnapshotList';
import { type Status } from './components/StatusLight';
import TrayMenu from './components/TrayMenu';

interface AppState {
  status: Status;
  configPath: string;
  snapshots: Snapshot[];
}

const initialState: AppState = {
  status: 'ok',
  configPath: '/Users/test/.openclaw/openclaw.json',
  snapshots: [
    {
      id: 'snap_001',
      timestamp: '2026-03-08T10:00:00Z',
      openclawVersion: '1.4.2',
      trigger: 'change',
      diffSummary: 'Changed: model (sonnet→opus)',
      configHash: 'sha256:abc',
      diffPatch: '',
      configSnapshot: {},
    },
  ],
};

function App() {
  const [status, setStatus] = useState<Status>(initialState.status);
  const [configPath, setConfigPath] = useState(initialState.configPath);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialState.snapshots);

  useEffect(() => {
    let active = true;

    invoke<Partial<AppState> | null>('get_app_state')
      .then((state) => {
        if (!active || !state) {
          return;
        }

        if (state.status) {
          setStatus(state.status);
        }
        if (state.configPath) {
          setConfigPath(state.configPath);
        }
        if (state.snapshots) {
          setSnapshots(state.snapshots);
        }
      })
      .catch(() => {
        // In tests and browser-only mode Tauri runtime may be unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const handleRestoreFromList = (snapshotId: string) => {
    void invoke('restore_snapshot', { snapshotId }).catch(() => {
      setStatus('warning');
    });
  };

  return (
    <main style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1>OpenClaw Guardian</h1>
      <TrayMenu
        status={status}
        configPath={configPath}
        snapshotCount={snapshots.length}
        onWatch={() => void invoke('start_watch').catch(() => undefined)}
        onHistory={() => void invoke('open_history').catch(() => undefined)}
        onRestore={() => void handleRestoreFromList(snapshots[0]?.id ?? '')}
        onFix={() => void invoke('llm_fix').catch(() => undefined)}
        onSettings={() => void invoke('open_settings').catch(() => undefined)}
      />
      <SnapshotList snapshots={snapshots} onRestore={handleRestoreFromList} />
    </main>
  );
}

export default App;
