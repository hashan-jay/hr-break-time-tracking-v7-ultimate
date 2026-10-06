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

/**
 * A4 printable attendance report. Rows match the live attendance rules.
 */
export function renderAttendanceReportHtml(report, filters) {
  const generatedAt = formatGeneratedAt();
  const deptLabel = filters?.departmentName || 'All departments';
  const empLabel = filters?.employeeName || 'All employees';
  const shiftLabel = filters?.shiftName || report.shiftDisplay || report.shiftName || 'All shifts';
  const note = absentNote(report);
  const rows = (report.rows || [])
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
      <div><span>Present</span><strong>${report.presentCount ?? 0}</strong></div>
      <div><span>Absent</span><strong>${report.absentIncluded ? (report.absentCount ?? 0) : 'Hidden'}</strong></div>
    </div>
    <p>${escapeHtml(note)} Present means a meal or comfort break was started and ended on that shift.</p>
    <h3>Attendance</h3>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Code</th><th>Employee</th><th>Department</th><th>Shift</th>
          <th>Breaks ended</th><th>Last ended</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8">No attendance rows for the selected filters.</td></tr>'}
      </tbody>
    </table>
    <div class="footer">
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
