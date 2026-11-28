/**
 * Formats integer cents as USD currency (e.g., 12540 -> "$125.40").
 */
export function formatCents(cents) {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

/**
 * Generates a unique client-side Idempotency-Key for safe payment retries.
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pay_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Formats an ISO timestamp into a short local time/date label.
 */
export function formatTimestamp(isoString) {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
