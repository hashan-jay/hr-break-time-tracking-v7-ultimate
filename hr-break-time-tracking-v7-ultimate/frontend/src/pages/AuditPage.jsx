import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import { renderAuditReportHtml } from '../components/AuditReportDocument';
import { downloadHtmlReport, printHtmlReport } from '../lib/downloadReport';
import { useFeedback } from '../feedback/FeedbackContext';

const todayIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function parseLocalDateTime(value) {
  if (!value) return null;
  const text = String(value).trim();
  // API sends PC-local wall-clock times without Z.
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatWhen(value) {
  const d = parseLocalDateTime(value);
  if (!d) return '—';
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

export default function AuditPage() {
  const { toast } = useFeedback();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/audit/report', {
        params: { from, to },
      });
      setReport(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to generate audit report.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    if (!report?.rows?.length) return;
    const header = ['When', 'Employee', 'OutTime', 'InTime', 'User', 'UserId', 'Action', 'EntityType', 'EntityId', 'Details', 'IpAddress'];
    const lines = report.rows.map((r) => [
      `"${formatWhen(r.createdAt)}"`,
      `"${(r.employeeName || '').replaceAll('"', '""')}"`,
      `"${formatWhen(r.outTime)}"`,
      `"${formatWhen(r.inTime)}"`,
      `"${(r.userName || '').replaceAll('"', '""')}"`,
      `"${r.userId || ''}"`,
      `"${r.action}"`,
      `"${r.entityType}"`,
      `"${r.entityId || ''}"`,
      `"${(r.details || '').replaceAll('"', '""')}"`,
      `"${r.ipAddress || ''}"`,
    ].join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printA4 = () => {
    if (!report) return;
    const opened = printHtmlReport(
      `audit-report-${from}-to-${to}`,
      renderAuditReportHtml(report),
    );
    if (!opened) {
      toast.error('Could not open the print dialog. Use Save HTML instead.');
    }
  };

  const saveHtml = () => {
    if (!report) return;
    downloadHtmlReport(
      `audit-report-${from}-to-${to}.html`,
      renderAuditReportHtml(report),
    );
  };

  return (
    <div className="page staff-console-page">
      <header className="page-header no-print">
        <div>
          <h1>Audit Log</h1>
          <p>Generate developer audit reports by date range. Print A4, save HTML, or export CSV.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!report?.rows?.length}>
            Export CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={saveHtml} disabled={!report}>
            Save HTML
          </button>
          <button type="button" className="btn btn-primary" onClick={printA4} disabled={!report}>
            Print A4 Report
          </button>
        </div>
      </header>

      <div className="toolbar report-filters no-print">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" onClick={load} disabled={busy}>
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {report && (
        <section className="staff-results headlines-card no-print">
          <header className="list-panel__head">
            <div>
              <h2>Audit results</h2>
              <p className="list-panel__hint">
                {report.from === report.to ? report.from : `${report.from} → ${report.to}`}
              </p>
            </div>
            <span className="header-stat-tile">
              <span>Entries</span>
              <strong>{report.totalEntries}</strong>
            </span>
          </header>
          <div className="stats-grid compact no-print">
            <div className="stat-card">
              <div className="stat-value">{report.totalEntries}</div>
              <div className="stat-label">Total entries</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{report.distinctUsers}</div>
              <div className="stat-label">Distinct users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{report.distinctActions}</div>
              <div className="stat-label">Distinct actions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{report.from === report.to ? report.from : `${report.from} → ${report.to}`}</div>
              <div className="stat-label">Report period</div>
            </div>
          </div>

          {!!report.actionCounts?.length && (
            <div className="table-wrap no-print">
              <table>
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
            </div>
          )}

          <div className="table-wrap no-print">
            <table>
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
                {report.rows.map((row) => (
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
                {!report.rows.length && (
                  <tr>
                    <td colSpan={8} className="empty">No audit entries for the selected dates.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
