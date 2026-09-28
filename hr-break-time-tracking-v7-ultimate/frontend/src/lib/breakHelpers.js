/** Shared break-time helpers for Meal + Comfort boards. */

export const BREAK_TYPES = {
  MEAL: 'Meal',
  COMFORT: 'Comfort',
};

export const ADJUST_TIME_MAX_HOURS = 23;

export function formatElapsed(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function splitElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function adjustTimeBounds(rawTotalSeconds) {
  const remainder = Math.max(0, Math.floor(Number(rawTotalSeconds) || 0)) % 60;
  return {
    remainder,
    minSeconds: remainder,
    maxSeconds: ADJUST_TIME_MAX_HOURS * 3600 + 59 * 60 + remainder,
  };
}

export function parseLocalDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocalClock(value) {
  const d = parseLocalDateTime(value);
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function liveElapsedSeconds(outTime, nowMs, periodEnd) {
  const out = parseLocalDateTime(outTime);
  if (!out) return 0;
  let endMs = nowMs;
  const cap = parseLocalDateTime(periodEnd);
  if (cap) endMs = Math.min(endMs, cap.getTime());
  return Math.max(0, Math.floor((endMs - out.getTime()) / 1000));
}

export function isOpenBreakLive(employee, nowMs) {
  if (!employee?.isOnBreak || !employee?.currentOutTime) return false;
  const cap = parseLocalDateTime(employee.shiftPeriodEnd);
  if (cap && nowMs >= cap.getTime()) return false;
  return true;
}

export function statusFromTotal(totalSeconds, limitMinutes) {
  const limitSeconds = Math.max(0, Number(limitMinutes) || 0) * 60;
  if (totalSeconds <= limitSeconds) {
    return { status: 'WELL SATISFIED', statusColor: 'green' };
  }
  return { status: 'EXCEEDED BREAK TIME LIMIT', statusColor: 'red' };
}

/**
 * This-shift total:
 *   closed (In − Out) + live (Now − Out) while a break is open.
 */
export function shiftTotalSeconds(employee, breakType, nowMs) {
  const isMeal = breakType === BREAK_TYPES.MEAL;
  const closed = isMeal
    ? (employee.mealClosedSeconds ?? 0)
    : (employee.comfortClosedSeconds ?? 0);
  const onThisBreak = employee.isOnBreak && employee.currentBreakType === breakType;
  const open = onThisBreak ? liveElapsedSeconds(employee.currentOutTime, nowMs, employee.shiftPeriodEnd) : 0;
  const raw = closed + open;
  const adjField = isMeal ? employee.mealAdjustmentMinutes : employee.comfortAdjustmentMinutes;
  if (adjField != null && Number.isFinite(Number(adjField))) {
    return Math.max(0, raw - Number(adjField) * 60);
  }
  let adjSeconds = 0;
  const serverTotal = Number(isMeal ? employee.mealBreakSecondsToday : employee.comfortBreakSecondsToday);
  if (Number.isFinite(serverTotal)) {
    const openAtFetch = onThisBreak ? (Number(employee.currentBreakElapsedSeconds) || 0) : 0;
    const rawAtFetch = closed + openAtFetch;
    if (rawAtFetch > serverTotal) adjSeconds = rawAtFetch - serverTotal;
  }
  return Math.max(0, raw - adjSeconds);
}

/** Recompute open-session elapsed against Meal or Comfort totals every tick. */
export function enrichEmployeesLive(list, nowMs, limits = {}) {
  const rows = (list || []).map((e) => {
    const mealTotal = shiftTotalSeconds(e, BREAK_TYPES.MEAL, nowMs);
    const comfortTotal = shiftTotalSeconds(e, BREAK_TYPES.COMFORT, nowMs);
    const mealStatus = statusFromTotal(mealTotal, e.mealLimitMinutes ?? limits.mealLimitMinutes);
    const comfortStatus = statusFromTotal(comfortTotal, e.comfortLimitMinutes ?? limits.comfortLimitMinutes);
    const live = isOpenBreakLive(e, nowMs);
    return {
      ...e,
      isOnBreak: live,
      currentBreakType: live ? e.currentBreakType : null,
      currentOutTime: live ? e.currentOutTime : null,
      currentBreakElapsedSeconds: live
        ? liveElapsedSeconds(e.currentOutTime, nowMs, e.shiftPeriodEnd)
        : 0,
      mealBreakSecondsToday: mealTotal,
      mealBreakDisplay: formatElapsed(mealTotal),
      mealStatus: mealStatus.status,
      mealStatusColor: mealStatus.statusColor,
      comfortBreakSecondsToday: comfortTotal,
      comfortBreakDisplay: formatElapsed(comfortTotal),
      comfortStatus: comfortStatus.status,
      comfortStatusColor: comfortStatus.statusColor,
    };
  });

  return rows.sort((a, b) => {
    const aLive = a.isWithinShift === false ? 1 : 0;
    const bLive = b.isWithinShift === false ? 1 : 0;
    if (aLive !== bLive) return aLive - bLive;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''));
  });
}

