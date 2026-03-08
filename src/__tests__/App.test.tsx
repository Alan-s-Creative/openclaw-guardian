import { render, screen } from '@testing-library/react';
import App from '../App';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(document.body).toBeDefined();
  });

  it('shows Guardian title', () => {
    render(<App />);
    expect(screen.getByText(/Guardian/i)).toBeInTheDocument();
  });

  it('renders status bar with port', () => {
    render(<App />);
    expect(screen.getByText(/Port/i)).toBeInTheDocument();
  });
});
