import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onDismiss: () => void;
}

const typeColors: Record<string, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  info: 'var(--accent)',
};

export function Toast({ message, type = 'success', duration = 3000, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), duration - 200);
    const dismiss = setTimeout(onDismiss, duration);
    return () => {
      clearTimeout(timer);
      clearTimeout(dismiss);
    };
  }, [duration, onDismiss]);

  return (
    <div
      className={exiting ? 'toast-exit' : 'toast'}
      style={{
        position: 'fixed',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1e293b',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${typeColors[type]}`,
        borderRadius: 'var(--radius-sm)',
        padding: '8px 14px',
        fontSize: 12,
        color: 'var(--text-primary)',
        zIndex: 999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        maxWidth: 340,
      }}
    >
      {message}
    </div>
  );
}

export default Toast;
