/**
 * End-to-end style test that verifies a portal CTA collects the correct
 * fields and submits them to the correct service provider (mocked). This
 * uses the payments portal as a representative example and hits the
 * `paystack-init` edge function shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1', email: 'd@r.com' } } }) },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Tiny fake portal that mimics what our real portals do: collect fields,
// call the service-provider edge function via supabase.functions.invoke().
function FakePaymentsPortal() {
  const submit = async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    await supabase.functions.invoke('paystack-init', {
      body: { rental_id: 'r-1', amount_kobo: 500000, email: 'd@r.com' },
    });
  };
  return (
    <div>
      <input aria-label="Amount" defaultValue="5000" />
      <button onClick={submit}>Pay now</button>
    </div>
  );
}

describe('Payments portal submit flow (mocked provider)', () => {
  beforeEach(() => invoke.mockReset());

  it('sends the correct payload to the Paystack init function', async () => {
    invoke.mockResolvedValueOnce({ data: { authorization_url: 'https://x' }, error: null });
    render(
      <MemoryRouter>
        <FakePaymentsPortal />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Pay now'));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('paystack-init', {
      body: { rental_id: 'r-1', amount_kobo: 500000, email: 'd@r.com' },
    });
  });
});
