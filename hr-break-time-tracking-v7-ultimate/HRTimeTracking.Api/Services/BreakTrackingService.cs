using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IBreakTrackingService
{
    Task<LiveBoardDto> GetLiveBoardAsync(string? search = null, int? departmentId = null, int? shiftId = null, int? shiftId2 = null);
    Task<EmployeeBreakStatusDto?> GetEmployeeStatusAsync(int employeeId);
    Task<(bool Ok, string? Error, EmployeeBreakStatusDto? Data)> ToggleAsync(int employeeId, string breakType, string? userId);
    Task<(bool Ok, string? Error, EmployeeBreakStatusDto? Data)> RecordOutAsync(int employeeId, string breakType, string? userId);
    Task<(bool Ok, string? Error, EmployeeBreakStatusDto? Data)> RecordInAsync(int employeeId, string? breakType, string? userId);
    Task<IReadOnlyList<BreakSessionDto>> GetSessionsAsync(DateOnly? from, DateOnly? to, int? employeeId, int? departmentId, string? breakType = null);
}

public class BreakTrackingService : IBreakTrackingService
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly ISettingsService _settings;
    private readonly IBreakAutoCloseService _autoClose;
    private readonly ILiveUpdateNotifier _liveUpdates;

    public BreakTrackingService(
        AppDbContext db,
        IAuditService audit,
        ISettingsService settings,
        IBreakAutoCloseService autoClose,
        ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _audit = audit;
        _settings = settings;
        _autoClose = autoClose;
        _liveUpdates = liveUpdates;
    }

    public async Task<LiveBoardDto> GetLiveBoardAsync(string? search = null, int? departmentId = null, int? shiftId = null, int? shiftId2 = null)
    {
        await _autoClose.CloseExpiredAsync();
        var today = TimeDisplay.TodayLocal();
        var now = TimeDisplay.NowLocal();
        var comfortLimit = await _settings.GetComfortLimitMinutesAsync();
        var mealLimit = await _settings.GetMealLimitMinutesAsync();
        var comfortStartLimit = await _settings.GetComfortStartLimitAsync();
        var mealStartLimit = await _settings.GetMealStartLimitAsync();
        var portalWeather = await _settings.GetPortalWeatherAsync();
        var limitsMap = await _settings.GetBreakLimitsMapAsync();
        var startLimitsByDepartment = await _settings.GetStartLimitsByDepartmentAsync();

        var employeesQuery = _db.Employees.AsNoTracking()
            .Include(e => e.Department)
            .Include(e => e.Shift)
            .Where(e => !e.IsDeleted);

        if (departmentId.HasValue)
            employeesQuery = employeesQuery.Where(e => e.DepartmentId == departmentId.Value);

        var shiftIds = new List<int>();
        if (shiftId.HasValue) shiftIds.Add(shiftId.Value);
        if (shiftId2.HasValue && !shiftIds.Contains(shiftId2.Value)) shiftIds.Add(shiftId2.Value);
        if (shiftIds.Count == 1)
            employeesQuery = employeesQuery.Where(e => e.ShiftId == shiftIds[0]);
        else if (shiftIds.Count > 1)
            employeesQuery = employeesQuery.Where(e => e.ShiftId != null && shiftIds.Contains(e.ShiftId.Value));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            employeesQuery = employeesQuery.Where(e =>
                e.FullName.ToLower().Contains(term) ||
                e.EmployeeCode.ToLower().Contains(term) ||
                e.Department.Name.ToLower().Contains(term));
        }

        var employees = await employeesQuery.OrderBy(e => e.FullName).ToListAsync();
        var employeeIds = employees.Select(e => e.Id).ToList();

        var lookback = now.Date.AddDays(-2);
        var sessions = employeeIds.Count == 0
            ? new List<BreakSession>()
            : await _db.BreakSessions.AsNoTracking()
                .Where(b => employeeIds.Contains(b.EmployeeId) &&
                            (b.InTime == null || b.OutTime >= lookback))
                .ToListAsync();

        foreach (var session in sessions)
        {
            session.OutTime = TimeDisplay.AsLocal(session.OutTime);
            session.InTime = TimeDisplay.AsLocal(session.InTime);
            if (string.IsNullOrWhiteSpace(session.BreakType))
                session.BreakType = BreakTypes.Comfort;
        }

        var adjDates = Enumerable.Range(0, 4).Select(offset => today.AddDays(-offset)).ToArray();
        var adjustments = employeeIds.Count == 0
            ? new List<BreakTimeAdjustment>()
            : await _db.BreakTimeAdjustments.AsNoTracking()
                .Where(a => employeeIds.Contains(a.EmployeeId) && adjDates.Contains(a.BreakDate))
                .ToListAsync();

        var statuses = employees.Select(e =>
        {
            var employeeSessions = sessions.Where(s => s.EmployeeId == e.Id).ToList();
            var livePeriod = ShiftWindow.ActiveAt(e.Shift, now);
            var resolved = ResolveLimits(
                e,
                limitsMap,
                startLimitsByDepartment,
                mealStartLimit,
                comfortStartLimit,
                mealLimit,
                comfortLimit);
            var day = livePeriod?.StartDate ?? today;
            return BuildStatus(
                e,
                employeeSessions,
                now,
                resolved.ComfortLimitMinutes,
                resolved.MealLimitMinutes,
                livePeriod,
                resolved.MealStartLimit,
                resolved.ComfortStartLimit,
                LookupAdjustment(adjustments, e.Id, day, BreakTypes.Meal),
                LookupAdjustment(adjustments, e.Id, day, BreakTypes.Comfort));
        }).ToList();

        DateTime? periodStart = null;
        DateTime? periodEnd = null;
        string? periodLabel = null;
        if (shiftIds.Count == 1)
        {
            var selected = employees.Select(e => e.Shift).FirstOrDefault(s => s is not null && s.Id == shiftIds[0])
                ?? await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == shiftIds[0]);
            var livePeriod = ShiftWindow.ActiveAt(selected, now);
            if (livePeriod.HasValue)
            {
                periodStart = livePeriod.Value.Start;
                periodEnd = livePeriod.Value.End;
                periodLabel = ShiftWindow.FormatLabel(selected, livePeriod.Value);
            }
            else
            {
                var next = ShiftWindow.NextStart(selected, now);
                periodLabel = next.HasValue
                    ? $"Between shifts — This shift reset until {next.Value:HH:mm}"
                    : "Between shifts — This shift reset";
            }
        }

        return new LiveBoardDto(
            today,
            comfortLimit,
            mealLimit,
            statuses,
            statuses.Count(s => s.IsOnBreak),
            statuses.Count(s => s.IsOnComfortBreak),
            statuses.Count(s => s.IsOnMealBreak),
            statuses.Count(s => s.IsWithinShift && s.ComfortStatus == BreakStatusCodes.Exceeded),
            0,
            statuses.Count(s => s.IsWithinShift && s.ComfortStatus == BreakStatusCodes.WellSatisfied),
            statuses.Count(s => s.IsWithinShift && s.MealStatus == BreakStatusCodes.Exceeded),
            0,
            statuses.Count(s => s.IsWithinShift && s.MealStatus == BreakStatusCodes.WellSatisfied),
            periodStart,
            periodEnd,
            periodLabel,
            comfortStartLimit,
            mealStartLimit,
            portalWeather);
    }

    public async Task<EmployeeBreakStatusDto?> GetEmployeeStatusAsync(int employeeId)
    {
        await _autoClose.CloseExpiredAsync(employeeId);
        var employee = await _db.Employees.AsNoTracking()
            .Include(e => e.Department)
            .Include(e => e.Shift)
            .FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null) return null;

        var now = TimeDisplay.NowLocal();
        var livePeriod = ShiftWindow.ActiveAt(employee.Shift, now);
        var limits = await _settings.GetBreakLimitsForEmployeeAsync(employee.ShiftId, employee.DepartmentId);
        var lookback = now.Date.AddDays(-2);
        var sessions = await _db.BreakSessions.AsNoTracking()
            .Where(b => b.EmployeeId == employeeId &&
                        (b.InTime == null || b.OutTime >= lookback))
            .ToListAsync();

        foreach (var session in sessions)
        {
            session.OutTime = TimeDisplay.AsLocal(session.OutTime);
            session.InTime = TimeDisplay.AsLocal(session.InTime);
            if (string.IsNullOrWhiteSpace(session.BreakType))
                session.BreakType = BreakTypes.Comfort;
        }

        var inPeriod = sessions.Where(s => livePeriod is null || ShiftWindow.StartedIn(s.OutTime, livePeriod.Value) || s.InTime is null).ToList();
        var day = livePeriod?.StartDate ?? TimeDisplay.TodayLocal();
        var adjustments = await _db.BreakTimeAdjustments.AsNoTracking()
            .Where(a => a.EmployeeId == employeeId && a.BreakDate == day)
            .ToListAsync();
        return BuildStatus(
            employee,
            inPeriod,
            now,
            limits.ComfortLimitMinutes,
            limits.MealLimitMinutes,
            livePeriod,
            limits.MealStartLimit,
            limits.ComfortStartLimit,
            LookupAdjustment(adjustments, employeeId, day, BreakTypes.Meal),
            LookupAdjustment(adjustments, employeeId, day, BreakTypes.Comfort));
    }

    public async Task<(bool Ok, string? Error, EmployeeBreakStatusDto? Data)> ToggleAsync(int employeeId, string breakType, string? userId)
    {
        if (!BreakTypes.IsValid(breakType))
            return (false, "Break type must be Comfort or Meal.", null);

        var type = BreakTypes.Normalize(breakType);
        var closedIds = await _autoClose.CloseExpiredAsync(employeeId);
        var open = await _db.BreakSessions.FirstOrDefaultAsync(b => b.EmployeeId == employeeId && b.InTime == null);
        if (open is null)
        {
            if (closedIds.Contains(employeeId))
                return (true, null, await GetEmployeeStatusAsync(employeeId));
            return await RecordOutAsync(employeeId, type, userId);
        }

        var openType = string.IsNullOrWhiteSpace(open.BreakType) ? BreakTypes.Comfort : BreakTypes.Normalize(open.BreakType);
        if (!openType.Equals(type, StringComparison.OrdinalIgnoreCase))
            return (false, $"Employee is already on a {openType} break. End that break first.", null);

        return await RecordInAsync(employeeId, type, userId);
    }

    public async Task<(bool Ok, string? Error, EmployeeBreakStatusDto? Data)> RecordOutAsync(int employeeId, string breakType, string? userId)
    {
        if (!BreakTypes.IsValid(breakType))
            return (false, "Break type must be Comfort or Meal.", null);
        var type = BreakTypes.Normalize(breakType);

        var employee = await _db.Employees.Include(e => e.Department).Include(e => e.Shift)
            .FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null) return (false, "Employee not found.", null);
        if (employee.IsDeleted) return (false, "This employee is deactivated and cannot start a break.", null);

        await _autoClose.CloseExpiredAsync(employeeId);
        var open = await _db.BreakSessions.FirstOrDefaultAsync(b => b.EmployeeId == employeeId && b.InTime == null);
        if (open is not null)
        {
            var openType = string.IsNullOrWhiteSpace(open.BreakType) ? BreakTypes.Comfort : open.BreakType;
            return (false, $"Employee is already on a {openType} break. Capture in-time first.", null);
        }

        var now = TimeDisplay.NowLocal();
        var period = ShiftWindow.ActiveAt(employee.Shift, now);
        if (period is null)
            return (false, "This employee is not on a live shift right now. Breaks can only be started during their shift hours.", null);

        var limits = await _settings.GetBreakLimitsForEmployeeAsync(employee.ShiftId, employee.DepartmentId);
        var startLimit = type == BreakTypes.Meal ? limits.MealStartLimit : limits.ComfortStartLimit;
        var startedCount = await CountStartsInPeriodAsync(employeeId, type, period.Value);
        if (startedCount >= startLimit)
            return (false, $"Cannot start another {type.ToLowerInvariant()} break this shift.", null);

        var session = new BreakSession
        {
            EmployeeId = employeeId,
            BreakType = type,
            OutTime = now,
            BreakDate = period.Value.StartDate,
            RecordedByUserId = userId,
            CreatedAt = now
        };
        _db.BreakSessions.Add(session);
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "BreakOut", "BreakSession", session.Id.ToString(),
            $"Employee: {employee.FullName} ({employee.EmployeeCode}). {type} out: {TimeDisplay.FormatLocalDateClock(now)}. In: —.");
        await _liveUpdates.NotifyAsync("breaks");

        return (true, null, await GetEmployeeStatusAsync(employeeId));
    }

    public async Task<(bool Ok, string? Error, EmployeeBreakStatusDto? Data)> RecordInAsync(int employeeId, string? breakType, string? userId)
    {
        var employee = await _db.Employees.Include(e => e.Department).Include(e => e.Shift)
            .FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null) return (false, "Employee not found.", null);

        var closedIds = await _autoClose.CloseExpiredAsync(employeeId);
        var open = await _db.BreakSessions
            .Where(b => b.EmployeeId == employeeId && b.InTime == null)
            .OrderByDescending(b => b.OutTime)
            .FirstOrDefaultAsync();

        if (open is null)
        {
            if (closedIds.Contains(employeeId))
                return (true, null, await GetEmployeeStatusAsync(employeeId));
            return (false, "Employee is not on break. Capture out-time first.", null);
        }

        var openType = string.IsNullOrWhiteSpace(open.BreakType) ? BreakTypes.Comfort : BreakTypes.Normalize(open.BreakType);
        if (!string.IsNullOrWhiteSpace(breakType))
        {
            if (!BreakTypes.IsValid(breakType))
                return (false, "Break type must be Comfort or Meal.", null);
            var requested = BreakTypes.Normalize(breakType);
            if (!openType.Equals(requested, StringComparison.OrdinalIgnoreCase))
                return (false, $"Open break is {openType}, not {requested}.", null);
        }

        open.OutTime = TimeDisplay.AsLocal(open.OutTime);
        var now = TimeDisplay.NowLocal();
        if (now < open.OutTime)
            return (false, "In-time cannot be earlier than out-time.", null);

        var closeAt = ShiftWindow.AutoCloseAt(employee.Shift, open.BreakDate, open.OutTime);
        var inTime = now;
        var autoClosed = false;
        if (closeAt.HasValue && now >= closeAt.Value)
        {
            inTime = closeAt.Value;
            autoClosed = true;
        }

        var durationSeconds = TimeDisplay.ElapsedSeconds(open.OutTime, inTime);
        open.InTime = inTime;
        open.DurationSeconds = durationSeconds;
        open.ClosedByUserId = autoClosed ? null : userId;
        open.IsAutoClosed = autoClosed;
        if (string.IsNullOrWhiteSpace(open.BreakType))
            open.BreakType = BreakTypes.Comfort;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, autoClosed ? "BreakAutoClose" : "BreakIn", "BreakSession", open.Id.ToString(),
            $"Employee: {employee.FullName} ({employee.EmployeeCode}). {openType} out: {TimeDisplay.FormatLocalDateClock(open.OutTime)}. In{(autoClosed ? " (shift end)" : "")}: {TimeDisplay.FormatLocalDateClock(inTime)}. Duration {TimeDisplay.FormatSeconds(durationSeconds)}.");
        await _liveUpdates.NotifyAsync("breaks");

        return (true, null, await GetEmployeeStatusAsync(employeeId));
    }

    public async Task<IReadOnlyList<BreakSessionDto>> GetSessionsAsync(DateOnly? from, DateOnly? to, int? employeeId, int? departmentId, string? breakType = null)
    {
        await _autoClose.CloseExpiredAsync(employeeId);
        var fromDate = from ?? TimeDisplay.TodayLocal();
        var toDate = to ?? fromDate;

        var query = _db.BreakSessions.AsNoTracking()
            .Include(b => b.Employee).ThenInclude(e => e.Department)
            .Include(b => b.Employee).ThenInclude(e => e.Shift)
            .Where(b => b.BreakDate >= fromDate.AddDays(-1) && b.BreakDate <= toDate.AddDays(1));

        if (employeeId.HasValue) query = query.Where(b => b.EmployeeId == employeeId.Value);
        if (departmentId.HasValue) query = query.Where(b => b.Employee.DepartmentId == departmentId.Value);
        if (!string.IsNullOrWhiteSpace(breakType) && BreakTypes.IsValid(breakType))
        {
            var type = BreakTypes.Normalize(breakType);
            query = query.Where(b => b.BreakType == type);
        }

        var list = await query.OrderByDescending(b => b.OutTime).ToListAsync();
        return list
            .Where(b =>
            {
                var period = ShiftWindow.ReportPeriod(b.Employee.Shift, TimeDisplay.AsLocal(b.OutTime));
                return period.HasValue && period.Value.StartDate >= fromDate && period.Value.StartDate <= toDate;
            })
            .Select(MapSession)
            .ToList();
    }

    private static BreakSessionDto MapSession(BreakSession b)
    {
        var outTime = TimeDisplay.AsLocal(b.OutTime);
        var inTime = TimeDisplay.AsLocal(b.InTime);
        var duration = inTime.HasValue
            ? TimeDisplay.ElapsedSeconds(outTime, inTime.Value)
            : TimeDisplay.ElapsedSeconds(outTime);
        var type = string.IsNullOrWhiteSpace(b.BreakType) ? BreakTypes.Comfort : b.BreakType;

        return new BreakSessionDto(
            b.Id,
            b.EmployeeId,
            b.Employee.EmployeeCode,
            b.Employee.FullName,
            b.Employee.Department.Name,
            type,
            outTime,
            inTime,
            duration,
            TimeDisplay.FormatSeconds(duration),
            b.BreakDate,
            inTime is null,
            b.IsAutoClosed);
    }

    private static int LookupAdjustment(
        IEnumerable<BreakTimeAdjustment> rows,
        int employeeId,
        DateOnly day,
        string breakType)
        => rows.FirstOrDefault(a =>
            a.EmployeeId == employeeId
            && a.BreakDate == day
            && breakType.Equals(a.BreakType, StringComparison.OrdinalIgnoreCase))
            ?.AdjustmentMinutes ?? 0;

    private static EmployeeBreakStatusDto BuildStatus(
        Employee employee,
        List<BreakSession> sessions,
        DateTime now,
        int comfortLimitMinutes,
        int mealLimitMinutes,
        ShiftPeriod? livePeriod,
        int mealStartLimit,
        int comfortStartLimit,
        int mealAdjustmentMinutes = 0,
        int comfortAdjustmentMinutes = 0)
    {
        var localNow = TimeDisplay.AsLocal(now);
        var withinShift = livePeriod.HasValue;
        var counted = withinShift
            ? sessions.Where(s => ShiftWindow.StartedIn(s.OutTime, livePeriod!.Value)).ToList()
            : new List<BreakSession>();

        var comfortSessions = counted.Where(s =>
            BreakTypes.Comfort.Equals(string.IsNullOrWhiteSpace(s.BreakType) ? BreakTypes.Comfort : s.BreakType, StringComparison.OrdinalIgnoreCase)).ToList();
        var mealSessions = counted.Where(s =>
            BreakTypes.Meal.Equals(s.BreakType, StringComparison.OrdinalIgnoreCase)).ToList();

        var comfortClosedSessions = comfortSessions.Where(s => s.InTime.HasValue).ToList();
        var mealClosedSessions = mealSessions.Where(s => s.InTime.HasValue).ToList();
        var comfortClosed = TimeDisplay.ComputeShiftTotalSeconds(comfortClosedSessions, localNow);
        var mealClosed = TimeDisplay.ComputeShiftTotalSeconds(mealClosedSessions, localNow);

        var open = sessions.FirstOrDefault(s => s.InTime is null);
        var openType = open is null
            ? null
            : (string.IsNullOrWhiteSpace(open.BreakType) ? BreakTypes.Comfort : BreakTypes.Normalize(open.BreakType));
        var openOut = open is null ? (DateTime?)null : TimeDisplay.AsLocal(open.OutTime);
        var closeAt = open is null
            ? null
            : ShiftWindow.AutoCloseAt(employee.Shift, open.BreakDate, openOut ?? open.OutTime);
        var stillOpen = open is not null && (!closeAt.HasValue || localNow < closeAt.Value);
        var openEnd = stillOpen || !closeAt.HasValue ? localNow : closeAt.Value;
        var openSeconds = openOut is null ? 0 : TimeDisplay.ElapsedSeconds(openOut.Value, openEnd);
        var openCountsTowardShift = openOut.HasValue && livePeriod.HasValue && livePeriod.Value.Contains(openOut.Value);
        var comfortOpen = stillOpen && openCountsTowardShift && BreakTypes.Comfort.Equals(openType, StringComparison.OrdinalIgnoreCase) ? openSeconds : 0;
        var mealOpen = stillOpen && openCountsTowardShift && BreakTypes.Meal.Equals(openType, StringComparison.OrdinalIgnoreCase) ? openSeconds : 0;
        if (!stillOpen && openCountsTowardShift && openSeconds > 0)
        {
            if (BreakTypes.Meal.Equals(openType, StringComparison.OrdinalIgnoreCase))
                mealClosed += openSeconds;
            else
                comfortClosed += openSeconds;
        }

        var comfortTotal = BreakTimeAdjustmentMath.Apply(comfortClosed + comfortOpen, comfortAdjustmentMinutes);
        var mealTotal = BreakTimeAdjustmentMath.Apply(mealClosed + mealOpen, mealAdjustmentMinutes);
        var (comfortStatus, comfortColor) = BreakStatusCodes.FromTotalSeconds(comfortTotal, comfortLimitMinutes);
        var (mealStatus, mealColor) = BreakStatusCodes.FromTotalSeconds(mealTotal, mealLimitMinutes);
        DateTime? shiftPeriodEnd = closeAt ?? livePeriod?.End;

        return new EmployeeBreakStatusDto(
            employee.Id,
            employee.EmployeeCode,
            employee.FullName,
            employee.DepartmentId,
            employee.Department.Name,
            comfortTotal,
            TimeDisplay.FormatSeconds(comfortTotal),
            comfortStatus,
            comfortColor,
            comfortClosedSessions.Count,
            mealTotal,
            TimeDisplay.FormatSeconds(mealTotal),
            mealStatus,
            mealColor,
            mealClosedSessions.Count,
            stillOpen,
            stillOpen ? openType : null,
            stillOpen ? openOut : null,
            stillOpen ? openSeconds : null,
            comfortClosed,
            mealClosed,
            withinShift,
            employee.Shift?.Name,
            employee.Shift is null
                ? null
                : ShiftService.BuildDisplayLabel(
                    employee.Shift.Name,
                    employee.Shift.StartTime,
                    employee.Shift.EndTime,
                    employee.Shift.SpansNextDay),
            withinShift ? null : ShiftWindow.NextStart(employee.Shift, localNow),
            comfortSessions.Count,
            mealSessions.Count,
            comfortStartLimit,
            mealStartLimit,
            shiftPeriodEnd,
            !string.IsNullOrEmpty(employee.PasscodeHash),
            mealLimitMinutes,
            comfortLimitMinutes,
            mealAdjustmentMinutes,
            comfortAdjustmentMinutes);
    }

    private static ResolvedBreakLimitsDto ResolveLimits(
        Employee employee,
        IReadOnlyDictionary<(int ShiftId, int DepartmentId), ResolvedBreakLimitsDto> limitsMap,
        IReadOnlyDictionary<int, (int Meal, int Comfort)> deptStartLimits,
        int mealStartFallback,
        int comfortStartFallback,
        int mealMinutesFallback,
        int comfortMinutesFallback)
    {
        if (employee.ShiftId.HasValue &&
            limitsMap.TryGetValue((employee.ShiftId.Value, employee.DepartmentId), out var resolved))
        {
            return resolved;
        }

        var dept = deptStartLimits.TryGetValue(employee.DepartmentId, out var starts)
            ? starts
            : (Meal: mealStartFallback, Comfort: comfortStartFallback);

        return new ResolvedBreakLimitsDto(
            dept.Meal,
            dept.Comfort,
            mealMinutesFallback,
            comfortMinutesFallback);
    }

    private async Task<int> CountStartsInPeriodAsync(int employeeId, string breakType, ShiftPeriod period)
    {
        var lookback = period.Start.AddDays(-1);
        var sessions = await _db.BreakSessions.AsNoTracking()
            .Where(b => b.EmployeeId == employeeId && b.OutTime >= lookback && b.OutTime < period.End.AddHours(1))
            .ToListAsync();

        var type = BreakTypes.Normalize(breakType);
        return sessions.Count(s =>
        {
            var sessionType = string.IsNullOrWhiteSpace(s.BreakType) ? BreakTypes.Comfort : BreakTypes.Normalize(s.BreakType);
            return type.Equals(sessionType, StringComparison.OrdinalIgnoreCase)
                && ShiftWindow.StartedIn(s.OutTime, period);
        });
    }
}
