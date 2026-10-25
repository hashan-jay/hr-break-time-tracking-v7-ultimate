import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { apiErrorMessage } from '../api/client';
import { useLiveUpdates } from '../api/liveUpdates';
import { useAuth } from '../auth/AuthContext';
import { StatusBadge } from '../components/UiBits';
import StaffMenuSelect from '../components/StaffMenuSelect';
import { useFeedback } from '../feedback/FeedbackContext';
import { downloadHtmlReport, formatGeneratedAt, printHtmlReport } from '../lib/downloadReport';
import { useTheme } from '../theme/ThemeContext';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function entityId(item) {
  const value = item?.id ?? item?.Id;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
}

function formatRate(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}%`;
}

function formatDay(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatWhen(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ');
  return parsed.toLocaleString();
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function viewLabel(view) {
  if (view === 'watch') return 'At the limit';
  if (view === 'all') return 'Everyone';
  return 'Over limit';
}

function peopleReportHtml(report, rows, { view, query, shiftLabel, departmentLabel }) {
  const generatedAt = formatGeneratedAt();
  const listLabel = viewLabel(view);
  const searchLabel = query.trim() || 'None';
  const body = rows.length
    ? rows.map((row) => `<tr>
        <td>${escapeHtml(row.employeeCode)}</td>
        <td>${escapeHtml(row.fullName)}</td>
        <td>${escapeHtml(row.departmentName)}</td>
        <td>${escapeHtml(row.shiftName)}</td>
        <td>${escapeHtml(row.holidayDays)} / ${escapeHtml(row.holidayDayLimit)}</td>
        <td>${escapeHtml(row.excessDays)}</td>
        <td>${escapeHtml(row.presentDays)}</td>
        <td>${escapeHtml(row.pendingDays)}</td>
        <td>${escapeHtml(formatRate(row.attendanceRate))}</td>
        <td>${escapeHtml(formatDay(row.lastHolidayDate))}</td>
        <td class="${row.exceedsLimit ? 'status-red' : 'status-green'}">${row.exceedsLimit ? 'OVER LIMIT' : 'WITHIN LIMIT'}</td>
      </tr>`).join('')
    : '<tr><td colspan="11">No people match this list.</td></tr>';

  return `
    <h1>HR Break Time Tracking</h1>
    <h2>Attendance analytics — People</h2>
    <p>Generated ${escapeHtml(generatedAt)} (PC local time)</p>
    <div class="meta">
      <div><span>Month</span><strong>${escapeHtml(report.monthLabel)}</strong></div>
      <div><span>Shift</span><strong>${escapeHtml(shiftLabel)}</strong></div>
      <div><span>Department</span><strong>${escapeHtml(departmentLabel)}</strong></div>
      <div><span>List</span><strong>${escapeHtml(listLabel)}</strong></div>
      <div><span>Search</span><strong>${escapeHtml(searchLabel)}</strong></div>
      <div><span>Monthly holiday limit</span><strong>${escapeHtml(report.holidayDayLimit)} days</strong></div>
      <div><span>People in this list</span><strong>${rows.length}</strong></div>
      <div><span>Over the limit</span><strong>${escapeHtml(report.exceededCount)}</strong></div>
    </div>
    <div class="kpis">
      <div class="kpi"><strong>${escapeHtml(report.exceededCount)}</strong><span>OVER LIMIT</span></div>
      <div class="kpi"><strong>${escapeHtml(report.withinLimitCount)}</strong><span>WITHIN LIMIT</span></div>
      <div class="kpi"><strong>${escapeHtml(report.holidayDayCount)}</strong><span>HOLIDAY DAYS</span></div>
      <div class="kpi"><strong>${escapeHtml(formatRate(report.attendanceRate))}</strong><span>ATTENDANCE</span></div>
    </div>
    <p>${escapeHtml(report.ruleSummary)}</p>
    <h3>${escapeHtml(listLabel)}</h3>
    <table>
      <thead>
        <tr>
          <th>Code</th><th>Employee</th><th>Department</th><th>Shift</th>
          <th>Holiday days</th><th>Excess</th><th>Present</th><th>In progress</th>
          <th>Rate</th><th>Last holiday</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="footer">
      ${rows.length} people in ${escapeHtml(listLabel)} for ${escapeHtml(report.monthLabel)}.
      A holiday day is a confirmed absent shift day. The monthly limit is ${escapeHtml(report.holidayDayLimit)} days.
    </div>
  `;
}

function downloadCsv(filename, rows) {
  const header = [
    'Code',
    'Employee',
    'Department',
    'Shift',
    'Holiday days',
    'Limit',
    'Excess',
    'Present days',
    'Pending days',
    'Attendance',
    'Last holiday',
    'Status',
  ];
  const lines = [
    header.join(','),
    ...rows.map((row) => [
      row.employeeCode,
      row.fullName,
      row.departmentName,
      row.shiftName,
      row.holidayDays,
      row.holidayDayLimit,
      row.excessDays,
      row.presentDays,
      row.pendingDays,
      formatRate(row.attendanceRate),
      row.lastHolidayDate || '',
      row.exceedsLimit ? 'Over limit' : 'Within limit',
    ].map(csvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const SORTS = {
  fullName: (row) => row.fullName || '',
  departmentName: (row) => row.departmentName || '',
  shiftName: (row) => row.shiftName || '',
  holidayDays: (row) => row.holidayDays || 0,
  excessDays: (row) => row.excessDays || 0,
  presentDays: (row) => row.presentDays || 0,
  attendanceRate: (row) => (row.attendanceRate == null ? -1 : Number(row.attendanceRate)),
  lastHolidayDate: (row) => row.lastHolidayDate || '',
};

export default function AttendanceAnalyticsPage() {
  const { toast } = useFeedback();
  const { isDeveloper } = useAuth();
  const { isDark } = useTheme();
  const [month, setMonth] = useState(currentMonthValue);
  const [shiftId, setShiftId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [shifts, setShifts] = useState([]);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('over');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'excessDays', dir: 'desc' });
  const requestRef = useRef(0);

  useEffect(() => {
    api.get('/attendance/shifts')
      .then(({ data }) => setShifts(data || []))
      .catch((err) => toast.error(apiErrorMessage(err, 'Failed to load shifts.')));
  }, [toast]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const requestId = ++requestRef.current;
    if (!quiet) setBusy(true);
    try {
      const [yearText, monthText] = month.split('-');
      const params = {
        year: Number(yearText),
        month: Number(monthText),
      };
      if (shiftId) params.shiftId = Number(shiftId);
      if (departmentId) params.departmentId = Number(departmentId);
      const { data } = await api.get('/attendance/analytics', { params });
      if (requestId !== requestRef.current) return;
      setReport(data);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (!quiet) {
        setReport(null);
        toast.error(apiErrorMessage(err, 'Failed to load attendance analytics.'));
      }
    } finally {
      if (requestId === requestRef.current) setBusy(false);
    }
  }, [departmentId, month, shiftId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveUpdates(() => load({ quiet: true }));

  const people = report?.people || [];
  const limit = report?.holidayDayLimit ?? 0;
  const watchCount = people.filter((row) => !row.exceedsLimit && row.holidayDays === limit && limit > 0).length;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = people.filter((row) => {
      if (view === 'over' && !row.exceedsLimit) return false;
      if (view === 'watch' && (row.exceedsLimit || row.holidayDays !== limit || limit <= 0)) return false;
      if (!needle) return true;
      return [row.fullName, row.employeeCode, row.departmentName, row.shiftName]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
    const read = SORTS[sort.key] || SORTS.excessDays;
    const direction = sort.dir === 'asc' ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const left = read(a);
      const right = read(b);
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return String(a.fullName).localeCompare(String(b.fullName));
    });
  }, [limit, people, query, sort, view]);

  const chartData = useMemo(() => (report?.daily || []).map((day) => ({
    ...day,
    label: formatDay(day.date),
  })), [report]);

  const departments = report?.departments || [];
  const maxExceeded = Math.max(1, ...departments.map((row) => row.exceededCount || 0));
  const presentColor = isDark ? '#4ade80' : '#1f7a45';
  const holidayColor = isDark ? '#f87171' : '#b42318';
  const pendingColor = isDark ? '#7dd3fc' : '#1d4f91';
  const axis = isDark ? '#8b939e' : '#5d6b64';
  const grid = isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb';

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'fullName' || key === 'departmentName' || key === 'shiftName' ? 'asc' : 'desc' }
    ));
  };

  const sortLabel = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');

  const reportFileBase = () => {
    const label = (report?.monthLabel || month).replaceAll(' ', '-').toLowerCase();
    return `attendance-analytics-people-${label}-${view}`;
  };

  const shiftLabel = report?.shiftName || 'All active shifts';
  const departmentLabel = departmentId
    ? (report?.departmentOptions || []).find((item) => String(item.id) === String(departmentId))?.name || 'Selected department'
    : 'All departments';

  const reportBody = () => peopleReportHtml(report, rows, {
    view,
    query,
    shiftLabel,
    departmentLabel,
  });

  const exportRows = () => {
    downloadCsv(`${reportFileBase()}.csv`, rows);
  };

  const saveHtml = () => {
    if (!report) return;
    downloadHtmlReport(`${reportFileBase()}.html`, reportBody());
  };

  const printA4 = () => {
    if (!report) return;
    const opened = printHtmlReport(`Attendance analytics — ${report.monthLabel}`, reportBody());
    if (!opened) toast.error('Could not open the print dialog. Use Save HTML instead.');
  };

  return (
    <div className="page staff-console-page attendance-analytics">
      <header className="page-header">
        <div>
          <h1>Attendance Analytics</h1>
          <p>
            Monthly holiday days come from confirmed absences on the attendance roster.
            People over the developer-set monthly limit are listed first.
          </p>
        </div>
        <Link className="btn" to="/app/attendance">Daily attendance</Link>
      </header>

      <form className="toolbar report-filters attendance-analytics__filters" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label>
          Shift
          <StaffMenuSelect
            label="Shift"
            value={shiftId}
            onChange={setShiftId}
            options={[
              { value: '', label: 'All active shifts' },
              ...shifts.map((shift) => {
                const id = entityId(shift);
                return id ? { value: id, label: shift.displayLabel || shift.name } : null;
              }).filter(Boolean),
            ]}
          />
        </label>
        <label>
          Department
          <StaffMenuSelect
            label="Department"
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { value: '', label: 'All departments' },
              ...(report?.departmentOptions || []).map((department) => ({
                value: String(department.id),
                label: department.name,
              })),
            ]}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </form>

      {report && (
        <>
          <p className="hint analytics-rule">
            {report.ruleSummary}
            {' '}
            {isDeveloper ? (
              <Link to="/app/settings?section=holiday">Adjust the monthly limit in developer settings.</Link>
            ) : (
              'The monthly limit can be changed only by a Developer.'
            )}
          </p>

          <section className="analytics-kpis" aria-label="Attendance summary">
            <article className="headlines-metric">
              <span className="headlines-metric__label">Over the limit</span>
              <div className="headlines-metric__row">
                <strong className={report.exceededCount > 0 ? 'is-alert' : 'is-good'}>{report.exceededCount}</strong>
              </div>
              <p className="headlines-metric__note">{`More than ${report.holidayDayLimit} holiday ${report.holidayDayLimit === 1 ? 'day' : 'days'}`}</p>
            </article>
            <article className="headlines-metric">
              <span className="headlines-metric__label">Within limit</span>
              <div className="headlines-metric__row"><strong>{report.withinLimitCount}</strong></div>
              <p className="headlines-metric__note">{report.employeeCount} scheduled people</p>
            </article>
            <article className="headlines-metric">
              <span className="headlines-metric__label">Holiday days</span>
              <div className="headlines-metric__row"><strong>{report.holidayDayCount}</strong></div>
              <p className="headlines-metric__note">Confirmed absent shift days</p>
            </article>
            <article className="headlines-metric">
              <span className="headlines-metric__label">Attendance rate</span>
              <div className="headlines-metric__row"><strong>{formatRate(report.attendanceRate)}</strong></div>
              <p className="headlines-metric__note">{report.presentDayCount} present day records</p>
            </article>
            <article className="headlines-metric">
              <span className="headlines-metric__label">Still in progress</span>
              <div className="headlines-metric__row"><strong>{report.pendingDayCount}</strong></div>
              <p className="headlines-metric__note">Not counted as holiday yet</p>
            </article>
            <article className="headlines-metric">
              <span className="headlines-metric__label">Last updated</span>
              <div className="headlines-metric__row">
                <strong className="is-time">{formatWhen(report.generatedAt)}</strong>
              </div>
            </article>
          </section>

          <section className="staff-results headlines-card">
            <header className="list-panel__head">
              <div>
                <h2>{report.monthLabel}</h2>
                <p className="list-panel__hint">
                  {`Present, holiday, and still-open shift days${report.shiftName ? ` · ${report.shiftName}` : ' · all active shifts'}.`}
                </p>
              </div>
            </header>
            {chartData.length > 0 ? (
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: axis, fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 12 }} width={36} />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(20,84,45,0.06)' }}
                      contentStyle={{
                        borderRadius: 14,
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)',
                        background: isDark ? '#161b22' : '#fff',
                        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="present" name="Present" fill={presentColor} radius={[8, 8, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="holiday" name="Holiday" fill={holidayColor} radius={[8, 8, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="pending" name="In progress" fill={pendingColor} radius={[8, 8, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="hint">No scheduled shift days in this month yet.</p>
            )}
          </section>

          <section className="staff-results headlines-card">
            <header className="list-panel__head">
              <div>
                <h2>By department</h2>
                <p className="list-panel__hint">Teams with people over the monthly holiday limit.</p>
              </div>
            </header>
            {departments.length === 0 && <p className="hint">No department activity for this filter.</p>}
            <div className="analytics-dept-list">
              {departments.map((row) => (
                <div className="analytics-dept" key={row.departmentName}>
                  <div className="analytics-dept__name">
                    <strong>{row.departmentName}</strong>
                    <span>{row.employeeCount} people · {formatRate(row.attendanceRate)} attendance</span>
                  </div>
                  <div className="analytics-dept__track" aria-hidden="true">
                    <span style={{ width: `${Math.round(((row.exceededCount || 0) / maxExceeded) * 100)}%` }} />
                  </div>
                  <div className="analytics-dept__count">
                    <strong>{row.exceededCount}</strong>
                    <span>over · {row.holidayDays} days</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="staff-results headlines-card analytics-people">
            <header className="list-panel__head">
              <div>
                <h2>People</h2>
                <p className="list-panel__hint">
                  {report.exceededCount > 0
                    ? `${report.exceededCount} ${report.exceededCount === 1 ? 'person is' : 'people are'} over the ${limit}-day limit for ${report.monthLabel}.`
                    : `Nobody is over the ${limit}-day holiday limit for ${report.monthLabel}.`}
                </p>
              </div>
            </header>

            <div className="list-switch" role="tablist" aria-label="People lists">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'over'}
                className={`list-switch__btn${view === 'over' ? ' is-active' : ''}`}
                onClick={() => setView('over')}
              >
                Over limit
                <span className="list-switch__count">{report.exceededCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'watch'}
                className={`list-switch__btn${view === 'watch' ? ' is-active' : ''}`}
                onClick={() => setView('watch')}
              >
                At the limit
                <span className="list-switch__count">{watchCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'all'}
                className={`list-switch__btn${view === 'all' ? ' is-active' : ''}`}
                onClick={() => setView('all')}
              >
                Everyone
                <span className="list-switch__count">{people.length}</span>
              </button>
            </div>

            <div className="toolbar report-filters analytics-people-tools">
              <label>
                Search
                <input
                  type="search"
                  value={query}
                  placeholder="Name, code, department, shift"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="header-actions">
                <button type="button" className="btn btn-ghost" onClick={exportRows}>
                  Export CSV
                </button>
                <button type="button" className="btn btn-ghost" onClick={saveHtml}>
                  Save HTML
                </button>
                <button type="button" className="btn btn-primary" onClick={printA4}>
                  Print A4 Report
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('fullName')}>Employee{sortLabel('fullName')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('departmentName')}>Department{sortLabel('departmentName')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('shiftName')}>Shift{sortLabel('shiftName')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('holidayDays')}>Holiday days{sortLabel('holidayDays')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('excessDays')}>Excess{sortLabel('excessDays')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('presentDays')}>Present{sortLabel('presentDays')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('attendanceRate')}>Rate{sortLabel('attendanceRate')}</button></th>
                    <th><button type="button" className="analytics-sort" onClick={() => toggleSort('lastHolidayDate')}>Last holiday{sortLabel('lastHolidayDate')}</button></th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employeeId} className={row.exceedsLimit ? 'analytics-row-over' : undefined}>
                      <td data-label="Employee">
                        <strong>{row.fullName}</strong>
                        <div className="muted mono">{row.employeeCode}</div>
                      </td>
                      <td data-label="Department">{row.departmentName}</td>
                      <td data-label="Shift">{row.shiftName}</td>
                      <td data-label="Holiday days">{row.holidayDays} / {row.holidayDayLimit}</td>
                      <td data-label="Excess">{row.excessDays}</td>
                      <td data-label="Present">{row.presentDays}</td>
                      <td data-label="Rate">{formatRate(row.attendanceRate)}</td>
                      <td data-label="Last holiday">{formatDay(row.lastHolidayDate)}</td>
                      <td data-label="Status">
                        <StatusBadge
                          status={row.exceedsLimit ? 'OVER LIMIT' : 'WITHIN LIMIT'}
                          color={row.exceedsLimit ? 'red' : 'green'}
                        />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty">
                        {view === 'over'
                          ? 'No one has exceeded the monthly holiday limit for this filter.'
                          : view === 'watch'
                            ? 'No one is sitting exactly on the monthly holiday limit.'
                            : 'No scheduled people match this filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
