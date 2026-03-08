import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SnapshotList, { type Snapshot } from './components/SnapshotList';
import { type Status } from './components/StatusLight';
import TrayMenu from './components/TrayMenu';
import Toast from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';

interface AppState {
  status: Status;
  configPath: string;
  snapshots: Snapshot[];
  openclawVersion: string;
}

const initialState: AppState = {
  status: 'ok',
  configPath: '/Users/test/.openclaw/openclaw.json',
  openclawVersion: 'unknown',
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
  const [isWatching, setIsWatching] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<Snapshot | null>(null);
  const [openclawVersion, setOpenclawVersion] = useState(initialState.openclawVersion);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);

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
        if (state.openclawVersion) {
          setOpenclawVersion(state.openclawVersion);
        }
      })
      .catch(() => {
        // In tests and browser-only mode Tauri runtime may be unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const handleRestore = useCallback((snapshotId: string) => {
    const snap = snapshots.find((s) => s.id === snapshotId);
    if (snap) {
      setConfirmRestore(snap);
    }
  }, [snapshots]);

  const executeRestore = useCallback(() => {
    if (!confirmRestore) return;
    void invoke('restore_snapshot', { snapshotId: confirmRestore.id })
      .then(() => {
        setToast({ message: `Restored to v${confirmRestore.openclawVersion}`, type: 'success' });
      })
      .catch(() => {
        setStatus('warning');
        setToast({ message: 'Restore failed', type: 'error' });
      });
    setConfirmRestore(null);
  }, [confirmRestore]);

  const handleWatch = useCallback(() => {
    void invoke('start_watch')
      .then(() => setIsWatching((prev) => !prev))
      .catch(() => undefined);
  }, []);

  const handleSettings = useCallback(async () => {
    try {
      const s = await invoke<Record<string, string>>('open_settings');
      setSettings(s);
      setShowSettings(true);
    } catch {
      setShowSettings(true); // show empty modal in browser mode
    }
  }, []);

  const handleFix = useCallback(() => {
    setIsFixing(true);
    void invoke('llm_fix')
      .then(() => {
        setToast({ message: 'LLM Fix applied successfully', type: 'success' });
      })
      .catch(() => {
        setToast({ message: 'LLM Fix failed', type: 'error' });
      })
      .finally(() => setIsFixing(false));
  }, []);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header — fixed */}
      <header
        style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <TrayMenu
          status={status}
          configPath={configPath}
          snapshotCount={snapshots.length}
          isWatching={isWatching}
          openclawVersion={openclawVersion}
          onWatch={handleWatch}
          onHistory={() => void invoke('open_history').catch(() => undefined)}
          onRestore={() => handleRestore(snapshots[0]?.id ?? '')}
          onFix={handleFix}
          onSettings={() => void handleSettings()}
          onDashboard={() => void invoke('open_dashboard').catch(() => {
            window.open('http://127.0.0.1:18789/', '_blank');
          })}
        />
      </header>

      {/* Scrollable snapshot list */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
        }}
      >
        {isFixing && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              marginBottom: 10,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(124, 58, 237, 0.1)',
              border: '1px solid rgba(124, 58, 237, 0.2)',
              fontSize: 12,
              color: 'var(--accent)',
            }}
          >
            <span className="spinner" />
            Running LLM Fix...
          </div>
        )}
        <SnapshotList snapshots={snapshots} onRestore={handleRestore} />
      </main>

      {/* Bottom status bar */}
      <footer
        style={{
          padding: '6px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--text-secondary)',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.15)',
        }}
      >
        <span>Port 3001</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isWatching ? 'var(--success)' : 'rgba(255,255,255,0.2)',
            }}
          />
          {isWatching ? 'Watching' : 'Idle'}
        </span>
      </footer>

      {/* Settings modal */}
      {showSettings && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: 340, display: 'grid', gap: 12,
          }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16 }}>Settings</h2>
            {settings && Object.entries(settings).map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all',
                  background: 'var(--bg-card)', padding: '4px 8px', borderRadius: 6 }}>{String(v)}</div>
              </div>
            ))}
            {!settings && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Config: ~/.openclaw/openclaw.json<br/>
                Storage: ~/.guardian/snapshots<br/>
                Port: 7749
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              style={{ marginTop: 8, padding: '8px 16px', background: 'var(--accent)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >Close</button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmRestore && (
        <ConfirmDialog
          message={`Restore to v${confirmRestore.openclawVersion} from ${new Date(confirmRestore.timestamp).toLocaleString()}?`}
          onConfirm={executeRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
