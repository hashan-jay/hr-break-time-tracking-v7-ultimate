import { useEffect, useMemo, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import StaffMenuSelect from '../components/StaffMenuSelect';
import { StatusBadge } from '../components/UiBits';
import { renderBreakReportHtml } from '../components/BreakReportDocument';
import { absentNote, splitAttendanceRows, renderAttendanceReportHtml } from '../components/AttendanceReportDocument';
import { downloadHtmlReport, printHtmlReport } from '../lib/downloadReport';
import { useFeedback } from '../feedback/FeedbackContext';

const todayIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function entityId(item) {
  const value = item?.id ?? item?.Id ?? item?.employeeId ?? item?.departmentId;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
}

function queryId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function formatWhen(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ');
  return parsed.toLocaleString();
}

function csvText(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function attendanceCsvLines(rows) {
  return rows.map((row) => [
    row.date,
    csvText(row.employeeCode),
    csvText(row.employeeName),
    csvText(row.departmentName),
    csvText(row.shiftDisplay || row.shiftName || ''),
    csvText(row.breakSummary || ''),
    csvText(row.lastEndedAt ? formatWhen(row.lastEndedAt) : ''),
    row.status,
  ].join(','));
}

function AttendancePeopleTable({ title, rows, empty }) {
  return (
    <div className="attendance-table-block">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Code</th>
              <th>Employee</th>
              <th>Department</th>
              <th>Shift</th>
              <th>Breaks ended</th>
              <th>Last ended</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.date}-${row.shiftId}-${row.employeeId}`}>
                <td data-label="Date">{row.date}</td>
                <td data-label="Code">{row.employeeCode}</td>
                <td data-label="Employee">{row.employeeName}</td>
                <td data-label="Department">{row.departmentName}</td>
                <td data-label="Shift">{row.shiftDisplay || row.shiftName || '—'}</td>
                <td data-label="Breaks ended">{row.breakSummary || '—'}</td>
                <td data-label="Last ended">{formatWhen(row.lastEndedAt)}</td>
                <td data-label="Status"><StatusBadge status={row.status} color={row.statusColor} /></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} className="empty">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { toast } = useFeedback();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [report, setReport] = useState(null);
  const [attendanceReport, setAttendanceReport] = useState(null);
  const [kind, setKind] = useState('breaks');
  const [showAbsentPeople, setShowAbsentPeople] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/departments'),
      api.get('/employees', { params: { includeDeactivated: true } }),
      api.get('/shifts'),
    ]).then(([d, e, s]) => {
      setDepartments(d.data || []);
      setEmployees(e.data || []);
      setShifts(s.data || []);
    }).catch((err) => {
      toast.error(apiErrorMessage(err, 'Failed to load filters.'));
    });
  }, []);

  const employeeOptions = useMemo(() => {
    const dept = queryId(departmentId);
    return (employees || []).filter((emp) => {
      if (!dept) return true;
      const empDept = Number(emp.departmentId ?? emp.DepartmentId);
      return empDept === dept;
    });
  }, [employees, departmentId]);

  const shiftOptions = useMemo(() => ([
    { value: '', label: 'All shifts' },
    ...shifts.map((shift) => {
      const id = entityId(shift);
      return id ? { value: id, label: shift.displayLabel || shift.name } : null;
    }).filter(Boolean),
  ]), [shifts]);

  const departmentOptions = useMemo(() => ([
    { value: '', label: 'All' },
    ...departments.map((department) => {
      const id = entityId(department);
      return id ? { value: id, label: department.name } : null;
    }).filter(Boolean),
  ]), [departments]);

  const employeeSelectOptions = useMemo(() => ([
    { value: '', label: 'All' },
    ...employeeOptions.map((emp) => {
      const id = entityId(emp);
      if (!id) return null;
      const code = emp.employeeCode ? ` (${emp.employeeCode})` : '';
      const deactivated = emp.isDeactivated ? ' — deactivated' : '';
      return { value: id, label: `${emp.fullName}${code}${deactivated}` };
    }).filter(Boolean),
  ]), [employeeOptions]);

  const onDepartmentChange = (next) => {
    setDepartmentId(next);
    const stillVisible = (employees || []).some((emp) => {
      if (entityId(emp) !== employeeId) return false;
      if (!queryId(next)) return true;
      return Number(emp.departmentId ?? emp.DepartmentId) === queryId(next);
    });
    if (!stillVisible) setEmployeeId('');
  };

  const filters = useMemo(() => ({
    departmentName: departments.find((d) => entityId(d) === String(departmentId))?.name,
    employeeName: employees.find((e) => entityId(e) === String(employeeId))?.fullName,
    shiftName: shifts.find((s) => entityId(s) === String(shiftId))?.displayLabel
      || report?.shiftDisplay
      || report?.shiftName,
  }), [departments, employees, shifts, departmentId, employeeId, shiftId, report]);

  const reportParams = () => ({
    from,
    to: to || from,
    fromDate: from,
    toDate: to || from,
    departmentId: queryId(departmentId),
    employeeId: queryId(employeeId),
    shiftId: queryId(shiftId),
  });

  const loadBreaks = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/reports/breaks', { params: reportParams() });
      setReport(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to generate report.'));
    } finally {
      setBusy(false);
    }
  };

  const loadAttendance = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/reports/attendance', { params: reportParams() });
      setAttendanceReport(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to generate attendance report.'));
    } finally {
      setBusy(false);
    }
  };

  const load = async (event) => {
    event?.preventDefault?.();
    if (kind === 'attendance') await loadAttendance();
    else await loadBreaks();
  };

  useEffect(() => {
    loadBreaks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadCsv = (filename, header, lines) => {
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBreakCsv = () => {
    if (!report?.rows?.length) return;
    const header = [
      'Period', 'Code', 'Employee', 'Department', 'Shift',
      'MealTotal', 'MealSeconds', 'MealStatus',
      'ComfortTotal', 'ComfortSeconds', 'ComfortStatus',
    ];
    const lines = report.rows.map((r) => [
      `"${r.periodLabel || r.date || ''}"`,
      r.employeeCode,
      `"${r.employeeName}"`,
      `"${r.departmentName}"`,
      `"${r.shiftName || ''}"`,
      r.mealBreakDisplay,
      r.mealBreakSeconds,
      `"${r.mealStatus}"`,
      r.comfortBreakDisplay,
      r.comfortBreakSeconds,
      `"${r.comfortStatus}"`,
    ].join(','));
    downloadCsv(`break-report-${from}-to-${to || from}.csv`, header, lines);
  };

  const exportAttendanceCsv = () => {
    if (!attendanceReport) return;
    const presentCount = attendanceReport.presentCount ?? 0;
    const absentCount = attendanceReport.absentCount ?? 0;
    const header = ['Date', 'Code', 'Employee', 'Department', 'Shift', 'BreaksEnded', 'LastEnded', 'Status'];
    const { present, notYet, absent } = splitAttendanceRows(attendanceReport);
    const notYetCount = attendanceReport.notYetCount ?? notYet.length;
    const sections = [
      'Present',
      header.join(','),
      ...attendanceCsvLines(present),
    ];
    if (notYet.length) {
      sections.push('', 'NotYet', header.join(','), ...attendanceCsvLines(notYet));
    }
    if (showAbsentPeople) {
      sections.push('', 'Absent', header.join(','), ...attendanceCsvLines(absent));
    }
    const summary = [
      `Present,${presentCount}`,
      `Absent,${absentCount}`,
      `NotYet,${notYetCount}`,
      `AbsentRecords,${showAbsentPeople ? 'Shown' : 'Hidden'}`,
      '',
    ];
    const blob = new Blob(
      [[...summary, ...sections].join('\n')],
      { type: 'text/csv;charset=utf-8;' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${from}-to-${to || from}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (kind === 'attendance') exportAttendanceCsv();
    else exportBreakCsv();
  };

  const printA4 = () => {
    const title = kind === 'attendance'
      ? `attendance-report-${from}-to-${to || from}`
      : `break-report-${from}-to-${to || from}`;
    const html = kind === 'attendance'
      ? (attendanceReport ? renderAttendanceReportHtml(attendanceReport, filters, { showAbsentRows: showAbsentPeople }) : null)
      : (report ? renderBreakReportHtml(report, filters) : null);
    if (!html) return;
    const opened = printHtmlReport(title, html);
    if (!opened) {
      toast.error('Could not open the print dialog. Use Save HTML instead.');
    }
  };

  const saveHtml = () => {
    if (kind === 'attendance') {
      if (!attendanceReport) return;
      downloadHtmlReport(
        `attendance-report-${from}-to-${to || from}.html`,
        renderAttendanceReportHtml(attendanceReport, filters, { showAbsentRows: showAbsentPeople }),
      );
      return;
    }
    if (!report) return;
    downloadHtmlReport(
      `break-report-${from}-to-${to || from}.html`,
      renderBreakReportHtml(report, filters),
    );
  };

  const printable = kind === 'attendance' ? attendanceReport : report;
  const exportable = kind === 'attendance' ? Boolean(attendanceReport) : report?.rows?.length;
  const { present: presentRows, notYet: notYetRows, absent: absentRows } = splitAttendanceRows(attendanceReport);
  const attendanceHint = absentNote(attendanceReport);

  return (
    <div className="page staff-console-page reports-page">
      <header className="page-header no-print">
        <div>
          <h1>Reports</h1>
          <p>
            {kind === 'attendance'
              ? 'Generate attendance for a shift-start range. Present is a finished meal or comfort break. Absent names appear only in the last hour of each shift. Export CSV, save HTML, or print A4 from here.'
              : 'Choose shift start dates, shift, department, and/or employee, then Generate. A date range lists each employee day by day. A single day still shows one row per employee.'}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!exportable}>
            Export CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={saveHtml} disabled={!printable}>
            Save HTML
          </button>
          <button type="button" className="btn btn-primary" onClick={printA4} disabled={!printable}>
            Print A4 Report
          </button>
        </div>
      </header>

      <div className="list-switch reports-kind no-print" role="tablist" aria-label="Report type">
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'breaks'}
          className={`list-switch__btn${kind === 'breaks' ? ' is-active' : ''}`}
          onClick={() => setKind('breaks')}
        >
          Break totals
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'attendance'}
          className={`list-switch__btn${kind === 'attendance' ? ' is-active' : ''}`}
          onClick={() => {
            setKind('attendance');
            if (!attendanceReport) loadAttendance();
          }}
        >
          Attendance
        </button>
      </div>

      <form className="toolbar report-filters no-print" onSubmit={load}>
        <label>
          Shift start from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Shift start to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Shift
          <StaffMenuSelect
            label="Shift"
            value={shiftId}
            onChange={setShiftId}
            options={shiftOptions}
          />
        </label>
        <label>
          Department
          <StaffMenuSelect
            label="Department"
            value={departmentId}
            onChange={onDepartmentChange}
            options={departmentOptions}
          />
        </label>
        <label>
          Employee
          <StaffMenuSelect
            label="Employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={employeeSelectOptions}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {kind === 'attendance' && attendanceReport && (
        <section className="staff-results headlines-card no-print">
          <header className="list-panel__head attendance-results__head">
            <div>
              <h2>Attendance results</h2>
              <p className="list-panel__hint">
                {attendanceHint}
                {employeeId ? ' Every day in this range is listed for the selected employee. A day still before the final hour of that shift is Not yet, not Absent.' : ''}
                {(attendanceReport.shiftDisplay || attendanceReport.shiftName || filters.shiftName) ? (
                  <> · Shift: <strong>{attendanceReport.shiftDisplay || attendanceReport.shiftName || filters.shiftName}</strong></>
                ) : <> · Shift: <strong>All shifts</strong></>}
                {filters.departmentName ? <> · Department: <strong>{filters.departmentName}</strong></> : null}
                {filters.employeeName ? <> · Employee: <strong>{filters.employeeName}</strong></> : null}
              </p>
            </div>
            <div className="attendance-results__tools">
              <label className="absent-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={showAbsentPeople}
                  onChange={(event) => setShowAbsentPeople(event.target.checked)}
                  aria-label="Show absent people"
                />
                <span className="absent-switch__track" aria-hidden="true" />
                <span className="absent-switch__label">Show absent</span>
              </label>
              <span className="header-stat-tile">
                <span>Present</span>
                <strong>{attendanceReport.presentCount ?? 0}</strong>
              </span>
              <span className="header-stat-tile">
                <span>Absent</span>
                <strong>{attendanceReport.absentCount ?? 0}</strong>
              </span>
              <span className="header-stat-tile">
                <span>Not yet</span>
                <strong>{attendanceReport.notYetCount ?? notYetRows.length}</strong>
              </span>
            </div>
          </header>

          <div className="stats-grid compact no-print">
            <div className="stat-card tone-green">
              <div className="stat-value">{attendanceReport.presentCount ?? 0}</div>
              <div className="stat-label">PRESENT</div>
            </div>
            <div className="stat-card tone-red">
              <div className="stat-value">{attendanceReport.absentCount ?? 0}</div>
              <div className="stat-label">ABSENT</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{attendanceReport.notYetCount ?? notYetRows.length}</div>
              <div className="stat-label">NOT YET</div>
            </div>
          </div>

          <AttendancePeopleTable
            title="Present"
            rows={presentRows}
            empty="No present people for the selected filters."
          />
          {notYetRows.length > 0 && (
            <AttendancePeopleTable
              title="Not yet"
              rows={notYetRows}
              empty="No days are still waiting on the shift."
            />
          )}
          {showAbsentPeople && (
            <AttendancePeopleTable
              title="Absent"
              rows={absentRows}
              empty="No absent people for the shifts that have reached their final hour."
            />
          )}
        </section>
      )}

      {kind === 'breaks' && report && (
        <section className="staff-results headlines-card no-print">
          <header className="list-panel__head">
            <div>
              <h2>Report results</h2>
              <p className="list-panel__hint">
                Limits — Meal: <strong>{report.mealLimitMinutes} min</strong>
                {' · '}Comfort: <strong>{report.comfortLimitMinutes} min</strong>
                {(report.shiftDisplay || report.shiftName) ? (
                  <> · Shift: <strong>{report.shiftDisplay || report.shiftName}</strong></>
                ) : null}
                {filters.departmentName ? <> · Department: <strong>{filters.departmentName}</strong></> : null}
                {filters.employeeName ? <> · Employee: <strong>{filters.employeeName}</strong></> : null}
              </p>
            </div>
            <span className="header-stat-tile">
              <span>Employees</span>
              <strong>{report.employeeDays}</strong>
            </span>
          </header>

          <div className="stats-grid compact no-print">
            <div className="stat-card"><div className="stat-value">{report.employeeDays}</div><div className="stat-label">Employees</div></div>
            <div className="stat-card tone-green"><div className="stat-value">{report.mealWellSatisfiedCount}</div><div className="stat-label">Meal WELL SATISFIED</div></div>
            <div className="stat-card tone-red"><div className="stat-value">{report.mealExceededCount}</div><div className="stat-label">Meal EXCEEDED BREAK TIME LIMIT</div></div>
            <div className="stat-card tone-green"><div className="stat-value">{report.comfortWellSatisfiedCount}</div><div className="stat-label">Comfort WELL SATISFIED</div></div>
            <div className="stat-card tone-red"><div className="stat-value">{report.comfortExceededCount}</div><div className="stat-label">Comfort EXCEEDED BREAK TIME LIMIT</div></div>
          </div>

          <div className="table-wrap no-print">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Code</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Shift</th>
                  <th>Meal total</th>
                  <th>Meal status</th>
                  <th>Comfort total</th>
                  <th>Comfort status</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={`${r.employeeId}-${r.date}-${r.periodLabel || ''}`}>
                    <td data-label="Period">{r.periodLabel || r.date}</td>
                    <td data-label="Code">{r.employeeCode}</td>
                    <td data-label="Employee">{r.employeeName}</td>
                    <td data-label="Department">{r.departmentName}</td>
                    <td data-label="Shift">{r.shiftName || '—'}</td>
                    <td data-label="Meal total">{r.mealBreakDisplay}</td>
                    <td data-label="Meal status"><StatusBadge status={r.mealStatus} color={r.mealStatusColor} /></td>
                    <td data-label="Comfort total">{r.comfortBreakDisplay}</td>
                    <td data-label="Comfort status"><StatusBadge status={r.comfortStatus} color={r.comfortStatusColor} /></td>
                  </tr>
                ))}
                {!report.rows.length && (
                  <tr><td colSpan={9} className="empty">No records for the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
