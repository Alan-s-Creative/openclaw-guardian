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
  watching: boolean;
  port: number;
  openclawVersion: string;
  guardianVersion: string;
}

const initialState: AppState = {
  status: 'ok',
  configPath: '',
  openclawVersion: 'unknown',
  guardianVersion: '0.1.1',
  snapshots: [],
  watching: false,
  port: 7749,
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 12 }}>{value}</span>
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<Status>(initialState.status);
  const [configPath, setConfigPath] = useState(initialState.configPath);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialState.snapshots);
  const [isWatching, setIsWatching] = useState(initialState.watching);
  const [port, setPort] = useState(initialState.port);
  const [isFixing, setIsFixing] = useState(false);
  const [llmResult, setLlmResult] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<Snapshot | null>(null);
  const [openclawVersion, setOpenclawVersion] = useState(initialState.openclawVersion);
  const [guardianVersion, setGuardianVersion] = useState(initialState.guardianVersion);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [healthResult, setHealthResult] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);

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
        if (typeof state.watching === 'boolean') {
          setIsWatching(state.watching);
        }
        if (typeof state.port === 'number') {
          setPort(state.port);
        }
        if (state.openclawVersion) {
          setOpenclawVersion(state.openclawVersion);
        }
        if (state.guardianVersion) {
          setGuardianVersion(state.guardianVersion);
        }
      })
      .catch((err: unknown) => {
        // In tests and browser-only mode Tauri runtime may be unavailable.
        console.warn('[Guardian] get_app_state unavailable:', err);
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
        setToast({ message: `Restored to v${confirmRestore.openclawVersion ?? 'unknown'}`, type: 'success' });
      })
      .catch(() => {
        setStatus('warning');
        setToast({ message: 'Restore failed', type: 'error' });
      });
    setConfirmRestore(null);
  }, [confirmRestore]);

  const handleWatch = useCallback(() => {
    void invoke('start_watch')
      .then(() => setIsWatching(true))
      .catch((err: unknown) => {
        console.error('[Guardian] start_watch failed:', err);
        setToast({ message: 'Failed to start watcher', type: 'error' });
      });
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

  const handleHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    try {
      const result = await invoke<any>('health_check');
      setHealthResult(result);
    } catch (err) {
      setHealthResult({ error: String(err) });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const handleFix = useCallback(() => {
    setIsFixing(true);
    setLlmLoading(true);
    setLlmResult(null);
    void invoke<string>('llm_fix')
      .then((result) => {
        setLlmResult(result);
      })
      .catch((err) => {
        setLlmResult(`Error: ${String(err)}`);
      })
      .finally(() => {
        setLlmLoading(false);
        setIsFixing(false);
      });
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
          onHistory={() => void invoke('open_history').catch((err: unknown) => {
            console.error('[Guardian] open_history failed:', err);
          })}
          onRestore={() => handleRestore(snapshots[0]?.id ?? '')}
          onFix={handleFix}
          onSettings={() => void handleSettings()}
          onDashboard={() => void invoke('open_dashboard').catch(() => {
            window.open('http://127.0.0.1:18789/', '_blank');
          })}
          onHealthCheck={() => void handleHealthCheck()}
          guardianVersion={guardianVersion}
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
        <span>Port {port}</span>
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

      {/* LLM Fix result modal */}
      {(llmResult !== null || llmLoading) && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: 420, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
          }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16, flexShrink: 0 }}>🤖 Gemini Analysis</h2>
            {llmLoading
              ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>⏳ Analyzing config...</div>
              : <div
                  style={{
                    color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.7,
                    overflowY: 'scroll',
                    height: '320px',
                    paddingRight: 8,
                    WebkitOverflowScrolling: 'touch',
                  } as React.CSSProperties}
                  dangerouslySetInnerHTML={{
                    __html: (llmResult ?? '')
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.+?)\*/g, '<em>$1</em>')
                      .replace(/\n/g, '<br/>')
                  }}
                />
            }
            {!llmLoading && (
              <button
                type="button"
                onClick={() => setLlmResult(null)}
                style={{
                  padding: '8px 16px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                }}
              >Close</button>
            )}
          </div>
        </div>
      )}

      {/* Health Check modal */}
      {(healthResult !== null || healthLoading) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: 420,
            display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '80vh', overflow: 'hidden' }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16, flexShrink: 0 }}>Gateway Health Check</h2>
            {healthLoading
              ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Checking...</div>
              : healthResult && !healthResult.error ? (
                <div style={{ overflowY: 'scroll', height: '340px', fontSize: 13, display: 'grid', gap: 8 }}>
                  <Row label="Gateway" value={healthResult.gatewayReachable ? 'Reachable' : 'Unreachable'} />
                  <Row label="Port 18789" value={healthResult.portListening ? 'Listening' : 'Not listening'} />
                  <Row label="LaunchAgent" value={healthResult.launchAgentLoaded ? 'Loaded' : 'Not loaded'} />
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Plugins:</div>
                  {healthResult.pluginPathsOk.map((p: any) => (
                    <div key={p.name} style={{ paddingLeft: 12, color: p.enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {p.enabled ? (p.exists === false ? 'Missing' : 'OK') : 'Disabled'} {p.name}
                      {p.exists === false && <span style={{ color: '#ff6b6b', marginLeft: 4 }}>(path not found)</span>}
                    </div>
                  ))}
                  {healthResult.recentErrors.length > 0 && (
                    <>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>Recent errors:</div>
                      {healthResult.recentErrors.map((e: string, i: number) => (
                        <div key={i} style={{ color: '#ff6b6b', fontSize: 11, fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{e}</div>
                      ))}
                    </>
                  )}
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Checked at {healthResult.checkedAt}</div>
                </div>
              ) : (
                <div style={{ color: '#ff6b6b', fontSize: 13 }}>{healthResult?.error}</div>
              )
            }
            {!healthLoading && (
              <button type="button" onClick={() => setHealthResult(null)}
                style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>Close</button>
            )}
          </div>
        </div>
      )}

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
          message={`Restore to v${confirmRestore.openclawVersion ?? 'unknown'} from ${new Date(confirmRestore.timestamp).toLocaleString()}?`}
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
