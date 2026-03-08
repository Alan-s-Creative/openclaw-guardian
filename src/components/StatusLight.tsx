import React from 'react';

export type Status = 'ok' | 'warning' | 'error';

interface Props {
  status: Status;
  label?: string;
}

const statusColors: Record<Status, string> = {
  ok: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

const badgeLabels: Record<Status, string> = {
  ok: 'Healthy',
  warning: 'Warning',
  error: 'Error',
};

export function StatusLight({ status, label }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        data-testid="status-light"
        className={`status-dot-${status} ${status}`}
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: statusColors[status],
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
      )}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 7px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          background:
            status === 'ok'
              ? 'rgba(16, 185, 129, 0.12)'
              : status === 'warning'
                ? 'rgba(245, 158, 11, 0.12)'
                : 'rgba(239, 68, 68, 0.12)',
          color: statusColors[status],
        }}
      >
        {badgeLabels[status]}
      </span>
    </div>
  );
}

export default StatusLight;
