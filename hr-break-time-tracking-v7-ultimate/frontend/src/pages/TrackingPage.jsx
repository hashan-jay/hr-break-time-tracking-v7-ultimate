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
  isOffShift,
  offShiftReason,
  startLimitReached,
  startLimitReason,
  typeFields,
} from '../lib/breakHelpers';

function BreakTypeBoard({
  title,
  subtitle,
  breakType,
  limitMinutes,
  startLimit,
  employees,
  selectedId,
  onSelect,
  onToggle,
  onOut,
  onIn,
  busy,
  emptyLabel,
}) {
  const selected = employees.find((e) => e.employeeId === selectedId) || null;
  const selectedFields = selected ? typeFields(selected, breakType) : null;
  const onThisBreak = selectedFields?.isOnThisBreak;
  const blockedByOther = selected?.isOnBreak && !onThisBreak;
  const offShift = selected ? isOffShift(selected) : false;
  const startBlocked = selected ? startLimitReached(selected, breakType, startLimit) : false;
  const captureLocked = Boolean(blockedByOther || (offShift && !onThisBreak) || (startBlocked && !onThisBreak));

  return (
    <section className="portal-roster-section break-type-board tracking-roster">
      <header className="portal-roster-section__head">
        <div>
          <h2>{title}</h2>
          <p>
            {subtitle} Daily limit <strong>{limitMinutes ?? '—'} min</strong>
          </p>
        </div>
        <div className="portal-onbreak-chip">
          On break <strong>{employees.filter((e) => typeFields(e, breakType).isOnThisBreak).length}</strong>
        </div>
      </header>

      <aside className="capture-panel tracking-capture">
        <h2>Capture {title}</h2>
        {selected && selectedFields ? (
          <>
            <div className="selected-employee">
              <strong>{selected.fullName}</strong>
              <span>{selected.employeeCode} · {selected.departmentName}</span>
              <StatusBadge status={selectedFields.status} color={selectedFields.statusColor} />
              <div className="selected-meta">
                <div>
                  This shift {breakType.toLowerCase()} total:{' '}
                  <strong>{selectedFields.totalDisplay}</strong>
                </div>
                <div>
                  {onThisBreak
                    ? `Out since ${formatLocalClock(selected.currentOutTime)} · open ${formatElapsed(selected.currentBreakElapsedSeconds)}`
                    : blockedByOther
                      ? `Currently on ${selected.currentBreakType} break — end that first`
                      : offShift
                        ? offShiftReason(selected)
                        : startBlocked
                          ? startLimitReason(selected, breakType)
                          : 'Currently in office'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`btn ${onThisBreak ? 'btn-in' : 'btn-out'} btn-xl`}
              disabled={busy || captureLocked}
              onClick={() => onToggle(breakType)}
            >
              {onThisBreak
                ? `End ${breakType} break (Space / Enter)`
                : `Start ${breakType} break (Enter / Space)`}
            </button>
            <div className="capture-split">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || selected.isOnBreak || offShift || startBlocked}
                onClick={() => onOut(breakType)}
              >
                Out only (O)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || !onThisBreak}
                onClick={() => onIn(breakType)}
              >
                In only (I)
              </button>
            </div>
            <p className="hint">
              Meal and Comfort are tracked separately. Only one break can be open at a time.
            </p>
          </>
        ) : (
          <p className="hint">Select an employee from the list to capture {breakType.toLowerCase()} break time.</p>
        )}
      </aside>

      <div className="portal-board portal-roster">
        <div className="portal-board__table">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
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
                const startBlocked = startLimitReached(e, breakType, startLimit);
                const selectable = canSelectForCapture(e, breakType);
                const lockReason = blocked
                  ? `On ${e.currentBreakType} break — end that first`
                  : offShift
                    ? offShiftReason(e)
                    : startBlocked
                      ? startLimitReason(e, breakType)
                      : undefined;
                return (
                  <tr
                    key={`${breakType}-${e.employeeId}`}
                    className={[
                      selectedId === e.employeeId ? 'selected' : '',
                      fields.isOnThisBreak ? 'on-break' : '',
                      blocked ? 'on-other-break' : '',
                      offShift && !fields.isOnThisBreak ? 'off-shift' : '',
                      startBlocked && !fields.isOnThisBreak && !offShift && !blocked ? 'start-limit-reached' : '',
                    ].filter(Boolean).join(' ')}
                    aria-disabled={selectable ? undefined : 'true'}
                    title={lockReason}
                    onClick={() => {
                      if (selectable) onSelect(e.employeeId);
                    }}
                  >
                    <td className="col-code">{e.employeeCode}</td>
                    <td className="col-name">{e.fullName}</td>
                    <td>{e.departmentName}</td>
                    <td className={`tracking-time${fields.isOnThisBreak ? ' is-live-total' : ''}`}>
                      <strong>{fields.totalDisplay}</strong>
                    </td>
                    <td><StatusBadge status={fields.status} color={fields.statusColor} /></td>
                    <td>
                      {fields.isOnThisBreak
                        ? `On ${breakType.toLowerCase()} break (${formatElapsed(e.currentBreakElapsedSeconds)}) · out ${formatLocalClock(e.currentOutTime)}`
                        : blocked
                          ? `On ${e.currentBreakType} break`
                          : offShift
                            ? 'Off shift'
                            : 'In office'}
                    </td>
                  </tr>
                );
              })}
              {!employees.length && (
                <tr><td colSpan={6} className="empty">{emptyLabel}</td></tr>
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

function OnBreakNowBar({ employees, onOpen }) {
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
                <span className="onbreak-now__out">Out since {formatLocalClock(e.currentOutTime)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExceededShiftBoard({ employees }) {
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
              <tr key={e.employeeId} className={e.isOnBreak ? 'on-break' : undefined}>
                <td>{e.employeeCode}</td>
                <td className="col-name">{e.fullName}</td>
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
                <td colSpan={9} className="empty">No one has exceeded a break limit on this shift.</td>
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

  const capture = useCallback(async (mode, breakType) => {
    if (busyRef.current) return;
    const employeeId = breakType === BREAK_TYPES.MEAL ? selectedMealId : selectedComfortId;
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
    const limit = breakType === BREAK_TYPES.MEAL ? board?.mealStartLimit : board?.comfortStartLimit;
    if (employee && (mode === 'toggle' || mode === 'out') && startLimitReached(employee, breakType, limit)) {
      toast.error(startLimitReason(employee, breakType));
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
      toast.error(/start limit/i.test(raw) ? startLimitReason(employee, breakType) : raw);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [selectedMealId, selectedComfortId, load, employeesView, board, toast]);

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
            onOpen={(e) => {
              if (e.currentBreakType === BREAK_TYPES.MEAL) {
                setActiveType(BREAK_TYPES.MEAL);
                setSelectedMealId(e.employeeId);
              } else {
                setActiveType(BREAK_TYPES.COMFORT);
                setSelectedComfortId(e.employeeId);
              }
            }}
          />
          <div className="break-type-stack tracking-break-stack">
            <div className={`break-type-focus ${activeType === BREAK_TYPES.MEAL ? 'is-active' : ''}`}>
              <BreakTypeBoard
                title="Meal Break"
                subtitle="Lunch / meal time tracking."
                breakType={BREAK_TYPES.MEAL}
                limitMinutes={board?.mealLimitMinutes}
                startLimit={board?.mealStartLimit}
                employees={mealEmployees}
                selectedId={selectedMealId}
                onSelect={(id) => {
                  setActiveType(BREAK_TYPES.MEAL);
                  setSelectedMealId(id);
                }}
                onToggle={(t) => capture('toggle', t)}
                onOut={(t) => capture('out', t)}
                onIn={(t) => capture('in', t)}
                busy={busy}
                emptyLabel="No employees found."
              />
            </div>

            <div className={`break-type-focus ${activeType === BREAK_TYPES.COMFORT ? 'is-active' : ''}`}>
              <BreakTypeBoard
                title="Comfort Break"
                subtitle="Short comfort break tracking."
                breakType={BREAK_TYPES.COMFORT}
                limitMinutes={board?.comfortLimitMinutes}
                startLimit={board?.comfortStartLimit}
                employees={comfortEmployees}
                selectedId={selectedComfortId}
                onSelect={(id) => {
                  setActiveType(BREAK_TYPES.COMFORT);
                  setSelectedComfortId(id);
                }}
                onToggle={(t) => capture('toggle', t)}
                onOut={(t) => capture('out', t)}
                onIn={(t) => capture('in', t)}
                busy={busy}
                emptyLabel="No employees found."
              />
            </div>
          </div>
        </>
      )}

      {listView === 'exceeded' && (
        <ExceededShiftBoard employees={exceededEmployees} />
      )}
    </div>
  );
}
