/**
 * Reusable status banner for loading, empty, error, success, and info UI states.
 */
export function StateBanner({
  variant = 'info',
  title,
  message,
  actionLabel,
  onAction,
}) {
  const isError = variant === 'error';
  const role = isError ? 'alert' : 'status';

  return (
    <div className={`state-banner state-banner--${variant}`} role={role}>
      <div className="state-banner__content">
        <strong className="state-banner__title">{title}</strong>
        {message && <p className="state-banner__message">{message}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
