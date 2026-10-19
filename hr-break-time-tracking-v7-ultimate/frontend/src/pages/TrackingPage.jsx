import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import { useLiveUpdates } from '../api/liveUpdates';
import { LoadingBlock, StatusBadge } from '../components/UiBits';
import { useFeedback } from '../feedback/FeedbackContext';
import {
  BREAK_TYPES,
  canSelectForCapture,
  enrichEmployeesLive,
  formatElapsed,
  formatLocalClock,
  liveElapsedSeconds,
  parseLocalDateTime,
  isOffShift,
  offShiftReason,
  remainingStarts,
  typeFields,
} from '../lib/breakHelpers';

function shiftLabel(employee) {
  return employee?.shiftDisplay || employee?.shiftName || 'Unassigned';
}

function trackingButtonState(employee, breakType) {
  const fields = typeFields(employee, breakType);
  const offShift = isOffShift(employee);
  const reason = fields.blockedByOther
    ? `On ${employee.currentBreakType} break — end that first`
    : offShift && !fields.isOnThisBreak
      ? offShiftReason(employee)
      : '';
  return {
    fields,
    onThisBreak: fields.isOnThisBreak,
    disabled: Boolean(!fields.isOnThisBreak && (fields.blockedByOther || offShift)),
    reason,
  };
}

