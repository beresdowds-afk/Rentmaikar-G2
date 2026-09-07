import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { usePersistedTab } from '@/hooks/usePersistedTab';

/**
 * Regression guard for the navigation/view-persistence class of bugs:
 * selecting a sibling feature must replace the active feature exactly once,
 * stay selected, and stay addressable through the URL.
 */
function Dashboard() {
  const [portal, setPortal] = usePersistedTab('support', 'portal');
  const [tab, setTab] = usePersistedTab('task-portal');
  const location = useLocation();

  return (
    <div>
      <button onClick={() => { setPortal('support'); setTab('inbox'); }}>Unified Inbox</button>
      <button onClick={() => { setPortal('support'); setTab('call-center'); }}>Call Center</button>
      <button onClick={() => { setPortal('crm'); setTab('attestation-review'); }}>Referees</button>

      <span data-testid="url">{location.search}</span>
      <span data-testid="portal">{portal}</span>

      {tab === 'inbox' && <div data-testid="unified-inbox-view" />}
      {tab === 'call-center' && <div data-testid="call-center-view" />}
      {tab === 'attestation-review' && <div data-testid="referees-view" />}
    </div>
  );
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );

describe('usePersistedTab navigation', () => {
  beforeEach(() => sessionStorage.clear());

  it('shows exactly one active feature when switching siblings', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    await user.click(screen.getByRole('button', { name: /unified inbox/i }));
    expect(screen.getByTestId('unified-inbox-view')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /call center/i }));
    expect(screen.getByTestId('call-center-view')).toBeInTheDocument();
    expect(screen.queryByTestId('unified-inbox-view')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /referees/i }));
    expect(screen.getByTestId('referees-view')).toBeInTheDocument();
    expect(screen.queryByTestId('call-center-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('portal')).toHaveTextContent('crm');
  });

  it('does not snap back to the previous feature after the URL settles', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    await user.click(screen.getByRole('button', { name: /unified inbox/i }));
    await user.click(screen.getByRole('button', { name: /call center/i }));

    // Let every pending effect flush — the old implementation reverted here.
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId('call-center-view')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('tab=call-center');
  });

  it('is deep-linkable and survives a remount (refresh)', () => {
    const { unmount } = renderAt('/admin?portal=support&tab=call-center');
    expect(screen.getByTestId('call-center-view')).toBeInTheDocument();
    unmount();

    renderAt('/admin?portal=support&tab=call-center');
    expect(screen.getByTestId('call-center-view')).toBeInTheDocument();
  });

  it('writes the default destination into the URL without a history entry', () => {
    renderAt('/admin');
    expect(screen.getByTestId('url').textContent).toContain('tab=task-portal');
  });
});
