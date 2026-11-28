import { formatCents, formatTimestamp } from '../utils/formatters.js';
import { StateBanner } from './StateBanner.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'debit', label: 'Debits' },
  { id: 'credit', label: 'Credits' },
  { id: 'replayed', label: 'Replayed' },
];

/**
 * Reusable transaction ledger view handling loading, error, empty, and filtered states.
 */
export function TransactionLedger({
  transactions,
  totalCount,
  status,
  error,
  activeFilter,
  onFilterChange,
  onRetry,
}) {
  return (
    <section className="panel" aria-labelledby="ledger-heading">
      <div className="panel__header panel__header--wrap">
        <div>
          <h2 id="ledger-heading">Transaction Ledger</h2>
          <p className="panel__subtext">
            Immutable debit/credit entries stamped with client <code>Idempotency-Key</code>.
          </p>
        </div>

        <div className="filter-tabs" role="tablist" aria-label="Filter transactions">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter.id}
              className={`filter-tab ${activeFilter === filter.id ? 'filter-tab--active' : ''}`}
              onClick={() => onFilterChange(filter.id)}
              disabled={status === 'loading'}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && (
        <div className="ledger-loading" aria-busy="true">
          <StateBanner
            variant="loading"
            title="Syncing wallet ledger..."
            message="Fetching settled transactions and idempotency records."
          />
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
          <div className="skeleton skeleton--row" />
        </div>
      )}

      {status === 'error' && (
        <StateBanner
          variant="error"
          title="Could Not Load Transaction Ledger"
          message={error}
          actionLabel="Retry Sync"
          onAction={onRetry}
        />
      )}

      {status === 'ready' && totalCount === 0 && (
        <StateBanner
          variant="empty"
          title="No Transactions Yet"
          message="This wallet has no settled ledger entries. Send an idempotent payment or switch back to Normal simulation mode."
          actionLabel="Load Normal Ledger"
          onAction={onRetry}
        />
      )}

      {status === 'ready' && totalCount > 0 && transactions.length === 0 && (
        <StateBanner
          variant="empty"
          title="No Matching Entries"
          message={`No ledger transactions match the "${activeFilter}" filter.`}
          actionLabel="Show All Entries"
          onAction={() => onFilterChange('all')}
        />
      )}

      {status === 'ready' && transactions.length > 0 && (
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Counterparty & Memo</th>
                <th>Idempotency Key</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const isCredit = tx.type === 'credit';
                return (
                  <tr key={tx.id}>
                    <td>
                      <div className="tx-id">{tx.id}</div>
                      <div className="tx-meta">{formatTimestamp(tx.createdAt)}</div>
                    </td>
                    <td>
                      <div className="tx-party">{tx.counterparty}</div>
                      <div className="tx-meta">{tx.memo}</div>
                    </td>
                    <td>
                      <code className="tx-key">{tx.idempotencyKey}</code>
                      {tx.replayCount > 0 && (
                        <span className="badge badge--replay">
                          Replayed x{tx.replayCount}
                        </span>
                      )}
                    </td>
                    <td className={`tx-amount ${isCredit ? 'tx-amount--credit' : 'tx-amount--debit'}`}>
                      {isCredit ? '+' : '-'}{formatCents(tx.amountCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
