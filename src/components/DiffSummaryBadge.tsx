import React from 'react';

interface DiffSummaryBadgeProps {
  diffSummary: string;
}

type ChangeType = 'Added' | 'Changed' | 'Removed';

const chipColors: Record<ChangeType, { bg: string; color: string }> = {
  Added: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
  Changed: { bg: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' },
  Removed: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
};

function detectChangeType(summary: string): ChangeType {
  const lower = summary.toLowerCase();
  if (lower.startsWith('added') || lower.includes('new')) return 'Added';
  if (lower.startsWith('removed') || lower.includes('deleted')) return 'Removed';
  return 'Changed';
}

export function DiffSummaryBadge({ diffSummary }: DiffSummaryBadgeProps) {
  const changeType = detectChangeType(diffSummary);
  const colors = chipColors[changeType];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        background: colors.bg,
        color: colors.color,
      }}
    >
      {changeType}
    </span>
  );
}

export default DiffSummaryBadge;
