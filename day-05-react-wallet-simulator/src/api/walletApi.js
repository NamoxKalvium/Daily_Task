const INITIAL_BALANCE_CENTS = 250_000; // $2,500.00

const SEED_TRANSACTIONS = [
  {
    id: 'tx_9003',
    type: 'debit',
    counterparty: 'Cloud Grid Hosting',
    memo: 'Monthly compute cluster settlement',
    amountCents: 48_500,
    status: 'settled',
    idempotencyKey: 'pay_seed_cloud_01',
    replayCount: 0,
    createdAt: '2026-11-28T09:15:00.000Z',
  },
  {
    id: 'tx_9002',
    type: 'credit',
    counterparty: 'Stripe Payout #441',
    memo: 'Merchant settlement batch',
    amountCents: 120_000,
    status: 'settled',
    idempotencyKey: 'dep_seed_stripe_02',
    replayCount: 0,
    createdAt: '2026-11-27T18:40:00.000Z',
  },
  {
    id: 'tx_9001',
    type: 'debit',
    counterparty: 'Apex Hardware Supply',
    memo: 'Smart meter gateway batch (replayed safely on retry)',
    amountCents: 16_250,
    status: 'settled',
    idempotencyKey: 'pay_seed_apex_03',
    replayCount: 1,
    createdAt: '2026-11-27T11:05:00.000Z',
  },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WalletApiError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'WalletApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Creates an isolated in-memory digital wallet API client enforcing
 * HTTP-style Idempotency-Key deduplication and deterministic state scenarios.
 */
export function createWalletApi({ latencyMs = 220 } = {}) {
  let balanceCents = INITIAL_BALANCE_CENTS;
  let transactions = SEED_TRANSACTIONS.map((tx) => ({ ...tx }));
  const idempotencyStore = new Map();

  for (const tx of transactions) {
    idempotencyStore.set(tx.idempotencyKey, {
      fingerprint: `${tx.counterparty}::${tx.amountCents}`,
      transactionId: tx.id,
    });
  }

  return {
    async fetchLedger({ scenario = 'normal' } = {}) {
      await delay(latencyMs);

      if (scenario === 'error') {
        throw new WalletApiError({
          status: 503,
          code: 'LEDGER_UNAVAILABLE',
          message: 'Ledger service timed out while syncing settled entries. Please retry.',
        });
      }

      if (scenario === 'empty') {
        return {
          accountId: 'wal_acct_demo_01',
          currency: 'USD',
          balanceCents: 0,
          transactions: [],
        };
      }

      return {
        accountId: 'wal_acct_demo_01',
        currency: 'USD',
        balanceCents,
        transactions: transactions.map((tx) => ({ ...tx })),
      };
    },

    async submitPayment({
      recipient,
      amountCents,
      memo,
      idempotencyKey,
      simulateNetworkFault = false,
    }) {
      await delay(latencyMs);

      const cleanKey = idempotencyKey.trim();
      const cleanRecipient = recipient.trim();
      const fingerprint = `${cleanRecipient}::${amountCents}`;

      if (!cleanKey) {
        throw new WalletApiError({
          status: 400,
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key header is required for wallet payments.',
        });
      }

      if (simulateNetworkFault) {
        throw new WalletApiError({
          status: 503,
          code: 'GATEWAY_TIMEOUT',
          message:
            'Simulated network timeout before confirmation. Retry with the SAME Idempotency-Key to avoid double-charging.',
        });
      }

      const existing = idempotencyStore.get(cleanKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new WalletApiError({
            status: 422,
            code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
            message: `Idempotency-Key "${cleanKey}" was already used for a different recipient or amount.`,
          });
        }

        const originalTx = transactions.find((tx) => tx.id === existing.transactionId);
        if (originalTx) {
          originalTx.replayCount += 1;
          return {
            status: 200,
            outcome: 'idempotent_replay',
            transaction: { ...originalTx },
            balanceCents,
          };
        }
      }

      if (amountCents <= 0) {
        throw new WalletApiError({
          status: 400,
          code: 'INVALID_AMOUNT',
          message: 'Payment amount must be greater than $0.00.',
        });
      }

      if (amountCents > balanceCents) {
        throw new WalletApiError({
          status: 402,
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient available wallet balance for this payment.',
        });
      }

      balanceCents -= amountCents;
      const newTx = {
        id: `tx_${9000 + transactions.length + 1}`,
        type: 'debit',
        counterparty: cleanRecipient,
        memo: memo.trim() || 'Wallet transfer',
        amountCents,
        status: 'settled',
        idempotencyKey: cleanKey,
        replayCount: 0,
        createdAt: new Date().toISOString(),
      };

      transactions = [newTx, ...transactions];
      idempotencyStore.set(cleanKey, {
        fingerprint,
        transactionId: newTx.id,
      });

      return {
        status: 201,
        outcome: 'created',
        transaction: { ...newTx },
        balanceCents,
      };
    },
  };
}
