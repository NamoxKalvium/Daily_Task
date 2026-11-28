import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WalletDashboard } from './App.jsx';
import { createWalletApi } from './api/walletApi.js';

describe('WalletDashboard (Day 5 React State & Component Design)', () => {
  it('renders loading state first, then settles into canonical balance and ledger entries', async () => {
    const api = createWalletApi({ latencyMs: 15 });
    render(<WalletDashboard api={api} />);

    expect(screen.getByText(/syncing wallet ledger/i)).toBeInTheDocument();

    expect(await screen.findByText('$2,500.00')).toBeInTheDocument();
    expect(screen.getByText('Cloud Grid Hosting')).toBeInTheDocument();
    expect(screen.getByText('Stripe Payout #441')).toBeInTheDocument();
  });

  it('demonstrates empty ledger state and empty filter state with recovery actions', async () => {
    const api = createWalletApi({ latencyMs: 5 });
    render(<WalletDashboard api={api} />);

    await screen.findByText('$2,500.00');

    fireEvent.click(screen.getByRole('button', { name: 'Empty State' }));
    expect(await screen.findByText('No Transactions Yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Payment' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Load Normal Ledger' }));
    expect(await screen.findByText('Cloud Grid Hosting')).toBeInTheDocument();

    // Filter to Credits, verify debits hidden
    fireEvent.click(screen.getByRole('tab', { name: 'Credits' }));
    expect(screen.getByText('Stripe Payout #441')).toBeInTheDocument();
    expect(screen.queryByText('Cloud Grid Hosting')).not.toBeInTheDocument();
  });

  it('demonstrates error state on ledger sync failure and allows retry', async () => {
    const api = createWalletApi({ latencyMs: 5 });
    render(<WalletDashboard api={api} />);

    await screen.findByText('$2,500.00');
    fireEvent.click(screen.getByRole('button', { name: 'Error State' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/could not load transaction ledger/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Sync' })).toBeInTheDocument();
  });

  it('preserves Idempotency-Key across a 503 timeout, settles once, and replays safely without double debiting', async () => {
    const api = createWalletApi({ latencyMs: 5 });
    render(<WalletDashboard api={api} />);

    await screen.findByText('$2,500.00');

    const keyInput = screen.getByLabelText('Idempotency-Key');
    const initialKey = keyInput.value;

    // 1. Simulate a 503 network timeout before confirmation
    fireEvent.click(screen.getByLabelText(/simulate 503 network timeout/i));
    fireEvent.click(screen.getByRole('button', { name: 'Send Payment' }));

    const errorAlert = await screen.findByRole('alert');
    expect(within(errorAlert).getByText(/simulated network timeout/i)).toBeInTheDocument();
    // Critical invariant: failed request retains the SAME Idempotency-Key
    expect(keyInput.value).toBe(initialKey);
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();

    // 2. Retry with fault unchecked -> settles $45.00 once ($2,500.00 -> $2,455.00)
    fireEvent.click(screen.getByLabelText(/simulate 503 network timeout/i));
    fireEvent.click(screen.getByRole('button', { name: 'Send Payment' }));

    expect(await screen.findByText(/payment settled \(201 created\)/i)).toBeInTheDocument();
    expect(screen.getByText('$2,455.00')).toBeInTheDocument();
    expect(screen.getByText('Vertex Energy Corp')).toBeInTheDocument();

    // Fresh key rotated automatically after 201 Created
    await waitFor(() => {
      expect(keyInput.value).not.toBe(initialKey);
    });

    // 3. Load last key and replay -> 200 OK idempotent replay, balance remains $2,455.00
    fireEvent.click(screen.getByRole('button', { name: /load last key/i }));
    expect(keyInput.value).toBe(initialKey);
    fireEvent.click(screen.getByRole('button', { name: 'Send Payment' }));

    expect(
      await screen.findByText(/idempotent replay prevented double charge \(200 ok\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText('$2,455.00')).toBeInTheDocument();
    const vertexRow = screen.getByText('Vertex Energy Corp').closest('tr');
    expect(within(vertexRow).getByText('Replayed x1')).toBeInTheDocument();
  });

  it('rejects reusing an existing Idempotency-Key with a modified payment amount (422 conflict)', async () => {
    const api = createWalletApi({ latencyMs: 5 });
    render(<WalletDashboard api={api} />);

    await screen.findByText('$2,500.00');

    const keyInput = screen.getByLabelText('Idempotency-Key');
    fireEvent.change(keyInput, { target: { value: 'pay_seed_cloud_01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Payment' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/already used for a different recipient or amount/i)).toBeInTheDocument();
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();
  });
});
