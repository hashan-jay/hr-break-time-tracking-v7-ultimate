import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client';
import { useLiveUpdates } from '../api/liveUpdates';
import { useAuth } from '../auth/AuthContext';
import DialogWeather from '../components/DialogWeather';
import PortalClock from '../components/PortalClock';
import PortalCredits from '../components/PortalCredits';
import PasscodeModal from '../components/PasscodeModal';
import ThemeToggle from '../components/ThemeToggle';
import { StatusBadge } from '../components/UiBits';
import { useFeedback } from '../feedback/FeedbackContext';
import {
  BREAK_TYPES,
  enrichEmployeesLive,
  formatElapsed,
  formatLocalClock,
  isOffShift,
  offShiftReason,
  remainingBreakSeconds,
  remainingStarts,
  startLimitReached,
  typeFields,
} from '../lib/breakHelpers';

function shiftLabel(employee) {
  return employee?.shiftDisplay || employee?.shiftName || 'Unassigned';
}

function breakButtonState(employee, breakType, startLimit) {
  const fields = typeFields(employee, breakType);
  const offShift = isOffShift(employee);
  const startBlocked = startLimitReached(employee, breakType, startLimit);
  const reason = fields.blockedByOther
    ? `On ${employee.currentBreakType} break — end that first`
    : offShift && !fields.isOnThisBreak
      ? offShiftReason(employee)
      : startBlocked
        ? `Cannot start another ${breakType.toLowerCase()} break this shift`
        : '';
  return {
    fields,
    onThisBreak: fields.isOnThisBreak,
    disabled: Boolean(!fields.isOnThisBreak && (fields.blockedByOther || offShift || startBlocked)),
    reason,
  };
}

function BreakStatusCell({ employee, breakType }) {
  const fields = typeFields(employee, breakType);
  return (
    <div className="portal-break-status">
      <StatusBadge status={fields.status} color={fields.statusColor} />
      <span className={fields.isOnThisBreak ? 'is-live-total' : ''}>
        {fields.totalDisplay}
        {fields.isOnThisBreak ? ` · ${formatElapsed(employee.currentBreakElapsedSeconds)}` : ''}
      </span>
    </div>
  );
}

function PortalEmployeeDialog({
  employee,
  board,
  busy,
  apiOnline,
  onToggle,
  onClose,
}) {
  const meal = breakButtonState(employee, BREAK_TYPES.MEAL, board?.mealStartLimit);
  const comfort = breakButtonState(employee, BREAK_TYPES.COMFORT, board?.comfortStartLimit);
  const mealLeft = remainingStarts(employee, BREAK_TYPES.MEAL, board?.mealStartLimit);
  const comfortLeft = remainingStarts(employee, BREAK_TYPES.COMFORT, board?.comfortStartLimit);

  return (
    <div
      className="confirm-overlay portal-employee-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="portal-employee-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-employee-dialog-title"
      >
        <DialogWeather mode={String(board?.portalWeather || 'rain').toLowerCase()} />
        <header className="portal-employee-dialog__head">
          <div className="portal-employee-dialog__title">
            <p className="portal-employee-dialog__eyebrow">Employee details</p>
            <h2 id="portal-employee-dialog-title">{employee.fullName}</h2>
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
                  disabled={busy || apiOnline === false || meal.disabled}
                  title={meal.reason || undefined}
                  onClick={() => onToggle(BREAK_TYPES.MEAL)}
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
                  disabled={busy || apiOnline === false || comfort.disabled}
                  title={comfort.reason || undefined}
                  onClick={() => onToggle(BREAK_TYPES.COMFORT)}
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
        </div>
      </div>
    </div>
  );
}

