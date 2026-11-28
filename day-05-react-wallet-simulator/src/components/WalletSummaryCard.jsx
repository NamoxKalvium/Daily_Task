/**
 * Reusable metric card displaying a single wallet KPI and optional tone/footer.
 */
export function WalletSummaryCard({
  label,
  value,
  subtitle,
  tone = 'neutral',
  isLoading = false,
}) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <span className="summary-card__label">{label}</span>
      {isLoading ? (
        <div className="skeleton skeleton--metric" aria-label={`Loading ${label}`} />
      ) : (
        <strong className="summary-card__value">{value}</strong>
      )}
      {subtitle && <span className="summary-card__subtitle">{subtitle}</span>}
    </article>
  );
}
