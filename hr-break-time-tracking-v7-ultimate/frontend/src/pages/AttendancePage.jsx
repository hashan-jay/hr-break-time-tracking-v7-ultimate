import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import { useLiveUpdates } from '../api/liveUpdates';
import { StatusBadge } from '../components/UiBits';
import { useFeedback } from '../feedback/FeedbackContext';

const todayIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function entityId(item) {
  const value = item?.id ?? item?.Id;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
}

function formatWhen(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ');
  return parsed.toLocaleString();
}

function formatClock(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const text = String(value);
    return text.length >= 16 ? text.slice(11, 16) : text;
  }
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AttendancePage() {
  const { toast } = useFeedback();
  const [date, setDate] = useState(todayIso());
  const [shiftId, setShiftId] = useState('');
  const [shifts, setShifts] = useState([]);
  const [roster, setRoster] = useState(null);
  const [busy, setBusy] = useState(false);
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
      const params = { date };
      if (shiftId) params.shiftId = Number(shiftId);
      const { data } = await api.get('/attendance', { params });
      if (requestId !== requestRef.current) return;
      setRoster(data);
      if (!shiftId && data?.shiftId) setShiftId(String(data.shiftId));
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (!quiet) {
        setRoster(null);
        toast.error(apiErrorMessage(err, 'Failed to load attendance.'));
      }
    } finally {
      if (requestId === requestRef.current) setBusy(false);
    }
  }, [date, shiftId, toast]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ quiet: true }), 20000);
    return () => clearInterval(timer);
  }, [load]);

  useLiveUpdates(() => load({ quiet: true }));

  const present = roster?.present || [];
  const absent = roster?.absent || [];
  const revealLabel = formatClock(roster?.absentRevealAt);

  return (
    <div className="page staff-console-page">
      <header className="page-header">
        <div>
          <h1>Attendance</h1>
          <p>
            Present means a meal or comfort break was started and ended on the selected shift.
            The date is the day that shift starts. Today refreshes as breaks are closed.
          </p>
        </div>
      </header>

      <form className="toolbar report-filters" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label>
          Shift date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Shift
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            {shifts.length === 0 && <option value="">No shifts</option>}
            {shifts.map((shift) => {
              const id = entityId(shift);
              return id ? (
                <option key={id} value={id}>{shift.displayLabel || shift.name}</option>
              ) : null;
            })}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </form>

      {roster && (
        <>
          <section className="staff-results headlines-card">
            <header className="list-panel__head">
              <div>
                <h2>Present</h2>
                <p className="list-panel__hint">
                  {roster.shiftDisplay || roster.shiftName}
                  {' · '}
                  {roster.date}
                  {roster.showAbsent
                    ? ' · Absent is included because this shift is in its final hour or has ended.'
                    : revealLabel
                      ? ` · Absent stays hidden until ${revealLabel}, one hour before this shift ends.`
                      : ' · Absent stays hidden until one hour before this shift ends.'}
                </p>
              </div>
              <span className="header-stat-tile">
                <span>Present</span>
                <strong>{roster.presentCount ?? present.length}</strong>
              </span>
            </header>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Breaks ended</th>
                    <th>Last ended</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {present.map((row) => (
                    <tr key={row.employeeId}>
                      <td>{row.employeeCode}</td>
                      <td>{row.fullName}</td>
                      <td>{row.departmentName}</td>
                      <td>{row.breakSummary || '—'}</td>
                      <td>{formatWhen(row.lastEndedAt)}</td>
                      <td><StatusBadge status="PRESENT" color="green" /></td>
                    </tr>
                  ))}
                  {!present.length && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No one has finished a meal or comfort break for this shift yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {roster.showAbsent && (
            <section className="staff-results headlines-card">
              <header className="list-panel__head">
                <div>
                  <h2>Absent</h2>
                  <p className="list-panel__hint">
                    Active employees on this shift with no completed meal or comfort break.
                    This list opened at {revealLabel || 'one hour before the shift ends'}.
                  </p>
                </div>
                <span className="header-stat-tile">
                  <span>Absent</span>
                  <strong>{roster.absentCount ?? absent.length}</strong>
                </span>
              </header>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absent.map((row) => (
                      <tr key={row.employeeId}>
                        <td>{row.employeeCode}</td>
                        <td>{row.fullName}</td>
                        <td>{row.departmentName}</td>
                        <td><StatusBadge status="ABSENT" color="red" /></td>
                      </tr>
                    ))}
                    {!absent.length && (
                      <tr>
                        <td colSpan={4} className="empty">No absent employees for this shift.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
