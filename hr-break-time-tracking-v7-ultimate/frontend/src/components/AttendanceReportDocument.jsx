import { formatGeneratedAt } from '../lib/downloadReport';

function statusClass(color) {
  if (color === 'green') return 'status-green';
  if (color === 'red') return 'status-red';
  return '';
}

function formatWhen(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ');
  return parsed.toLocaleString();
}

export function absentNote(report) {
  if (!report) return '';
  const pending = Number(report.pendingShiftDays) || 0;
  if (pending > 0 && !report.absentIncluded) {
    return 'Absent names stay out of this report until one hour before each shift ends.';
  }
  if (pending > 0) {
    const label = pending === 1 ? 'shift day' : 'shift days';
    return `Absent names are included only for shifts in their final hour or already finished. ${pending} ${label} still hide absent names.`;
  }
  return 'Absent names are included. Every shift in this range has reached its final hour or has ended.';
}

export function attendanceRowsForReport(report, showAbsentRows) {
  const rows = report?.rows || [];
  if (showAbsentRows) return rows;
  return rows.filter((row) => row.status !== 'ABSENT');
}

/**
 * A4 printable attendance report. Rows match the live attendance rules.
 * Present and absent counts are always included. Absent names follow showAbsentRows.
 */
export function renderAttendanceReportHtml(report, filters, options = {}) {
  const showAbsentRows = options.showAbsentRows !== false;
  const generatedAt = formatGeneratedAt();
  const deptLabel = filters?.departmentName || 'All departments';
  const empLabel = filters?.employeeName || 'All employees';
  const shiftLabel = filters?.shiftName || report.shiftDisplay || report.shiftName || 'All shifts';
  const note = absentNote(report);
  const presentCount = report.presentCount ?? 0;
  const absentCount = report.absentCount ?? 0;
  const recordNote = showAbsentRows
    ? 'Absent records are listed below.'
    : 'Absent records are hidden. The absent count above still includes them.';
  const rows = attendanceRowsForReport(report, showAbsentRows)
    .map((row) => `<tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.employeeCode)}</td>
        <td>${escapeHtml(row.employeeName)}</td>
        <td>${escapeHtml(row.departmentName)}</td>
        <td>${escapeHtml(row.shiftDisplay || row.shiftName || '—')}</td>
        <td>${escapeHtml(row.breakSummary || '—')}</td>
        <td>${escapeHtml(formatWhen(row.lastEndedAt))}</td>
        <td class="${statusClass(row.statusColor)}">${escapeHtml(row.status)}</td>
      </tr>`)
    .join('');

  return `
    <h1>HR Break Time Tracking</h1>
    <h2>Attendance</h2>
    <p>Generated ${escapeHtml(generatedAt)} (PC local time)</p>
    <div class="meta">
      <div><span>Shift start from</span><strong>${escapeHtml(report.from)}</strong></div>
      <div><span>Shift start to</span><strong>${escapeHtml(report.to)}</strong></div>
      <div><span>Shift</span><strong>${escapeHtml(shiftLabel)}</strong></div>
      <div><span>Department</span><strong>${escapeHtml(deptLabel)}</strong></div>
      <div><span>Employee</span><strong>${escapeHtml(empLabel)}</strong></div>
      <div><span>Present</span><strong>${presentCount}</strong></div>
      <div><span>Absent</span><strong>${absentCount}</strong></div>
      <div><span>Absent records</span><strong>${showAbsentRows ? 'Shown' : 'Hidden'}</strong></div>
    </div>
    <div class="kpis">
      <div class="kpi"><strong>${presentCount}</strong><span>PRESENT</span></div>
      <div class="kpi"><strong>${absentCount}</strong><span>ABSENT</span></div>
    </div>
    <p>${escapeHtml(note)} ${escapeHtml(recordNote)} Present means a meal or comfort break was started and ended on that shift.</p>
    <h3>Attendance</h3>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Code</th><th>Employee</th><th>Department</th><th>Shift</th>
          <th>Breaks ended</th><th>Last ended</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="8">${showAbsentRows ? 'No attendance rows for the selected filters.' : 'Absent records are hidden. Present and absent counts are shown above.'}</td></tr>`}
      </tbody>
    </table>
    <div class="footer">
      Present: ${presentCount} · Absent: ${absentCount}.
      ${escapeHtml(recordNote)}
      ${escapeHtml(note)}
      A completed meal or comfort break marks the employee present for that shift day.
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
