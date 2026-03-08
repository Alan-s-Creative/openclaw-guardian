import React, { useState } from 'react';
import { RelativeTime } from './RelativeTime';
import { DiffSummaryBadge } from './DiffSummaryBadge';

export interface Snapshot {
  id: string;
  timestamp: string;
  openclawVersion?: string;
  trigger: 'change' | 'corrupt' | 'manual' | 'pre-upgrade';
  diffSummary: string;
  configHash: string;
  diffPatch?: string;
  configSnapshot?: unknown;
}

interface SnapshotListProps {
  snapshots: Snapshot[];
  onRestore: (snapshotId: string) => void;
}

const triggerStyles: Record<string, { bg: string; color: string }> = {
  change: { bg: 'rgba(124, 58, 237, 0.12)', color: '#a78bfa' },
  corrupt: { bg: 'rgba(239, 68, 68, 0.12)', color: '#f87171' },
  manual: { bg: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' },
  'pre-upgrade': { bg: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' },
};

export function SnapshotList({ snapshots, onRestore }: SnapshotListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (snapshots.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 24, opacity: 0.4 }}>📋</span>
        <p style={{ fontSize: 12 }}>No snapshots yet. Changes will appear here.</p>
      </div>
    );
  }

  return (
    <section aria-label="snapshot-list" style={{ display: 'grid', gap: 0 }}>
      {snapshots.map((snapshot, index) => {
        const trigger = triggerStyles[snapshot.trigger] ?? triggerStyles.change;
        const isHovered = hoveredId === snapshot.id;

        return (
          <article
            key={snapshot.id}
            className="snapshot-card"
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr',
              gap: 0,
              animationDelay: `${index * 0.05}s`,
            }}
            onMouseEnter={() => setHoveredId(snapshot.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Timeline gutter */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: index === 0 ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
                  flexShrink: 0,
                }}
              />
              {index < snapshots.length - 1 && (
                <span
                  style={{
                    width: 1,
                    flexGrow: 1,
                    background: 'rgba(255,255,255,0.06)',
                    marginTop: 4,
                  }}
                />
              )}
            </div>

            {/* Card content */}
            <div
              style={{
                padding: '6px 10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                transition: 'background 0.15s ease',
                position: 'relative',
              }}
            >
              {/* Top row: relative time + version badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <RelativeTime timestamp={snapshot.timestamp} />
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  v{snapshot.openclawVersion ?? 'unknown'}
                </span>
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 500,
                    background: trigger.bg,
                    color: trigger.color,
                  }}
                >
                  {snapshot.trigger}
                </span>
              </div>

              {/* Diff summary */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
              >
                <DiffSummaryBadge diffSummary={snapshot.diffSummary} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {snapshot.diffSummary}
                </span>
              </div>

              {/* Snapshot ID (subtle) */}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.6, marginTop: 2 }}>
                {snapshot.id}
              </div>

              {/* Restore button — hover only */}
              <button
                type="button"
                onClick={() => onRestore(snapshot.id)}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                  pointerEvents: isHovered ? 'auto' : 'none',
                }}
              >
                Restore
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default SnapshotList;
