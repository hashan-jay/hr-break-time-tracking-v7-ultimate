import { formatGeneratedAt } from '../lib/downloadReport';

function formatWhen(value) {
  if (!value) return '—';
  const text = String(value).trim();
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function AuditReportDocument({ report }) {
  if (!report) return null;

  const generatedAt = formatGeneratedAt();

  return (
    <div className="break-report-document">
      <header className="break-report-document__header print-header">
        <h1>HR Break Time Tracking</h1>
        <h2>Audit Log Report</h2>
        <p>Generated {generatedAt} (PC local time)</p>
      </header>

      <section className="break-report-document__meta print-section">
        <div>
          <span>Period from</span>
          <strong>{report.from}</strong>
        </div>
        <div>
          <span>Period to</span>
          <strong>{report.to}</strong>
        </div>
        <div>
          <span>Total entries</span>
          <strong>{report.totalEntries}</strong>
        </div>
        <div>
          <span>Distinct users</span>
          <strong>{report.distinctUsers}</strong>
        </div>
        <div>
          <span>Distinct actions</span>
          <strong>{report.distinctActions}</strong>
        </div>
      </section>

      {!!report.actionCounts?.length && (
        <section className="print-section">
          <h3 className="break-report-document__section-title">Action summary</h3>
          <table className="break-report-document__table print-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {report.actionCounts.map((item) => (
                <tr key={item.action}>
                  <td>{item.action}</td>
                  <td>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="print-section">
        <h3 className="break-report-document__section-title">Audit entries</h3>
        <table className="break-report-document__table print-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Employee</th>
              <th>Out time</th>
              <th>In time</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {(report.rows || []).map((row) => (
              <tr key={row.id}>
                <td>{formatWhen(row.createdAt)}</td>
                <td>{row.employeeName || '—'}</td>
                <td>{formatWhen(row.outTime)}</td>
                <td>{formatWhen(row.inTime)}</td>
                <td>{row.userName || row.userId || '—'}</td>
                <td>{row.action}</td>
                <td>
                  {row.entityType}
                  {row.entityId ? ` #${row.entityId}` : ''}
                </td>
                <td>{row.details || '—'}</td>
              </tr>
            ))}
            {!report.rows?.length && (
              <tr>
                <td colSpan={8}>No audit entries for the selected dates.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="break-report-document__footer">
        Developer audit trail for HR Break Time Tracking. Times shown in PC local time.
      </footer>
    </div>
  );
}

export function renderAuditReportHtml(report) {
  const generatedAt = formatGeneratedAt();
  const summaryRows = (report.actionCounts || [])
    .map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${item.count}</td></tr>`)
    .join('');

  const detailRows = (report.rows || [])
    .map((row) => `<tr>
      <td>${escapeHtml(formatWhen(row.createdAt))}</td>
      <td>${escapeHtml(row.employeeName || '—')}</td>
      <td>${escapeHtml(formatWhen(row.outTime))}</td>
      <td>${escapeHtml(formatWhen(row.inTime))}</td>
      <td>${escapeHtml(row.userName || row.userId || '—')}</td>
      <td>${escapeHtml(row.action)}</td>
      <td>${escapeHtml(`${row.entityType}${row.entityId ? ` #${row.entityId}` : ''}`)}</td>
      <td>${escapeHtml(row.details || '—')}</td>
    </tr>`)
    .join('');

  return `
    <h1>HR Break Time Tracking</h1>
    <h2>Audit Log Report</h2>
    <p>Generated ${escapeHtml(generatedAt)} (PC local time)</p>
    <div class="meta">
      <div><span>Period from</span><strong>${escapeHtml(report.from)}</strong></div>
      <div><span>Period to</span><strong>${escapeHtml(report.to)}</strong></div>
      <div><span>Total entries</span><strong>${report.totalEntries}</strong></div>
      <div><span>Distinct users</span><strong>${report.distinctUsers}</strong></div>
      <div><span>Distinct actions</span><strong>${report.distinctActions}</strong></div>
    </div>
    <h3>Action summary</h3>
    <table>
      <thead><tr><th>Action</th><th>Count</th></tr></thead>
      <tbody>
        ${summaryRows || '<tr><td colspan="2">No actions in range.</td></tr>'}
      </tbody>
    </table>
    <h3>Audit entries</h3>
    <table>
      <thead>
        <tr>
          <th>When</th><th>Employee</th><th>Out time</th><th>In time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${detailRows || '<tr><td colspan="8">No audit entries for the selected dates.</td></tr>'}
      </tbody>
    </table>
    <div class="footer">
      Developer audit trail for HR Break Time Tracking. Times shown in PC local time.
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