function formatBreakStamp(value) {
  const d = parseLocalDateTime(value);
  if (!d) return '—';
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} ${time}`;
}

function takenDurationSeconds(session, nowMs) {
  if (session?.isOpen) return liveElapsedSeconds(session.outTime, nowMs, null);
  return Math.max(0, Number(session?.durationSeconds) || 0);
}

function TrackingEmployeeDialog({ employee, activeBreakType, busy, nowMs, onClose, onCapture, onActivate }) {
  const meal = trackingButtonState(employee, BREAK_TYPES.MEAL);
  const comfort = trackingButtonState(employee, BREAK_TYPES.COMFORT);
  const mealLeft = remainingStarts(employee, BREAK_TYPES.MEAL, employee.mealStartLimit);
  const comfortLeft = remainingStarts(employee, BREAK_TYPES.COMFORT, employee.comfortStartLimit);
  const [taken, setTaken] = useState([]);
  const [takenState, setTakenState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setTakenState('loading');
    api.get(`/breaks/employee/${employee.employeeId}/taken`)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (Array.isArray(data) ? data : [])
          .filter((row) => row.startedByEmployee !== false)
          .slice()
          .sort((a, b) => String(a.outTime || '').localeCompare(String(b.outTime || '')));
        setTaken(rows);
        setTakenState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setTaken([]);
        setTakenState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [employee.employeeId, employee.isOnBreak, employee.currentOutTime]);

  const mealTaken = taken.filter((row) => row.breakType === BREAK_TYPES.MEAL);
  const comfortTaken = taken.filter((row) => row.breakType !== BREAK_TYPES.MEAL);
  const mealTakenSeconds = mealTaken.reduce((sum, row) => sum + takenDurationSeconds(row, nowMs), 0);
  const comfortTakenSeconds = comfortTaken.reduce((sum, row) => sum + takenDurationSeconds(row, nowMs), 0);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.target?.closest('button, a, input, select, textarea')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate(activeBreakType);
        onCapture('toggle', activeBreakType);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeBreakType, onActivate, onCapture, onClose]);

  const press = (breakType) => {
    onActivate(breakType);
    onCapture('toggle', breakType);
  };

  return (
    <div
      className="confirm-overlay portal-employee-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="portal-employee-dialog tracking-employee-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-employee-dialog-title"
      >
        <header className="portal-employee-dialog__head">
          <div className="portal-employee-dialog__title">
            <p className="portal-employee-dialog__eyebrow">Employee details</p>
            <h2 id="tracking-employee-dialog-title">{employee.fullName}</h2>
          </div>
          <button
            type="button"
            className="portal-employee-dialog__close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="portal-employee-dialog__body">
          <aside className="portal-employee-dialog__details">
            <div className="portal-detail-card">
              <div className="portal-detail-field">
                <span className="portal-detail-label">Code</span>
                <strong className="portal-detail-value">{employee.employeeCode || '—'}</strong>
              </div>
              <div className="portal-detail-field">
                <span className="portal-detail-label">Employee</span>
                <strong className="portal-detail-value">{employee.fullName || '—'}</strong>
              </div>
              <div className="portal-detail-field">
                <span className="portal-detail-label">Department</span>
                <strong className="portal-detail-value">{employee.departmentName || '—'}</strong>
              </div>
              <div className="portal-detail-field">
                <span className="portal-detail-label">This shift</span>
                <strong className="portal-detail-value">{shiftLabel(employee)}</strong>
              </div>
            </div>
          </aside>

          <div className="portal-break-actions">
            <div className="portal-break-action-wrap">
              <div className="portal-break-action-slot">
                <span
                  className="portal-break-remaining portal-break-remaining--meal"
                  title="Meal breaks left this shift"
                  aria-label={`Limits Left ${mealLeft}`}
                >
                  <span className="portal-break-remaining__label">Limits Left</span>
                  <span className="portal-break-remaining__count">{mealLeft}</span>
                </span>
                <button
                  type="button"
                  className={`portal-break-action ${meal.onThisBreak ? 'portal-break-action--end' : 'portal-break-action--start'}`}
                  disabled={busy || meal.disabled}
                  title={meal.reason || undefined}
                  onClick={() => press(BREAK_TYPES.MEAL)}
                >
                  <span className="portal-break-action__verb">{meal.onThisBreak ? 'END' : 'START'}</span>
                  <span className="portal-break-action__type">MEAL</span>
                  <span className="portal-break-action__noun">BREAK</span>
                </button>
              </div>
              <p className={`portal-break-used${meal.onThisBreak ? ' is-live' : ''}`}>
                Meal used
                <strong>{meal.fields.totalDisplay}</strong>
              </p>
            </div>
            <div className="portal-break-action-wrap">
              <div className="portal-break-action-slot">
                <button
                  type="button"
                  className={`portal-break-action ${comfort.onThisBreak ? 'portal-break-action--end' : 'portal-break-action--start'}`}
                  disabled={busy || comfort.disabled}
                  title={comfort.reason || undefined}
                  onClick={() => press(BREAK_TYPES.COMFORT)}
                >
                  <span className="portal-break-action__verb">{comfort.onThisBreak ? 'END' : 'START'}</span>
                  <span className="portal-break-action__type">COMFORT</span>
                  <span className="portal-break-action__noun">BREAK</span>
                </button>
                <span
                  className="portal-break-remaining portal-break-remaining--comfort"
                  title="Comfort breaks left this shift"
                  aria-label={`Limits Left ${comfortLeft}`}
                >
                  <span className="portal-break-remaining__label">Limits Left</span>
                  <span className="portal-break-remaining__count">{comfortLeft}</span>
                </span>
              </div>
              <p className={`portal-break-used${comfort.onThisBreak ? ' is-live' : ''}`}>
                Comfort used
                <strong>{comfort.fields.totalDisplay}</strong>
              </p>
            </div>
          </div>

          <section className="tracking-break-log" aria-label="Breaks taken this shift">
            <header className="tracking-break-log__head">
              <div>
                <h3>Breaks taken this shift</h3>
                <p>Start, end, and time taken for meal and comfort breaks the employee started.</p>
              </div>
              <div className="tracking-break-log__totals">
                <span>Meal <strong>{formatElapsed(mealTakenSeconds)}</strong> · {mealTaken.length}</span>
                <span>Comfort <strong>{formatElapsed(comfortTakenSeconds)}</strong> · {comfortTaken.length}</span>
              </div>
            </header>
            <div className="tracking-break-log__table">
              <table>
                <thead>
                  <tr>
                    <th>Break</th>
                    <th>Started</th>
                    <th>Ended</th>
                    <th>Time taken</th>
                  </tr>
                </thead>
                <tbody>
                  {takenState === 'loading' && (
                    <tr><td colSpan={4} className="empty">Loading breaks…</td></tr>
                  )}
                  {takenState === 'error' && (
                    <tr><td colSpan={4} className="empty">Could not load the breaks this employee started.</td></tr>
                  )}
                  {takenState === 'ready' && !taken.length && (
                    <tr><td colSpan={4} className="empty">No meal or comfort breaks started by this employee this shift.</td></tr>
                  )}
                  {takenState === 'ready' && taken.map((row, index) => (
                    <tr key={row.id ?? `${row.breakType}-${row.outTime}-${index}`} className={row.isOpen ? 'on-break' : undefined}>
                      <td>{row.breakType === BREAK_TYPES.MEAL ? 'Meal' : 'Comfort'}</td>
                      <td className="tracking-break-log__time">{formatBreakStamp(row.outTime)}</td>
                      <td className="tracking-break-log__time">{row.isOpen ? 'On break' : formatBreakStamp(row.inTime)}</td>
                      <td className="tracking-break-log__time"><strong>{formatElapsed(takenDurationSeconds(row, nowMs))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LimitsLeftCell({ employee, mealStartLimit, comfortStartLimit }) {
  const mealLeft = remainingStarts(employee, BREAK_TYPES.MEAL, mealStartLimit);
  const comfortLeft = remainingStarts(employee, BREAK_TYPES.COMFORT, comfortStartLimit);
  return (
    <td className="tracking-limits-left">
      <span className="tracking-limits-left__row" title="Meal starts the employee can still begin on the portal this shift">
        <span className="tracking-limits-left__kind">Meal</span>
        <strong className={mealLeft === 0 ? 'is-none' : undefined}>{mealLeft}</strong>
      </span>
      <span className="tracking-limits-left__row" title="Comfort starts the employee can still begin on the portal this shift">
        <span className="tracking-limits-left__kind">Comfort</span>
        <strong className={comfortLeft === 0 ? 'is-none' : undefined}>{comfortLeft}</strong>
      </span>
    </td>
  );
}

function BreakTypeBoard({
  title,
  subtitle,
  breakType,
  limitMinutes,
  mealStartLimit,
  comfortStartLimit,
  employees,
  selectedId,
  onSelect,
  onInspect,
  emptyLabel,
}) {
  return (
    <section className="portal-roster-section break-type-board tracking-roster">
      <header className="portal-roster-section__head">
        <div>
          <h2>{title}</h2>
          <p>
            {subtitle} Daily limit <strong>{limitMinutes ?? '—'} min</strong>
          </p>
        </div>
        <div className={`portal-onbreak-chip${employees.filter((e) => typeFields(e, breakType).isOnThisBreak).length ? ' is-live' : ''}`}>
          <span className="portal-onbreak-chip__dot" aria-hidden="true" />
          On break <strong>{employees.filter((e) => typeFields(e, breakType).isOnThisBreak).length}</strong>
        </div>
      </header>

      <div className="portal-board portal-roster">
        <div className="portal-board__table">
          <table>
            <colgroup>
              <col className="tracking-col-code" />
              <col className="tracking-col-employee" />
              <col className="tracking-col-limits" />
              <col className="tracking-col-dept" />
              <col className="tracking-col-shift" />
              <col className="tracking-col-status" />
              <col className="tracking-col-state" />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Limits Left</th>
                <th>Department</th>
                <th>This shift</th>
                <th>Status</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const fields = typeFields(e, breakType);
                const blocked = fields.blockedByOther;
                const offShift = isOffShift(e);
                const selectable = canSelectForCapture(e, breakType);
                const lockReason = blocked
                  ? `On ${e.currentBreakType} break — end that first`
                  : offShift
                    ? offShiftReason(e)
                    : undefined;
                return (
                  <tr
                    key={`${breakType}-${e.employeeId}`}
                    className={[
                      selectedId === e.employeeId ? 'selected' : '',
                      fields.isOnThisBreak ? 'on-break' : '',
                      blocked ? 'on-other-break' : '',
                      offShift && !fields.isOnThisBreak ? 'off-shift' : '',
                      'is-clickable',
                    ].filter(Boolean).join(' ')}
                    aria-disabled={selectable ? undefined : 'true'}
                    title={lockReason}
                    onClick={() => {
                      onInspect?.(e, breakType);
                      if (selectable) onSelect(e.employeeId);
                    }}
                  >
                    <td className="col-code">{e.employeeCode}</td>
                    <td className="col-name">{e.fullName}</td>
                    <LimitsLeftCell
                      employee={e}
                      mealStartLimit={mealStartLimit}
                      comfortStartLimit={comfortStartLimit}
                    />
                    <td>{e.departmentName}</td>
                    <td className={`tracking-time${fields.isOnThisBreak ? ' is-live-total' : ''}`}>
                      <strong>{fields.totalDisplay}</strong>
                    </td>
                    <td><StatusBadge status={fields.status} color={fields.statusColor} /></td>
                    <td className="tracking-state" title={
                      fields.isOnThisBreak
                        ? `On ${breakType.toLowerCase()} break (${formatElapsed(e.currentBreakElapsedSeconds)}) · out ${formatLocalClock(e.currentOutTime)}`
                        : blocked
                          ? `On ${e.currentBreakType} break`
                          : offShift
                            ? offShiftReason(e)
                            : 'In office'
                    }>
                      <span className={`tracking-state__pill${fields.isOnThisBreak ? ' is-live' : ''}${blocked ? ' is-other' : ''}${offShift && !fields.isOnThisBreak ? ' is-off' : ''}`}>
                        {fields.isOnThisBreak
                          ? 'On break'
                          : blocked
                            ? 'Other break'
                            : offShift
                              ? 'Off shift'
                              : 'In office'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!employees.length && (
                <tr><td colSpan={7} className="empty">{emptyLabel}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const EXCEEDED = 'EXCEEDED BREAK TIME LIMIT';

function sortLiveFirst(employees, breakType) {
  return [...employees].sort((a, b) => {
    const aOn = typeFields(a, breakType).isOnThisBreak ? 0 : 1;
    const bOn = typeFields(b, breakType).isOnThisBreak ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''));
  });
}

function isExceeded(employee) {
  return employee.mealStatus === EXCEEDED || employee.comfortStatus === EXCEEDED;
}

function OnBreakNowBar({ employees, mealStartLimit, comfortStartLimit, onOpen }) {
  const live = employees.filter((e) => e.isOnBreak);
  return (
    <section className="onbreak-now headlines-card" aria-label="People currently on break">
      <header className="onbreak-now__head">
        <div>
          <h2>On break now</h2>
          <p>People away from the floor. Select a card to capture their return.</p>
        </div>
        <span className="header-stat-tile onbreak-now__count">
          <span>Live</span>
          <strong>{live.length}</strong>
        </span>
      </header>
      {live.length === 0 ? (
        <p className="onbreak-now__empty">Nobody is on a meal or comfort break right now.</p>
      ) : (
        <div className="onbreak-now__grid">
          {live.map((e) => {
            const isMeal = e.currentBreakType === BREAK_TYPES.MEAL;
            return (
              <button
                key={e.employeeId}
                type="button"
                className={`onbreak-now__card${isMeal ? ' is-meal' : ' is-comfort'}`}
                onClick={() => onOpen?.(e)}
              >
                <span className={`onbreak-now__type${isMeal ? ' is-meal' : ' is-comfort'}`}>
                  {isMeal ? 'Meal break' : 'Comfort break'}
                </span>
                <strong className="onbreak-now__name">{e.fullName}</strong>
                <span className="onbreak-now__meta">{e.employeeCode} · {e.departmentName}</span>
                <span className="onbreak-now__timer">{formatElapsed(e.currentBreakElapsedSeconds)}</span>
                <span className="onbreak-now__limits">
                  Limits Left
                  <strong>Meal {remainingStarts(e, BREAK_TYPES.MEAL, mealStartLimit)}</strong>
                  <strong>Comfort {remainingStarts(e, BREAK_TYPES.COMFORT, comfortStartLimit)}</strong>
                </span>
                <span className="onbreak-now__out">Out since {formatLocalClock(e.currentOutTime)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExceededShiftBoard({ employees, mealStartLimit, comfortStartLimit, onInspect }) {
  return (
    <section className="exceeded-board headlines-card" aria-label="Employees over break limits">
      <header className="exceeded-board__head">
        <div>
          <h2>Over limit this shift</h2>
          <p>Employees who have gone past their meal or comfort limit on the current shift, with their live totals.</p>
        </div>
        <span className="header-stat-tile">
          <span>Over limit</span>
          <strong>{employees.length}</strong>
        </span>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Employee</th>
              <th>Limits Left</th>
              <th>Department</th>
              <th>Shift</th>
              <th>Meal this shift</th>
              <th>Meal status</th>
              <th>Comfort this shift</th>
              <th>Comfort status</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr
                key={e.employeeId}
                className={e.isOnBreak ? 'on-break is-clickable' : 'is-clickable'}
                onClick={() => onInspect?.(e)}
              >
                <td>{e.employeeCode}</td>
                <td className="col-name">{e.fullName}</td>
                <LimitsLeftCell
                  employee={e}
                  mealStartLimit={mealStartLimit}
                  comfortStartLimit={comfortStartLimit}
                />
                <td>{e.departmentName}</td>
                <td>{e.shiftDisplay || e.shiftName || '—'}</td>
                <td>
                  <strong>{e.mealBreakDisplay}</strong>
                  <div className="muted">{e.mealBreakSecondsToday}s · limit {e.mealLimitMinutes ?? '—'} min</div>
                </td>
                <td><StatusBadge status={e.mealStatus} color={e.mealStatusColor} /></td>
                <td>
                  <strong>{e.comfortBreakDisplay}</strong>
                  <div className="muted">{e.comfortBreakSecondsToday}s · limit {e.comfortLimitMinutes ?? '—'} min</div>
                </td>
                <td><StatusBadge status={e.comfortStatus} color={e.comfortStatusColor} /></td>
                <td>
                  {e.isOnBreak
                    ? `On ${String(e.currentBreakType || '').toLowerCase()} break (${formatElapsed(e.currentBreakElapsedSeconds)}) · out ${formatLocalClock(e.currentOutTime)}`
                    : e.isWithinShift === false
                      ? 'Off shift'
                      : 'In office'}
                </td>
              </tr>
            ))}
            {!employees.length && (
              <tr>
                <td colSpan={10} className="empty">No one has exceeded a break limit on this shift.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TrackingPage() {
  const { toast } = useFeedback();
  const [board, setBoard] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [shiftId2, setShiftId2] = useState('');
  const [listView, setListView] = useState('live');
  const [activeType, setActiveType] = useState(BREAK_TYPES.MEAL);
  const [selectedMealId, setSelectedMealId] = useState(null);
  const [selectedComfortId, setSelectedComfortId] = useState(null);
  const [detailEmployeeId, setDetailEmployeeId] = useState(null);
  const [detailSnapshot, setDetailSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const searchRef = useRef(null);
  const busyRef = useRef(false);
  const lastLoadError = useRef('');

  const load = useCallback(async () => {
    const liveRes = await api.get('/breaks/live', {
      params: {
        search: search || undefined,
        departmentId: departmentId || undefined,
        shiftId: shiftId || undefined,
        shiftId2: shiftId && shiftId2 ? shiftId2 : undefined,
      },
    });
    setBoard(liveRes.data);
    setNowMs(Date.now());
  }, [search, departmentId, shiftId, shiftId2]);

  useEffect(() => {
    Promise.all([api.get('/departments'), api.get('/shifts')])
      .then(([deptRes, shiftRes]) => {
        setDepartments(deptRes.data || []);
        setShifts(shiftRes.data || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await load();
        lastLoadError.current = '';
      } catch (err) {
        if (!cancelled) {
          const msg = apiErrorMessage(err, 'Failed to load live board.');
          if (lastLoadError.current !== msg) {
            lastLoadError.current = msg;
            toast.error(msg);
          }
        }
      }
    };
    run();
    const timer = setInterval(run, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, toast]);

  useLiveUpdates(() => {
    load().catch(() => {});
  });

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const employeesView = useMemo(
    () => enrichEmployeesLive(board?.employees, nowMs, {
      mealLimitMinutes: board?.mealLimitMinutes,
      comfortLimitMinutes: board?.comfortLimitMinutes,
    }),
    [board, nowMs],
  );
  const mealEmployees = useMemo(
    () => sortLiveFirst(employeesView, BREAK_TYPES.MEAL),
    [employeesView],
  );
  const comfortEmployees = useMemo(
    () => sortLiveFirst(employeesView, BREAK_TYPES.COMFORT),
    [employeesView],
  );
  const exceededEmployees = useMemo(
    () => employeesView.filter(isExceeded).sort((a, b) => {
      if (Boolean(a.isOnBreak) !== Boolean(b.isOnBreak)) return a.isOnBreak ? -1 : 1;
      return String(a.fullName || '').localeCompare(String(b.fullName || ''));
    }),
    [employeesView],
  );
  const detailEmployee = useMemo(() => {
    if (!detailEmployeeId) return null;
    return employeesView.find((e) => e.employeeId === detailEmployeeId) || detailSnapshot;
  }, [detailEmployeeId, detailSnapshot, employeesView]);
  const openEmployee = useCallback((employee, breakType) => {
    if (!employee) return;
    setDetailEmployeeId(employee.employeeId);
    setDetailSnapshot(employee);
    if (breakType === BREAK_TYPES.MEAL || breakType === BREAK_TYPES.COMFORT) {
      setActiveType(breakType);
    }
  }, []);
  const closeEmployee = useCallback(() => {
    setDetailEmployeeId(null);
    setDetailSnapshot(null);
  }, []);

  useEffect(() => {
    if (!board) return;
    const mealEmp = employeesView.find((e) => e.employeeId === selectedMealId);
    const comfortEmp = employeesView.find((e) => e.employeeId === selectedComfortId);
    if (selectedMealId && (!mealEmp || !canSelectForCapture(mealEmp, BREAK_TYPES.MEAL))) {
      setSelectedMealId(null);
    }
    if (selectedComfortId && (!comfortEmp || !canSelectForCapture(comfortEmp, BREAK_TYPES.COMFORT))) {
      setSelectedComfortId(null);
    }
  }, [board, employeesView, selectedMealId, selectedComfortId]);

  const capture = useCallback(async (mode, breakType, employeeIdOverride) => {
    if (busyRef.current) return;
    const employeeId = employeeIdOverride
      ?? (breakType === BREAK_TYPES.MEAL ? selectedMealId : selectedComfortId);
    if (!employeeId) {
      toast.error('Select an employee first.');
      return;
    }
    const employee = employeesView.find((e) => e.employeeId === employeeId);
    if (employee && !canSelectForCapture(employee, breakType) && mode !== 'in') {
      toast.error(isOffShift(employee)
        ? offShiftReason(employee)
        : `On ${employee.currentBreakType} break — end that first.`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const endpoint = mode === 'toggle' ? '/breaks/toggle' : mode === 'out' ? '/breaks/out' : '/breaks/in';
      const { data } = await api.post(endpoint, { employeeId, breakType });
      toast.success(
        data.isOnBreak
          ? `${breakType} out-time captured for ${data.fullName} at ${formatLocalClock(data.currentOutTime)}.`
          : `${breakType} in-time captured for ${data.fullName}.`,
      );
      await load();
    } catch (err) {
      const raw = apiErrorMessage(err, 'Capture failed.');
      toast.error(raw);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [selectedMealId, selectedComfortId, load, employeesView, toast]);

  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('.confirm-overlay')) return;
      if (e.target?.closest('button, a, input, select, textarea')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        capture('toggle', activeType);
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        capture('out', activeType);
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        capture('in', activeType);
      } else if (e.key === '/' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture, activeType]);

  if (!board) return <LoadingBlock label="Loading live tracking…" />;

  return (
    <div className="page tracking-page">
      <header className="page-header">
        <div>
          <h1>Live Tracking</h1>
          <p>
            Capture Meal Break and Comfort Break separately. On All shifts, only staff whose
            shift is live at this local time can start or end a break; others are greyed out.
            Limits Left counts only breaks employees start on the portal. Starting a break
            here does not reduce that number.
          </p>
        </div>
        <div className="header-stat-tiles">
          {board?.periodLabel && (
            <p className="header-stat-tiles__period">{board.periodLabel}</p>
          )}
          <div className="header-stat-tiles__row">
            <article className="header-stat-tile">
              <span>On break</span>
              <strong>{board?.onBreakCount ?? 0}</strong>
            </article>
            <article className="header-stat-tile">
              <span>Meal</span>
              <strong>{board?.mealOnBreakCount ?? 0}</strong>
            </article>
            <article className="header-stat-tile">
              <span>Comfort</span>
              <strong>{board?.comfortOnBreakCount ?? 0}</strong>
            </article>
          </div>
        </div>
      </header>

      <div className="portal-employee-filters tracking-filters">
        <label className="portal-employee-filter">
          <span>Shift</span>
          <select
            className="portal-board__shift"
            value={shiftId}
            onChange={(e) => {
              const next = e.target.value;
              setShiftId(next);
              if (!next || next === shiftId2) setShiftId2('');
            }}
            aria-label="Primary shift"
          >
            <option value="">All shifts</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.displayLabel || s.name}</option>
            ))}
          </select>
        </label>
        <label className="portal-employee-filter">
          <span>Overlap</span>
          <select
            className="portal-board__shift"
            value={shiftId2}
            onChange={(e) => setShiftId2(e.target.value)}
            disabled={!shiftId}
            aria-label="Overlapping shift"
          >
            <option value="">No overlap</option>
            {shifts.map((s) => {
              const locked = String(s.id) === String(shiftId);
              return (
                <option key={s.id} value={s.id} disabled={locked}>
                  {locked ? `${s.displayLabel || s.name} (selected)` : (s.displayLabel || s.name)}
                </option>
              );
            })}
          </select>
        </label>
        <label className="portal-employee-filter">
          <span>Department</span>
          <select
            className="portal-board__shift"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="portal-employee-filter portal-employee-filter--search">
          <span>Search</span>
          <div className="portal-ig-search">
            <svg className="portal-ig-search__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.75" />
              <path d="M16.2 16.2L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              className="portal-board__search"
              placeholder="Search employee / department…  (/ to focus)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
      </div>

      <div className="list-switch" role="tablist" aria-label="Live tracking views">
        <button
          type="button"
          role="tab"
          aria-selected={listView === 'live'}
          className={`list-switch__btn${listView === 'live' ? ' is-active' : ''}`}
          onClick={() => setListView('live')}
        >
          Live tracking
          <span className="list-switch__count">{employeesView.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listView === 'exceeded'}
          className={`list-switch__btn${listView === 'exceeded' ? ' is-active' : ''}`}
          onClick={() => setListView('exceeded')}
        >
          Over limit
          <span className="list-switch__count">{exceededEmployees.length}</span>
        </button>
      </div>

      {listView === 'live' && (
        <>
          <OnBreakNowBar
            employees={employeesView}
            mealStartLimit={board?.mealStartLimit}
            comfortStartLimit={board?.comfortStartLimit}
            onOpen={(e) => {
              const type = e.currentBreakType === BREAK_TYPES.COMFORT ? BREAK_TYPES.COMFORT : BREAK_TYPES.MEAL;
              openEmployee(e, type);
              if (type === BREAK_TYPES.MEAL) setSelectedMealId(e.employeeId);
              else setSelectedComfortId(e.employeeId);
            }}
          />
          <div className="break-type-stack tracking-break-stack">
            <div className={`break-type-focus ${activeType === BREAK_TYPES.MEAL ? 'is-active' : ''}`}>
              <BreakTypeBoard
                title="Meal Break"
                subtitle="Lunch / meal time tracking."
                breakType={BREAK_TYPES.MEAL}
                limitMinutes={board?.mealLimitMinutes}
                mealStartLimit={board?.mealStartLimit}
                comfortStartLimit={board?.comfortStartLimit}
                employees={mealEmployees}
                selectedId={selectedMealId}
                onSelect={(id) => {
                  setActiveType(BREAK_TYPES.MEAL);
                  setSelectedMealId(id);
                }}
                onInspect={openEmployee}
                emptyLabel="No employees found."
              />
            </div>

            <div className={`break-type-focus ${activeType === BREAK_TYPES.COMFORT ? 'is-active' : ''}`}>
              <BreakTypeBoard
                title="Comfort Break"
                subtitle="Short comfort break tracking."
                breakType={BREAK_TYPES.COMFORT}
                limitMinutes={board?.comfortLimitMinutes}
                mealStartLimit={board?.mealStartLimit}
                comfortStartLimit={board?.comfortStartLimit}
                employees={comfortEmployees}
                selectedId={selectedComfortId}
                onSelect={(id) => {
                  setActiveType(BREAK_TYPES.COMFORT);
                  setSelectedComfortId(id);
                }}
                onInspect={openEmployee}
                emptyLabel="No employees found."
              />
            </div>
          </div>
        </>
      )}

      {listView === 'exceeded' && (
        <ExceededShiftBoard
          employees={exceededEmployees}
          mealStartLimit={board?.mealStartLimit}
          comfortStartLimit={board?.comfortStartLimit}
          onInspect={openEmployee}
        />
      )}

      {detailEmployee && (
        <TrackingEmployeeDialog
          employee={detailEmployee}
          activeBreakType={activeType}
          busy={busy}
          nowMs={nowMs}
          onClose={closeEmployee}
          onCapture={(mode, breakType) => capture(mode, breakType, detailEmployee.employeeId)}
          onActivate={(breakType) => {
            setActiveType(breakType);
            if (!canSelectForCapture(detailEmployee, breakType) && !typeFields(detailEmployee, breakType).isOnThisBreak) return;
            if (breakType === BREAK_TYPES.MEAL) setSelectedMealId(detailEmployee.employeeId);
            else setSelectedComfortId(detailEmployee.employeeId);
          }}
        />
      )}
    </div>
  );
}