export function isOffShift(employee) {
  return employee?.isWithinShift === false;
}

export function offShiftReason(employee) {
  const shift = employee?.shiftDisplay || employee?.shiftName || 'This shift';
  const next = formatLocalClock(employee?.nextShiftStart);
  if (next && next !== '—') return `${shift} is not live until ${next.slice(0, 5)}`;
  if (!employee?.shiftName) return 'No shift assigned — cannot capture breaks';
  return `${shift} is not live at the current local time`;
}

export function canSelectForCapture(employee, breakType) {
  const fields = typeFields(employee, breakType);
  if (fields.isOnThisBreak) return true;
  if (fields.blockedByOther) return false;
  if (isOffShift(employee)) return false;
  return true;
}

export function typeFields(employee, breakType) {
  if (breakType === BREAK_TYPES.MEAL) {
    return {
      totalSeconds: employee.mealBreakSecondsToday ?? 0,
      totalDisplay: employee.mealBreakDisplay ?? '00:00:00',
      status: employee.mealStatus,
      statusColor: employee.mealStatusColor,
      isOnThisBreak: employee.isOnBreak && employee.currentBreakType === BREAK_TYPES.MEAL,
      blockedByOther: Boolean(employee.isOnBreak && employee.currentBreakType !== BREAK_TYPES.MEAL),
      startCount: employee.mealStartCountToday ?? 0,
    };
  }
  return {
    totalSeconds: employee.comfortBreakSecondsToday ?? 0,
    totalDisplay: employee.comfortBreakDisplay ?? '00:00:00',
    status: employee.comfortStatus,
    statusColor: employee.comfortStatusColor,
    isOnThisBreak: employee.isOnBreak && employee.currentBreakType === BREAK_TYPES.COMFORT,
    blockedByOther: Boolean(employee.isOnBreak && employee.currentBreakType !== BREAK_TYPES.COMFORT),
    startCount: employee.comfortStartCountToday ?? 0,
  };
}

export function remainingBreakSeconds(employee, breakType, limitMinutes) {
  const used = typeFields(employee, breakType).totalSeconds || 0;
  const limit = Math.max(0, Number(limitMinutes) || 0) * 60;
  return Math.max(0, limit - used);
}

export function startCount(employee, breakType) {
  return typeFields(employee, breakType).startCount;
}

/** Portal starts still available this shift. HR starts on Live Tracking are not included. */
export function remainingStarts(employee, breakType, fallback) {
  const limit = employeeStartLimit(employee, breakType, fallback);
  const used = startCount(employee, breakType);
  return Math.max(0, limit - used);
}

/** True when this employee cannot start another break of this type (ending an open one is still allowed). */
export function employeeStartLimit(employee, breakType, fallback) {
  const fromEmployee = breakType === BREAK_TYPES.MEAL
    ? employee?.mealStartLimit
    : employee?.comfortStartLimit;
  const n = Number(fromEmployee);
  if (Number.isFinite(n) && n > 0) return n;
  const fb = Number(fallback);
  if (Number.isFinite(fb) && fb > 0) return fb;
  return breakType === BREAK_TYPES.MEAL ? 1 : 2;
}

export function startLimitReached(employee, breakType, startLimit) {
  const fields = typeFields(employee, breakType);
  if (fields.isOnThisBreak) return false;
  const limit = employeeStartLimit(employee, breakType, startLimit);
  return fields.startCount >= limit;
}

export function startLimitReason(_employee, breakType) {
  const label = String(breakType || 'break').toLowerCase();
  return `Cannot start another ${label} break this shift`;
}

export function settingLabel(key) {
  if (key === 'MealBreakLimitMinutes') return 'Meal break daily limit (minutes)';
  if (key === 'ComfortBreakLimitMinutes') return 'Comfort break daily limit (minutes)';
  if (key === 'MealBreakStartLimit') return 'Default Meal start limit for new departments';
  if (key === 'ComfortBreakStartLimit') return 'Default Comfort start limit for new departments';
  if (key === 'DailyBreakLimitMinutes') return 'Legacy comfort limit alias (synced)';
  if (key === 'DailyMealBreakLimitMinutes') return 'Legacy meal limit alias (synced)';
  return key;
}