export default function PortalPage() {
  const { isAuthenticated } = useAuth();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [apiOnline, setApiOnline] = useState(null);
  const [board, setBoard] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [shifts, setShifts] = useState([]);
  const [shiftId, setShiftId] = useState('');
  const [shiftId2, setShiftId2] = useState('');
  const [passcodeFlow, setPasscodeFlow] = useState(null);
  const [passcodeBusy, setPasscodeBusy] = useState(false);
  const [passcodeError, setPasscodeError] = useState('');
  const searchRef = useRef(null);
  const busyRef = useRef(false);
  const lastLoadError = useRef('');

  const checkApi = useCallback(async () => {
    try {
      await api.get('/health', { timeout: 3000 });
      setApiOnline(true);
      return true;
    } catch {
      setApiOnline(false);
      return false;
    }
  }, []);

  const loadBoard = useCallback(async () => {
    const online = await checkApi();
    if (!online) {
      setBoard(null);
      return;
    }
    const { data } = await api.get('/portal/live', {
      params: {
        search: search || undefined,
        shiftId: shiftId || undefined,
        shiftId2: shiftId && shiftId2 ? shiftId2 : undefined,
      },
    });
    setBoard(data);
    setNowMs(Date.now());
  }, [checkApi, search, shiftId, shiftId2]);

  useEffect(() => {
    api.get('/portal/shifts')
      .then((res) => setShifts(res.data || []))
      .catch(() => setShifts([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await loadBoard();
        lastLoadError.current = '';
      } catch (err) {
        if (!cancelled) {
          const msg = apiErrorMessage(err, 'Could not load employee list.');
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
  }, [loadBoard, toast]);

  useLiveUpdates(() => {
    loadBoard().catch(() => {});
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

  const mealOnBreakCount = useMemo(
    () => employeesView.filter((employee) => typeFields(employee, BREAK_TYPES.MEAL).isOnThisBreak).length,
    [employeesView],
  );
  const comfortOnBreakCount = useMemo(
    () => employeesView.filter((employee) => typeFields(employee, BREAK_TYPES.COMFORT).isOnThisBreak).length,
    [employeesView],
  );

  const selectedEmployee = useMemo(
    () => employeesView.find((e) => e.employeeId === selectedEmployeeId) || null,
    [employeesView, selectedEmployeeId],
  );

  useEffect(() => {
    if (!board || !selectedEmployeeId) return;
    if (!employeesView.some((e) => e.employeeId === selectedEmployeeId)) {
      setSelectedEmployeeId(null);
    }
  }, [board, employeesView, selectedEmployeeId]);

  const openEmployee = useCallback(async (employeeId) => {
    setSelectedEmployeeId(employeeId);
    try {
      const { data } = await api.get(`/portal/employee/${employeeId}`);
      setBoard((current) => {
        if (!current?.employees) return current;
        return {
          ...current,
          employees: current.employees.map((row) => (
            row.employeeId === employeeId ? { ...row, ...data } : row
          )),
        };
      });
    } catch {
      // Keep the live-board row if the detail refresh is unavailable.
    }
  }, []);

  const closeEmployee = useCallback(() => {
    if (passcodeFlow) return;
    setSelectedEmployeeId(null);
    setSearch('');
  }, [passcodeFlow]);

  const captureToggle = useCallback(async (breakType) => {
    if (busyRef.current || passcodeFlow) return;
    if (apiOnline === false) {
      toast.error('API is offline. Start the backend first.');
      return;
    }
    const employeeId = selectedEmployeeId;
    if (!employeeId) {
      toast.error('Select your name from the list first.');
      return;
    }
    const employee = employeesView.find((e) => e.employeeId === employeeId);
    if (!employee) {
      toast.error('Select your name from the list first.');
      return;
    }
    const state = breakButtonState(
      employee,
      breakType,
      breakType === BREAK_TYPES.MEAL ? board?.mealStartLimit : board?.comfortStartLimit,
    );
    if (state.disabled) {
      toast.error(state.reason || `Cannot start a ${breakType.toLowerCase()} break right now.`);
      return;
    }
    let hasPasscode = Boolean(employee?.hasPasscode);
    let attemptsLeft = 5;
    try {
      const { data } = await api.get(`/portal/passcode-status/${employeeId}`);
      hasPasscode = Boolean(data.hasPasscode);
      attemptsLeft = data.attemptsLeft ?? 5;
      if (data.isLocked) {
        toast.error(data.message || 'Too many incorrect attempts. Try again later.');
        return;
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not check passcode status.'));
      return;
    }
    setPasscodeError('');
    setPasscodeFlow({
      employeeId,
      employee,
      breakType,
      action: state.onThisBreak ? 'end' : 'start',
      step: hasPasscode ? 'verify' : 'create',
      attemptsLeft,
    });
  }, [apiOnline, selectedEmployeeId, employeesView, board, toast, passcodeFlow]);

  const closePasscodeFlow = useCallback(() => {
    setPasscodeFlow(null);
    setPasscodeError('');
    setPasscodeBusy(false);
  }, []);

  const savePasscode = useCallback(async (passcode, confirmPasscode) => {
    if (!passcodeFlow) return;
    setPasscodeBusy(true);
    setPasscodeError('');
    try {
      const { data } = await api.post('/portal/passcode', {
        employeeId: passcodeFlow.employeeId,
        passcode,
        confirmPasscode,
      });
      if (!data.ok && data.errorCode !== 'ALREADY_SET') {
        setPasscodeError(data.message || 'Could not save passcode.');
        return;
      }
      setPasscodeFlow((current) => current && {
        ...current,
        step: 'verify',
        attemptsLeft: data.attemptsLeft ?? current.attemptsLeft,
      });
      toast.success(data.errorCode === 'ALREADY_SET'
        ? 'A passcode is already set. Enter it to continue.'
        : 'Passcode saved. Enter it to continue.');
    } catch (err) {
      const data = err?.response?.data;
      setPasscodeError(data?.message || apiErrorMessage(err, 'Could not save passcode.'));
    } finally {
      setPasscodeBusy(false);
    }
  }, [passcodeFlow, toast]);

  const verifyAndToggle = useCallback(async (passcode) => {
    if (!passcodeFlow) return;
    setPasscodeBusy(true);
    setPasscodeError('');
    busyRef.current = true;
    setBusy(true);
    try {
      const { data } = await api.post('/portal/toggle', {
        employeeId: passcodeFlow.employeeId,
        breakType: passcodeFlow.breakType,
        passcode,
      });
      const fields = typeFields(data, passcodeFlow.breakType);
      toast.success(
        data.isOnBreak
          ? `${passcodeFlow.breakType} break started for ${data.fullName} at ${formatLocalClock(data.currentOutTime)}.`
          : `${passcodeFlow.breakType} break ended for ${data.fullName}. This shift total: ${fields.totalDisplay}.`,
      );
      closePasscodeFlow();
      await loadBoard();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.errorCode === 'PASSCODE_REQUIRED') {
        setPasscodeFlow((current) => current && { ...current, step: 'create' });
        setPasscodeError(data.message || 'Create your passcode first.');
      } else if (data?.errorCode === 'PASSCODE_INVALID' || data?.errorCode === 'PASSCODE_INVALID_CHARS' || data?.errorCode === 'PASSCODE_LOCKED') {
        setPasscodeError(data.message || 'Incorrect passcode.');
        setPasscodeFlow((current) => current && {
          ...current,
          attemptsLeft: data.attemptsLeft ?? current.attemptsLeft,
        });
      } else {
        const raw = data?.message || apiErrorMessage(err, 'Could not record break time.');
        toast.error(/start limit/i.test(raw)
          ? `Cannot start another ${passcodeFlow.breakType.toLowerCase()} break this shift.`
          : raw);
        closePasscodeFlow();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPasscodeBusy(false);
    }
  }, [passcodeFlow, closePasscodeFlow, loadBoard, toast]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest('button, a, input, select, textarea')) return;
      if (e.key === '/' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      } else if (e.key === 'Escape' && selectedEmployeeId && !passcodeFlow) {
        e.preventDefault();
        closeEmployee();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEmployeeId, passcodeFlow, closeEmployee]);

  const passcodeEmployee = passcodeFlow
    ? (employeesView.find((e) => e.employeeId === passcodeFlow.employeeId) || passcodeFlow.employee)
    : null;
  const passcodeLimitMinutes = passcodeFlow?.breakType === BREAK_TYPES.MEAL
    ? board?.mealLimitMinutes
    : board?.comfortLimitMinutes;
  const passcodeTimeLeft = passcodeEmployee
    ? formatElapsed(remainingBreakSeconds(passcodeEmployee, passcodeFlow.breakType, passcodeLimitMinutes))
    : '—';

  return (
    <div className="portal-shell">
      <main className="portal-main">
        <header className="portal-employee-header">
          <div className="portal-employee-header__text">
            <h1 className="portal-employee-title">Employee Break Portal</h1>
            <h2 className="portal-employee-subtitle">PortCity BPO - HTSK Division</h2>
          </div>
          <div className="portal-employee-header__actions">
            <ThemeToggle />
            <PortalClock />
            <div
              className="portal-onbreak-chip"
              aria-label={`On Meal Break ${mealOnBreakCount}. On Comfort Break ${comfortOnBreakCount}.`}
            >
              <span className="portal-onbreak-chip__item">
                <span>On Meal Break</span>
                <strong>{mealOnBreakCount}</strong>
              </span>
              <span className="portal-onbreak-chip__sep" aria-hidden="true">|</span>
              <span className="portal-onbreak-chip__item">
                <span>On Comfort Break</span>
                <strong>{comfortOnBreakCount}</strong>
              </span>
            </div>
            {isAuthenticated ? (
              <button type="button" className="btn btn-primary" onClick={() => navigate('/app')}>
                Open staff console
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
                Log in as HR Manager
              </button>
            )}
          </div>
        </header>

        {!apiOnline && apiOnline !== null && (
          <div className="message-bar message-error">
            Backend is offline. Run <code>dotnet watch run</code> in HRTimeTracking.Api.
          </div>
        )}

        <div className="portal-employee-filters">
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
              <option value="">All Employees</option>
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
                placeholder="Search by name or employee ID…  (/ to focus)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
        </div>

        <section className="portal-roster-section">
          <header className="portal-roster-section__head">
            <div>
              <h2>Employees</h2>
              <p>
                Meal limit <strong>{board?.mealLimitMinutes ?? '—'} min</strong>
                {' · '}
                Comfort limit <strong>{board?.comfortLimitMinutes ?? '—'} min</strong>
              </p>
            </div>
            <div className="portal-onbreak-chip">
              On break <strong>{board?.onBreakCount ?? 0}</strong>
            </div>
          </header>

          <div className="portal-board portal-roster">
            <div className="portal-board__table">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>This shift</th>
                    <th>Meal status</th>
                    <th>Comfort status</th>
                  </tr>
                </thead>
                <tbody>
                  {employeesView.map((e) => {
                    const offShift = isOffShift(e);
                    return (
                      <tr
                        key={e.employeeId}
                        className={[
                          selectedEmployeeId === e.employeeId ? 'selected' : '',
                          e.isOnBreak ? 'on-break' : '',
                          offShift ? 'off-shift' : '',
                        ].filter(Boolean).join(' ')}
                        title={offShift ? offShiftReason(e) : 'Open employee details'}
                        onClick={() => openEmployee(e.employeeId)}
                      >
                        <td className="col-code">{e.employeeCode}</td>
                        <td className="col-name">{e.fullName}</td>
                        <td>{e.departmentName}</td>
                        <td>{shiftLabel(e)}</td>
                        <td><BreakStatusCell employee={e} breakType={BREAK_TYPES.MEAL} /></td>
                        <td><BreakStatusCell employee={e} breakType={BREAK_TYPES.COMFORT} /></td>
                      </tr>
                    );
                  })}
                  {apiOnline && !employeesView.length && (
                    <tr><td colSpan={6} className="empty">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <PortalCredits className="portal-credits--page" employeePortal />
      </main>
      {selectedEmployee && (
        <PortalEmployeeDialog
          employee={selectedEmployee}
          board={board}
          busy={busy || Boolean(passcodeFlow)}
          apiOnline={apiOnline}
          onToggle={captureToggle}
          onClose={closeEmployee}
        />
      )}
      {passcodeFlow && passcodeEmployee && (
        <PasscodeModal
          mode={passcodeFlow.step}
          employee={passcodeEmployee}
          breakType={passcodeFlow.breakType}
          action={passcodeFlow.action}
          timeLeftDisplay={passcodeTimeLeft}
          serverError={passcodeError}
          busy={passcodeBusy}
          onSave={savePasscode}
          onVerify={verifyAndToggle}
          onCancel={closePasscodeFlow}
        />
      )}
    </div>
  );
}
