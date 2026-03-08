import { fireEvent, render, screen } from '@testing-library/react';
import { SnapshotList } from '../components/SnapshotList';

const mockSnapshots = [
  {
    id: 'snap_001',
    timestamp: '2026-03-08T10:00:00Z',
    openclawVersion: '1.4.2',
    trigger: 'change' as const,
    diffSummary: 'Changed: model (sonnet→opus)',
    configHash: 'sha256:abc',
    diffPatch: '',
    configSnapshot: {},
  },
  {
    id: 'snap_002',
    timestamp: '2026-03-08T09:00:00Z',
    openclawVersion: '1.4.1',
    trigger: 'manual' as const,
    diffSummary: 'First snapshot',
    configHash: 'sha256:def',
    diffPatch: '',
    configSnapshot: {},
  },
];

describe('SnapshotList', () => {
  it('renders list of snapshots', () => {
    render(<SnapshotList snapshots={mockSnapshots} onRestore={vi.fn()} />);
    expect(screen.getByText('snap_001')).toBeInTheDocument();
    expect(screen.getByText('snap_002')).toBeInTheDocument();
  });

  it('shows openclaw version for each snapshot', () => {
    render(<SnapshotList snapshots={mockSnapshots} onRestore={vi.fn()} />);
    expect(screen.getByText('1.4.2')).toBeInTheDocument();
    expect(screen.getByText('1.4.1')).toBeInTheDocument();
  });

  it('shows diff summary', () => {
    render(<SnapshotList snapshots={mockSnapshots} onRestore={vi.fn()} />);
    expect(screen.getByText('Changed: model (sonnet→opus)')).toBeInTheDocument();
  });

  it('calls onRestore when restore button clicked', () => {
    const onRestore = vi.fn();
    render(<SnapshotList snapshots={mockSnapshots} onRestore={onRestore} />);
    const btns = screen.getAllByText('Restore');
    fireEvent.click(btns[0]);
    expect(onRestore).toHaveBeenCalledWith('snap_001');
  });

  it('shows empty state when no snapshots', () => {
    render(<SnapshotList snapshots={[]} onRestore={vi.fn()} />);
    expect(screen.getByText(/no snapshots/i)).toBeInTheDocument();
  });
});
