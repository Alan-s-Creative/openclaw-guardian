import React from 'react';

export type Status = 'ok' | 'warning' | 'error';

interface Props {
  status: Status;
  label?: string;
}

export function StatusLight({ status, label }: Props) {
  const colors: Record<Status, string> = {
    ok: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        data-testid="status-light"
        className={status}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: colors[status],
          display: 'inline-block',
        }}
      />
      {label && <span>{label}</span>}
    </div>
  );
}

export default StatusLight;
