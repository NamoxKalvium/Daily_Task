import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWalletApi } from './api/walletApi.js';
import { IdempotentPaymentForm } from './components/IdempotentPaymentForm.jsx';
import { TransactionLedger } from './components/TransactionLedger.jsx';
import { WalletSummaryCard } from './components/WalletSummaryCard.jsx';
import { formatCents } from './utils/formatters.js';

const SCENARIO_MODES = [
  { id: 'normal', label: 'Normal Ledger' },
  { id: 'empty', label: 'Empty State' },
  { id: 'error', label: 'Error State' },
];

/**
 * Top-level Digital Wallet Simulator container.
 * Owns canonical wallet/ledger state, async lifecycle status, and filter selection.
 */
export function WalletDashboard({ api }) {
  const apiRef = useRef(api ?? createWalletApi());

  const [scenario, setScenario] = useState('normal');
  const [ledgerStatus, setLedgerStatus] = useState('loading');
  const [ledgerError, setLedgerError] = useState(null);
  const [wallet, setWallet] = useState({
    accountId: 'wal_acct_demo_01',
    currency: 'USD',
    balanceCents: 0,
    transactions: [],
  });
  const [activeFilter, setActiveFilter] = useState('all');
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState(null);
  const [submissionState, setSubmissionState] = useState({
    status: 'idle',
    error: null,
    lastOutcome: null,
    lastTransactionId: null,
  });

  const loadLedger = useCallback(async (targetScenario) => {
    setLedgerStatus('loading');
    setLedgerError(null);
    try {
      const data = await apiRef.current.fetchLedger({ scenario: targetScenario });
      setWallet(data);
      setLedgerStatus('ready');
    } catch (err) {
      setLedgerError(err?.message ?? 'Failed to sync wallet ledger.');
      setLedgerStatus('error');
    }
  }, []);

  useEffect(() => {
    loadLedger(scenario);
  }, [scenario, loadLedger]);

  const handleSubmitPayment = async (payload) => {
    setSubmissionState({
      status: 'submitting',
      error: null,
      lastOutcome: null,
      lastTransactionId: null,
    });
    setLastSubmittedPayload({
      recipient: payload.recipient,
      amountCents: payload.amountCents,
      memo: payload.memo,
      idempotencyKey: payload.idempotencyKey,
    });

    try {
      const res = await apiRef.current.submitPayment(payload);
      setWallet((prev) => {
        const exists = prev.transactions.some((tx) => tx.id === res.transaction.id);
        const updatedTransactions = exists
          ? prev.transactions.map((tx) => (tx.id === res.transaction.id ? res.transaction : tx))
          : [res.transaction, ...prev.transactions];
        return {
          ...prev,
          balanceCents: res.balanceCents,
          transactions: updatedTransactions,
        };
      });

      setSubmissionState({
        status: 'success',
        error: null,
        lastOutcome: res.outcome,
        lastTransactionId: res.transaction.id,
      });
      return res;
    } catch (err) {
      setSubmissionState({
        status: 'error',
        error: err?.message ?? 'Payment failed unexpectedly.',
        lastOutcome: null,
        lastTransactionId: null,
      });
      return null;
    }
  };

  // Derived metrics & filtered view — kept out of React state to prevent drift.
  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'all') return wallet.transactions;
    if (activeFilter === 'replayed') {
      return wallet.transactions.filter((tx) => tx.replayCount > 0);
    }
    return wallet.transactions.filter((tx) => tx.type === activeFilter);
  }, [wallet.transactions, activeFilter]);

  const totalDebitsCents = useMemo(
    () =>
      wallet.transactions
        .filter((tx) => tx.type === 'debit')
        .reduce((sum, tx) => sum + tx.amountCents, 0),
    [wallet.transactions]
  );

  const totalReplays = useMemo(
    () => wallet.transactions.reduce((sum, tx) => sum + tx.replayCount, 0),
    [wallet.transactions]
  );

  const handleRetryFromErrorOrEmpty = () => {
    if (scenario === 'empty') {
      setScenario('normal');
      return;
    }
    loadLedger(scenario);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Day 5 · React State & Component Design</span>
          <h1>Digital Wallet Simulator</h1>
          <p className="topbar__sub">
            Account <code>{wallet.accountId}</code> · Transaction ledger &amp; idempotent payments
          </p>
        </div>

        <div className="scenario-controls" role="group" aria-label="Simulator state controls">
          <span className="scenario-controls__label">Simulate View State:</span>
          {SCENARIO_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`btn btn--chip ${scenario === mode.id ? 'btn--chip-active' : ''}`}
              onClick={() => setScenario(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </header>

      <section className="summary-grid" aria-label="Wallet summary">
        <WalletSummaryCard
          label="Available Balance"
          value={formatCents(wallet.balanceCents)}
          subtitle="Canonical USD settlement balance"
          tone="primary"
          isLoading={ledgerStatus === 'loading'}
        />
        <WalletSummaryCard
          label="Settled Outflows"
          value={formatCents(totalDebitsCents)}
          subtitle={`${wallet.transactions.filter((t) => t.type === 'debit').length} debit entries`}
          tone="neutral"
          isLoading={ledgerStatus === 'loading'}
        />
        <WalletSummaryCard
          label="Idempotent Replays Caught"
          value={String(totalReplays)}
          subtitle="Duplicate charges prevented via Idempotency-Key"
          tone="accent"
          isLoading={ledgerStatus === 'loading'}
        />
      </section>

      <main className="dashboard-grid">
        <IdempotentPaymentForm
          isSubmitting={submissionState.status === 'submitting'}
          disabled={ledgerStatus !== 'ready' || wallet.balanceCents <= 0}
          submissionState={submissionState}
          lastSubmittedPayload={lastSubmittedPayload}
          onSubmitPayment={handleSubmitPayment}
          onClearFeedback={() =>
            setSubmissionState((prev) => ({ ...prev, status: 'idle', error: null }))
          }
        />

        <TransactionLedger
          transactions={filteredTransactions}
          totalCount={wallet.transactions.length}
          status={ledgerStatus}
          error={ledgerError}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onRetry={handleRetryFromErrorOrEmpty}
        />
      </main>
    </div>
  );
}

export default WalletDashboard;
