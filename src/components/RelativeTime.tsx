import React from 'react';

interface RelativeTimeProps {
  timestamp: string;
}

export function getRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function RelativeTime({ timestamp }: RelativeTimeProps) {
  return (
    <time
      dateTime={timestamp}
      title={new Date(timestamp).toLocaleString()}
      style={{ color: 'var(--text-secondary)', fontSize: 11 }}
    >
      {getRelativeTime(timestamp)}
    </time>
  );
}

export default RelativeTime;
