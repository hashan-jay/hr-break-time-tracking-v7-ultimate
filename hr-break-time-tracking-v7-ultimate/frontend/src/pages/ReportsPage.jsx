import { useEffect, useMemo, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import { StatusBadge } from '../components/UiBits';
import { renderBreakReportHtml } from '../components/BreakReportDocument';
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

  const filters = useMemo(() => ({
    departmentName: departments.find((d) => entityId(d) === String(departmentId))?.name,
    employeeName: employees.find((e) => entityId(e) === String(employeeId))?.fullName,
    shiftName: shifts.find((s) => entityId(s) === String(shiftId))?.displayLabel
      || report?.shiftDisplay
      || report?.shiftName,
  }), [departments, employees, shifts, departmentId, employeeId, shiftId, report]);

  const load = async (event) => {
    event?.preventDefault?.();
    setBusy(true);
    try {
      const { data } = await api.get('/reports/breaks', {
        params: {
          from,
          to: to || from,
          fromDate: from,
          toDate: to || from,
          departmentId: queryId(departmentId),
          employeeId: queryId(employeeId),
          shiftId: queryId(shiftId),
        },
      });
      setReport(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to generate report.'));
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
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `break-report-${from}-to-${to || from}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printA4 = () => {
    if (!report) return;
    const opened = printHtmlReport(
      `break-report-${from}-to-${to || from}`,
      renderBreakReportHtml(report, filters),
    );
    if (!opened) {
      toast.error('Could not open the print dialog. Use Save HTML instead.');
    }
  };

  const saveHtml = () => {
    if (!report) return;
    downloadHtmlReport(
      `break-report-${from}-to-${to || from}.html`,
      renderBreakReportHtml(report, filters),
    );
  };

  return (
    <div className="page staff-console-page">
      <header className="page-header no-print">
        <div>
          <h1>Reports</h1>
          <p>
            Choose shift start dates, shift, department, and/or employee, then Generate.
            A date range lists each employee day by day. A single day still shows one row per employee.
          </p>
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
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">All shifts</option>
            {shifts.map((s) => {
              const id = entityId(s);
              return id ? <option key={id} value={id}>{s.displayLabel || s.name}</option> : null;
            })}
          </select>
        </label>
        <label>
          Department
          <select
            value={departmentId}
            onChange={(e) => {
              const next = e.target.value;
              setDepartmentId(next);
              const stillVisible = (employees || []).some((emp) => {
                if (entityId(emp) !== employeeId) return false;
                if (!queryId(next)) return true;
                return Number(emp.departmentId ?? emp.DepartmentId) === queryId(next);
              });
              if (!stillVisible) setEmployeeId('');
            }}
          >
            <option value="">All</option>
            {departments.map((d) => {
              const id = entityId(d);
              return id ? <option key={id} value={id}>{d.name}</option> : null;
            })}
          </select>
        </label>
        <label>
          Employee
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">All</option>
            {employeeOptions.map((emp) => {
              const id = entityId(emp);
              return id ? (
                <option key={id} value={id}>
                  {emp.fullName}{emp.employeeCode ? ` (${emp.employeeCode})` : ''}{emp.isDeactivated ? ' — deactivated' : ''}
                </option>
              ) : null;
            })}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {report && (
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
                    <td>{r.periodLabel || r.date}</td>
                    <td>{r.employeeCode}</td>
                    <td>{r.employeeName}</td>
                    <td>{r.departmentName}</td>
                    <td>{r.shiftName || '—'}</td>
                    <td>{r.mealBreakDisplay}</td>
                    <td><StatusBadge status={r.mealStatus} color={r.mealStatusColor} /></td>
                    <td>{r.comfortBreakDisplay}</td>
                    <td><StatusBadge status={r.comfortStatus} color={r.comfortStatusColor} /></td>
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
