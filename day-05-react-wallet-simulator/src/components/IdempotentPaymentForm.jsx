import { useState } from 'react';
import { generateIdempotencyKey } from '../utils/formatters.js';
import { StateBanner } from './StateBanner.jsx';

/**
 * Reusable idempotent payment form.
 * Owns only ephemeral form-draft state and the client-side Idempotency-Key;
 * canonical balance/ledger mutations remain in the parent container.
 */
export function IdempotentPaymentForm({
  isSubmitting,
  disabled,
  submissionState,
  lastSubmittedPayload,
  onSubmitPayment,
  onClearFeedback,
}) {
  const [recipient, setRecipient] = useState('Vertex Energy Corp');
  const [amountInput, setAmountInput] = useState('45.00');
  const [memo, setMemo] = useState('Grid telemetry invoice #88');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey());
  const [simulateNetworkFault, setSimulateNetworkFault] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parsedDollars = Number.parseFloat(amountInput);
    const amountCents = Number.isFinite(parsedDollars) ? Math.round(parsedDollars * 100) : 0;

    const result = await onSubmitPayment({
      recipient,
      amountCents,
      memo,
      idempotencyKey,
      simulateNetworkFault,
    });

    // Keep the SAME key on failure so retries are idempotent;
    // rotate to a fresh key only after a brand-new payment succeeds.
    if (result?.outcome === 'created') {
      setIdempotencyKey(generateIdempotencyKey());
      setSimulateNetworkFault(false);
    }
  };

  const handleReplayLast = () => {
    if (!lastSubmittedPayload) return;
    onClearFeedback?.();
    setRecipient(lastSubmittedPayload.recipient);
    setAmountInput((lastSubmittedPayload.amountCents / 100).toFixed(2));
    setMemo(lastSubmittedPayload.memo);
    setIdempotencyKey(lastSubmittedPayload.idempotencyKey);
    setSimulateNetworkFault(false);
  };

  const handleGenerateNewKey = () => {
    onClearFeedback?.();
    setIdempotencyKey(generateIdempotencyKey());
  };

  return (
    <section className="panel" aria-labelledby="payment-form-heading">
      <div className="panel__header">
        <div>
          <h2 id="payment-form-heading">Send Idempotent Payment</h2>
          <p className="panel__subtext">
            Retries with the same <code>Idempotency-Key</code> return the original ledger entry without double-debiting.
          </p>
        </div>
      </div>

      {submissionState.status === 'error' && (
        <StateBanner
          variant="error"
          title="Payment Failed (Key Preserved for Safe Retry)"
          message={submissionState.error}
          actionLabel="Dismiss"
          onAction={onClearFeedback}
        />
      )}

      {submissionState.status === 'success' && submissionState.lastOutcome === 'created' && (
        <StateBanner
          variant="success"
          title="Payment Settled (201 Created)"
          message={`Debited ledger entry ${submissionState.lastTransactionId}. A fresh Idempotency-Key is ready for your next transfer.`}
        />
      )}

      {submissionState.status === 'success' && submissionState.lastOutcome === 'idempotent_replay' && (
        <StateBanner
          variant="info"
          title="Idempotent Replay Prevented Double Charge (200 OK)"
          message={`Returned cached transaction ${submissionState.lastTransactionId} for duplicate Idempotency-Key. Balance unchanged.`}
        />
      )}

      <form className="payment-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="field">
            <span>Recipient</span>
            <input
              type="text"
              name="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. Cloud Grid Hosting"
              required
              disabled={disabled || isSubmitting}
            />
          </label>

          <label className="field">
            <span>Amount (USD)</span>
            <input
              type="number"
              name="amount"
              step="0.01"
              min="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              required
              disabled={disabled || isSubmitting}
            />
          </label>
        </div>

        <label className="field">
          <span>Memo</span>
          <input
            type="text"
            name="memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Optional invoice reference"
            disabled={disabled || isSubmitting}
          />
        </label>

        <div className="field">
          <div className="field__label-row">
            <label htmlFor="idempotency-key-input">Idempotency-Key</label>
            <div className="inline-actions">
              <button
                type="button"
                className="btn-link"
                onClick={handleGenerateNewKey}
                disabled={disabled || isSubmitting}
              >
                New Key
              </button>
              {lastSubmittedPayload && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleReplayLast}
                  disabled={disabled || isSubmitting}
                >
                  Load Last Key (Test Replay)
                </button>
              )}
            </div>
          </div>
          <input
            id="idempotency-key-input"
            type="text"
            name="idempotencyKey"
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
            required
            disabled={disabled || isSubmitting}
          />
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={simulateNetworkFault}
            onChange={(e) => setSimulateNetworkFault(e.target.checked)}
            disabled={disabled || isSubmitting}
          />
          <span>Simulate 503 network timeout on next send (to test safe retry)</span>
        </label>

        <button
          type="submit"
          className="btn btn--primary"
          disabled={disabled || isSubmitting}
        >
          {isSubmitting ? 'Submitting Payment...' : 'Send Payment'}
        </button>
      </form>
    </section>
  );
}
