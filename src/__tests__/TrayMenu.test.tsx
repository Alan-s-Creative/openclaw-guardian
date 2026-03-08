import { fireEvent, render, screen } from '@testing-library/react';
import { TrayMenu } from '../components/TrayMenu';

describe('TrayMenu', () => {
  const defaultProps = {
    status: 'ok' as const,
    configPath: '/Users/test/.openclaw/openclaw.json',
    snapshotCount: 5,
    onWatch: vi.fn(),
    onHistory: vi.fn(),
    onRestore: vi.fn(),
    onFix: vi.fn(),
    onSettings: vi.fn(),
  };

  it('renders status light', () => {
    render(<TrayMenu {...defaultProps} />);
    expect(screen.getByTestId('status-light')).toBeInTheDocument();
  });

  it('shows config path', () => {
    render(<TrayMenu {...defaultProps} />);
    expect(screen.getByText(/\.openclaw/)).toBeInTheDocument();
  });

  it('shows snapshot count', () => {
    render(<TrayMenu {...defaultProps} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('calls onHistory when History button clicked', () => {
    render(<TrayMenu {...defaultProps} />);
    fireEvent.click(screen.getByText(/History|Snapshots/i));
    expect(defaultProps.onHistory).toHaveBeenCalled();
  });

  it('calls onFix when LLM Fix button clicked', () => {
    render(<TrayMenu {...defaultProps} />);
    fireEvent.click(screen.getByText(/Fix|Repair/i));
    expect(defaultProps.onFix).toHaveBeenCalled();
  });

  it('shows error state when status is error', () => {
    render(<TrayMenu {...defaultProps} status="error" />);
    expect(screen.getByText(/error|broken|corrupt/i)).toBeInTheDocument();
  });
});
