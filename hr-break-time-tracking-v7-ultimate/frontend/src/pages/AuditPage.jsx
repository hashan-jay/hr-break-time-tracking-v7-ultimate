import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import AuditDetails from '../components/AuditDetails';
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
  const parts = formatWhenParts(value);
  if (!parts) return '—';
  return `${parts.date}, ${parts.time}`;
}

function formatWhenParts(value) {
  const d = parseLocalDateTime(value);
  if (!d) return null;
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  };
}

const ENTITY_LABELS = {
  ShiftDepartmentBreakLimit: 'Shift limits',
  DepartmentStartLimits: 'Start limits',
  SystemSetting: 'Setting',
  BreakSession: 'Break',
  BreakTimeAdjustment: 'Time adjustment',
  RolePermission: 'Role access',
  UserPermission: 'User access',
};

function entityLabel(entityType) {
  return ENTITY_LABELS[entityType] || entityType || 'Record';
}

function actionTone(action) {
  const text = String(action || '').toLowerCase();
  if (text.includes('delete') || text.includes('deactivat') || text.includes('reset')) return 'danger';
  if (text.includes('login') || text.includes('create') || text.includes('recover') || text.includes('activat')) return 'good';
  if (text.includes('break')) return 'time';
  if (text.includes('update') || text.includes('adjust') || text.includes('password')) return 'change';
  return 'neutral';
}

function WhenCell({ value }) {
  const parts = formatWhenParts(value);
  if (!parts) {
    return (
      <span className="audit-log__when is-empty">
        <strong>—</strong>
      </span>
    );
  }
  return (
    <span className="audit-log__when">
      <span>{parts.date}</span>
      <strong>{parts.time}</strong>
    </span>
  );
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
        <section className="staff-results headlines-card audit-results no-print">
          <header className="list-panel__head">
            <div>
              <h2>Audit results</h2>
              <p className="list-panel__hint">
                {report.from === report.to ? report.from : `${report.from} → ${report.to}`}
              </p>
            </div>
            <span className="passcodes-panel__count">{report.totalEntries}</span>
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
            <div className="audit-actions" aria-label="Actions in this report">
              {report.actionCounts.map((item) => (
                <div key={item.action} className={`audit-actions__item audit-actions__item--${actionTone(item.action)}`}>
                  <span>{item.action}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="audit-log">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Employee</th>
                  <th>Out</th>
                  <th>In</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id}>
                    <td><WhenCell value={row.createdAt} /></td>
                    <td className="audit-log__employee">{row.employeeName || <span className="audit-log__empty">—</span>}</td>
                    <td><WhenCell value={row.outTime} /></td>
                    <td><WhenCell value={row.inTime} /></td>
                    <td>
                      <div className="audit-log__who">
                        <span className="audit-log__user">{row.userName || row.userId || '—'}</span>
                        {row.ipAddress && <span className="audit-log__ip">{row.ipAddress}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`audit-action audit-action--${actionTone(row.action)}`}>{row.action}</span>
                    </td>
                    <td>
                      <div className="audit-log__entity">
                        <span>{entityLabel(row.entityType)}</span>
                        <small>
                          {row.entityType}
                          {row.entityId ? ` #${row.entityId}` : ''}
                        </small>
                      </div>
                    </td>
                    <td className="audit-log__details">
                      <AuditDetails details={row.details} />
                    </td>
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
