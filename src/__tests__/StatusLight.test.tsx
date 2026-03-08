import { render, screen } from '@testing-library/react';
import { StatusLight } from '../components/StatusLight';

describe('StatusLight', () => {
  it('shows green when status is ok', () => {
    render(<StatusLight status="ok" />);
    const light = screen.getByTestId('status-light');
    expect(light).toHaveClass('ok');
  });

  it('shows red when status is error', () => {
    render(<StatusLight status="error" />);
    expect(screen.getByTestId('status-light')).toHaveClass('error');
  });

  it('shows yellow when status is warning', () => {
    render(<StatusLight status="warning" />);
    expect(screen.getByTestId('status-light')).toHaveClass('warning');
  });

  it('displays status label text', () => {
    render(<StatusLight status="ok" label="Config OK" />);
    expect(screen.getByText('Config OK')).toBeInTheDocument();
  });
});
