import React, { useState } from 'react';
import { StatusLight, type Status } from './StatusLight';

interface TrayMenuProps {
  status: Status;
  configPath: string;
  snapshotCount: number;
  isWatching: boolean;
  openclawVersion?: string;
  guardianVersion?: string;
  onWatch: () => void;
  onHistory: () => void;
  onRestore: () => void;
  onFix: () => void;
  onSettings: () => void;
  onDashboard?: () => void;
  onHealthCheck?: () => void;
}

function truncatePath(path: string, maxLen = 30): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length <= 3) return '...' + path.slice(-maxLen);
  return '.../' + parts.slice(-2).join('/');
}

/* SVG icon components */
const IconWatch = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8L10 10" />
  </svg>
);

const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 3v4h4" />
    <path d="M2.8 7A5.5 5.5 0 1 1 3.5 10.5" />
  </svg>
);

const IconRestore = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v4h4" />
    <path d="M4 6l3.5-3.5A5 5 0 1 1 3.2 10" />
  </svg>
);

const IconFix = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L9.5 5.5" />
    <path d="M10 6.5L6.5 10l-3 .5.5-3L7.5 4" />
    <circle cx="11.5" cy="4.5" r="2.5" />
  </svg>
);

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2" />
    <path d="M13.5 8a5.5 5.5 0 0 0-.1-.8l1.3-1-.7-1.2-1.5.5a5.6 5.6 0 0 0-1.3-.8L11 3.3H9.5l-.2 1.4a5.6 5.6 0 0 0-1.3.8l-1.5-.5-.7 1.2 1.3 1A5.5 5.5 0 0 0 7 8c0 .3 0 .5.1.8l-1.3 1 .7 1.2 1.5-.5c.4.3.8.6 1.3.8l.2 1.4H11l.2-1.4c.5-.2.9-.5 1.3-.8l1.5.5.7-1.2-1.3-1c.1-.3.1-.5.1-.8z" />
  </svg>
);

const btnBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '10px 0',
  borderRadius: 'var(--radius-sm)',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  transition: 'all 0.15s ease',
  cursor: 'pointer',
};

export function TrayMenu({
  status,
  configPath,
  snapshotCount,
  isWatching,
  openclawVersion,
  guardianVersion,
  onWatch,
  onHistory,
  onRestore,
  onFix,
  onSettings,
  onDashboard,
  onHealthCheck,
}: TrayMenuProps) {
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const statusLabel =
    status === 'ok'
      ? 'Config healthy'
      : status === 'warning'
        ? 'Config warning'
        : 'Configuration error detected';

  const hoverStyle = (id: string): React.CSSProperties => ({
    ...btnBase,
    ...(hoveredBtn === id
      ? { background: 'rgba(255,255,255,0.08)', borderColor: 'var(--border-hover)', color: 'var(--text-primary)' }
      : {}),
  });

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>🛡</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>
            OpenClaw Guardian
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Guardian v{guardianVersion ?? '0.1.1'} · OpenClaw {openclawVersion ?? 'unknown'}
          </div>
        </div>
      </div>

      {/* Status */}
      <StatusLight status={status} label={statusLabel} />

      {/* Config path */}
      <div
        data-tooltip={configPath}
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ opacity: 0.5 }}>📁</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncatePath(configPath)}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 10,
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          {snapshotCount} snapshots
        </span>
      </div>

      {/* Action buttons — 2 column grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
        }}
      >
        {/* Watch toggle */}
        <button
          type="button"
          onClick={onWatch}
          onMouseEnter={() => setHoveredBtn('watch')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={{
            ...hoverStyle('watch'),
            ...(isWatching
              ? {
                  background: 'rgba(16, 185, 129, 0.1)',
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  color: 'var(--success)',
                }
              : {}),
          }}
        >
          <IconWatch />
          {isWatching ? 'Watching' : 'Watch'}
        </button>

        <button
          type="button"
          onClick={onHistory}
          onMouseEnter={() => setHoveredBtn('history')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={hoverStyle('history')}
        >
          <IconHistory />
          Snapshots
        </button>

        <button
          type="button"
          onClick={onRestore}
          onMouseEnter={() => setHoveredBtn('restore')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={hoverStyle('restore')}
        >
          <IconRestore />
          Restore
        </button>

        <button
          type="button"
          onClick={onFix}
          onMouseEnter={() => setHoveredBtn('fix')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={hoverStyle('fix')}
        >
          <IconFix />
          LLM Fix
        </button>

        <button
          type="button"
          onClick={onHealthCheck}
          onMouseEnter={() => setHoveredBtn('healthcheck')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={hoverStyle('healthcheck')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h2l1-3 2 6 1-3h2" />
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
          </svg>
          Health Check
        </button>
      </div>

      {/* Settings + Dashboard — full width row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button
          type="button"
          onClick={onSettings}
          onMouseEnter={() => setHoveredBtn('settings')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={{
            ...hoverStyle('settings'),
            flexDirection: 'row',
            gap: 6,
            padding: '8px 12px',
          }}
        >
          <IconSettings />
          Settings
        </button>
        <button
          type="button"
          onClick={onDashboard}
          onMouseEnter={() => setHoveredBtn('dashboard')}
          onMouseLeave={() => setHoveredBtn(null)}
          style={{
            ...hoverStyle('dashboard'),
            flexDirection: 'row',
            gap: 6,
            padding: '8px 12px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M2 8h12M8 2a10 10 0 0 1 3 6 10 10 0 0 1-3 6 10 10 0 0 1-3-6 10 10 0 0 1 3-6z" />
          </svg>
          Dashboard
        </button>
      </div>
    </section>
  );
}

export default TrayMenu;
