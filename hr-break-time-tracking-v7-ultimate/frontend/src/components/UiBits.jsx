export function MessageBar({ message, type = 'info', onClose }) {
  if (!message) return null;
  return (
    <div className={`message-bar message-${type}`} role="status">
      <span>{message}</span>
      {onClose && (
        <button type="button" className="message-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status, color }) {
  return <span className={`status-badge status-${color}`}>{status}</span>;
}

export function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card tone-${tone || 'neutral'}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }) {
  return <div className="loading-block">{label}</div>;
}
