using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IReportService
{
    Task<DashboardDto> GetDashboardAsync();
    Task<ReportSummaryDto> GetReportAsync(DateOnly from, DateOnly to, int? departmentId, int? employeeId, int? shiftId);
}

public class ReportService : IReportService
{
    private readonly AppDbContext _db;
    private readonly IBreakTrackingService _breakTracking;
    private readonly ISettingsService _settings;
    private readonly IBreakAutoCloseService _autoClose;

    public ReportService(
        AppDbContext db,
        IBreakTrackingService breakTracking,
        ISettingsService settings,
        IBreakAutoCloseService autoClose)
    {
        _db = db;
        _breakTracking = breakTracking;
        _settings = settings;
        _autoClose = autoClose;
    }

    public async Task<DashboardDto> GetDashboardAsync()
    {
        var today = TimeDisplay.TodayLocal();
        var from = today.AddDays(-29);
        var now = TimeDisplay.NowLocal();

        // DbContext is not thread-safe. Keep these reads sequential so one request
        // never starts a second query on the same scoped context.
        var board = await _breakTracking.GetLiveBoardAsync();
        var activeEmployees = await _db.Employees.CountAsync(e => !e.IsDeleted);
        var activeDepartments = await _db.Departments.CountAsync(d => !d.IsDeleted);
        var sessionRows = await _db.BreakSessions.AsNoTracking()
            .Where(b => b.BreakDate >= from.AddDays(-1) && b.BreakDate <= today)
            .Select(b => new
            {
                b.BreakDate,
                b.BreakType,
                b.DurationSeconds,
                b.OutTime,
                b.InTime,
                b.EmployeeId,
            })
            .ToListAsync();
        var sessionEmployeeIds = sessionRows.Select(r => r.EmployeeId).Distinct().ToList();
        var shiftRows = await _db.Shifts.AsNoTracking()
            .OrderBy(s => s.StartTime)
            .ThenBy(s => s.Name)
            .ToListAsync();
        var employeeShiftRows = (await _db.Employees.AsNoTracking()
            .Where(e => (!e.IsDeleted && e.ShiftId != null) || sessionEmployeeIds.Contains(e.Id))
            .Select(e => new { e.Id, e.ShiftId, e.IsDeleted })
            .ToListAsync())
            .Select(e => new WorkforceEfficiencyCalculator.EmployeeShiftRow(e.Id, e.ShiftId, e.IsDeleted))
            .ToList();

        var rows = sessionRows
            .Select(r => new DashboardSessionRow(
                r.BreakDate,
                r.BreakType,
                r.DurationSeconds,
                r.OutTime,
                r.InTime,
                r.EmployeeId))
            .ToList();
        var yesterday = today.AddDays(-1);
        var mealLimitSeconds = Math.Max(board.MealLimitMinutes, 1) * 60;
        var comfortLimitSeconds = Math.Max(board.ComfortLimitMinutes, 1) * 60;

        var points = Enumerable.Range(0, 30)
            .Select(offset =>
            {
                var date = from.AddDays(offset);
                var dayRows = rows.Where(r => r.BreakDate == date).ToList();
                var mealBreaks = dayRows.Count(r => IsMeal(r.BreakType));
                var comfortBreaks = dayRows.Count - mealBreaks;
                return new DashboardTrendPointDto(date, dayRows.Count, mealBreaks, comfortBreaks);
            })
            .ToList();

        var breaksToday = points[^1].Breaks;
        var breaksYesterday = points[^2].Breaks;
        var usageToday = ScoreUsage(rows, today, now, mealLimitSeconds, comfortLimitSeconds);
        var usageYesterday = ScoreUsage(rows, yesterday, now, mealLimitSeconds, comfortLimitSeconds);
        var efficiencySessions = rows
            .Select(r => new WorkforceEfficiencyCalculator.SessionRow(r.EmployeeId, r.OutTime, r.InTime))
            .ToList();
        var workforceEfficiency = WorkforceEfficiencyCalculator.Build(
            shiftRows,
            employeeShiftRows,
            efficiencySessions,
            from,
            today,
            now);

        return new DashboardDto(
            activeEmployees,
            activeDepartments,
            board.OnBreakCount,
            board.ComfortOnBreakCount,
            board.MealOnBreakCount,
            board.ComfortExceededCount,
            board.ComfortSatisfiedCount,
            board.ComfortWellSatisfiedCount,
            board.MealExceededCount,
            board.MealSatisfiedCount,
            board.MealWellSatisfiedCount,
            board.ComfortLimitMinutes,
            board.MealLimitMinutes,
            board.ComfortStartLimit,
            board.MealStartLimit,
            breaksToday,
            breaksYesterday,
            ChangePercent(breaksToday, breaksYesterday),
            usageToday.CompliancePercent,
            ChangePercent(usageToday.CompliancePercent, usageYesterday.CompliancePercent),
            usageToday.LimitBreaches,
            usageYesterday.LimitBreaches,
            ChangePercent(usageToday.LimitBreaches, usageYesterday.LimitBreaches),
            points,
            workforceEfficiency);
    }

    private static bool IsMeal(string? breakType)
        => BreakTypes.Meal.Equals(breakType, StringComparison.OrdinalIgnoreCase);

    private static double? ChangePercent(double current, double previous)
    {
        if (Math.Abs(previous) < 0.0001)
            return Math.Abs(current) < 0.0001 ? 0 : 100;
        return Math.Round((current - previous) / previous * 100, 1);
    }

    private static (double CompliancePercent, int LimitBreaches) ScoreUsage(
        IReadOnlyList<DashboardSessionRow> rows,
        DateOnly date,
        DateTime now,
        int mealLimitSeconds,
        int comfortLimitSeconds)
    {
        var dayRows = rows.Where(r => r.BreakDate == date).ToList();
        if (dayRows.Count == 0)
            return (100, 0);

        var breaches = 0;
        var usedEmployees = 0;
        foreach (var employeeRows in dayRows.GroupBy(r => r.EmployeeId))
        {
            usedEmployees++;
            var mealSeconds = SumSeconds(employeeRows, now, meal: true);
            var comfortSeconds = SumSeconds(employeeRows, now, meal: false);
            if (mealSeconds > mealLimitSeconds || comfortSeconds > comfortLimitSeconds)
                breaches++;
        }

        var compliance = usedEmployees == 0
            ? 100
            : Math.Round((usedEmployees - breaches) * 100d / usedEmployees, 1);
        return (compliance, breaches);
    }

    private static int SumSeconds(IEnumerable<DashboardSessionRow> employeeRows, DateTime now, bool meal)
    {
        var total = 0;
        foreach (var row in employeeRows)
        {
            if (IsMeal(row.BreakType) != meal)
                continue;
            if (row.DurationSeconds is int stored)
            {
                total += stored;
                continue;
            }

            var outTime = TimeDisplay.AsLocal(row.OutTime);
            var end = row.InTime is DateTime closed ? TimeDisplay.AsLocal(closed) : now;
            if (end > outTime)
                total += (int)(end - outTime).TotalSeconds;
        }
        return total;
    }

    private sealed record DashboardSessionRow(
        DateOnly BreakDate,
        string? BreakType,
        int? DurationSeconds,
        DateTime OutTime,
        DateTime? InTime,
        int EmployeeId);

    public async Task<ReportSummaryDto> GetReportAsync(DateOnly from, DateOnly to, int? departmentId, int? employeeId, int? shiftId)
    {
        await _autoClose.CloseExpiredAsync();
        if (to < from) (from, to) = (to, from);
        var comfortLimit = await _settings.GetComfortLimitMinutesAsync();
        var mealLimit = await _settings.GetMealLimitMinutesAsync();
        var comfortStartLimit = await _settings.GetComfortStartLimitAsync();
        var mealStartLimit = await _settings.GetMealStartLimitAsync();
        var limitsMap = await _settings.GetBreakLimitsMapAsync();
        var deptStartLimits = await _settings.GetStartLimitsByDepartmentAsync();
        var mealMinutesDefault = mealLimit;
        var comfortMinutesDefault = comfortLimit;

        Shift? selectedShift = null;
        string? shiftName = null;
        string? shiftDisplay = null;
        if (shiftId.HasValue)
        {
            selectedShift = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == shiftId.Value);
            if (selectedShift is not null)
            {
                shiftName = selectedShift.Name;
                shiftDisplay = ShiftService.BuildDisplayLabel(
                    selectedShift.Name, selectedShift.StartTime, selectedShift.EndTime, selectedShift.SpansNextDay);
            }
        }

        var rosterQuery = _db.Employees.AsNoTracking()
            .Include(e => e.Department)
            .Include(e => e.Shift)
            .Where(e => !e.IsDeleted || employeeId.HasValue);
        if (departmentId.HasValue)
            rosterQuery = rosterQuery.Where(e => e.DepartmentId == departmentId.Value);
        if (employeeId.HasValue)
            rosterQuery = rosterQuery.Where(e => e.Id == employeeId.Value);
        if (shiftId.HasValue)
            rosterQuery = rosterQuery.Where(e => e.ShiftId == shiftId.Value);

        var filterToRoster = departmentId.HasValue || employeeId.HasValue || shiftId.HasValue;
        var roster = await rosterQuery.OrderBy(e => e.FullName).ToListAsync();

        var fromStart = from.AddDays(-1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        var toEnd = to.AddDays(2).ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);

        var sessionsQuery = _db.BreakSessions.AsNoTracking()
            .Include(b => b.Employee).ThenInclude(e => e.Department)
            .Include(b => b.Employee).ThenInclude(e => e.Shift)
            .Where(b => b.InTime == null ||
                        (b.BreakDate >= from.AddDays(-1) && b.BreakDate <= to.AddDays(1)) ||
                        (b.OutTime >= fromStart && b.OutTime < toEnd));
        if (departmentId.HasValue)
            sessionsQuery = sessionsQuery.Where(b => b.Employee.DepartmentId == departmentId.Value);
        if (employeeId.HasValue)
            sessionsQuery = sessionsQuery.Where(b => b.EmployeeId == employeeId.Value);
        if (shiftId.HasValue)
            sessionsQuery = sessionsQuery.Where(b => b.Employee.ShiftId == shiftId.Value);

        var sessions = await sessionsQuery.ToListAsync();
        foreach (var session in sessions)
        {
            session.OutTime = TimeDisplay.AsLocal(session.OutTime);
            session.InTime = TimeDisplay.AsLocal(session.InTime);
            if (string.IsNullOrWhiteSpace(session.BreakType))
                session.BreakType = BreakTypes.Comfort;
        }

        var now = TimeDisplay.NowLocal();
        var dayByDay = from < to;

        var inRange = new List<(BreakSession Session, ShiftPeriod Period)>();
        foreach (var session in sessions)
        {
            var period = ShiftWindow.ReportPeriod(session.Employee.Shift, session.OutTime);
            if (!period.HasValue) continue;
            if (period.Value.StartDate < from || period.Value.StartDate > to) continue;
            if (selectedShift is not null)
            {
                var expected = ShiftWindow.StartingOn(selectedShift, period.Value.StartDate);
                if (period.Value.Start != expected.Start || period.Value.End != expected.End)
                    continue;
            }
            inRange.Add((session, period.Value));
        }

        var sessionsByEmployee = inRange
            .GroupBy(x => x.Session.EmployeeId)
            .ToDictionary(g => g.Key, g => g.ToList());

        if (!filterToRoster)
        {
            roster = sessionsByEmployee.Keys
                .Select(id => inRange.First(x => x.Session.EmployeeId == id).Session.Employee)
                .DistinctBy(e => e.Id)
                .OrderBy(e => e.FullName)
                .ToList();
        }
        else
        {
            var rosterIds = roster.Select(e => e.Id).ToHashSet();
            var extra = sessionsByEmployee.Keys
                .Where(id => !rosterIds.Contains(id))
                .Select(id => inRange.First(x => x.Session.EmployeeId == id).Session.Employee)
                .DistinctBy(e => e.Id);
            roster = roster.Concat(extra).OrderBy(e => e.FullName).ToList();
        }

        var storedAdjustments = await _db.BreakTimeAdjustments.AsNoTracking()
            .Where(a => a.BreakDate >= from && a.BreakDate <= to)
            .ToListAsync();
        var adjMap = storedAdjustments
            .GroupBy(a => (a.EmployeeId, a.BreakDate, Type: BreakTypes.Normalize(a.BreakType)))
            .ToDictionary(g => g.Key, g => g.First().AdjustmentMinutes);

        var rows = new List<ReportRowDto>();
        foreach (var employee in roster)
        {
            var empItems = sessionsByEmployee.GetValueOrDefault(employee.Id) ?? [];
            var limits = ResolveLimits(
                employee, limitsMap, deptStartLimits,
                mealStartLimit, comfortStartLimit, mealMinutesDefault, comfortMinutesDefault);

            if (!dayByDay)
            {
                rows.Add(BuildDayRow(employee, empItems, from, now, limits, adjMap));
                continue;
            }

            var byDay = empItems
                .GroupBy(x => x.Period.StartDate)
                .ToDictionary(g => g.Key, g => g.ToList());

            // A named employee gets every selected day so a monthly report is complete.
            // Otherwise list only days that have break records.
            var dates = employeeId.HasValue
                ? EachDate(from, to)
                : byDay.Keys.OrderBy(d => d).ToList();

            foreach (var day in dates)
            {
                var dayItems = byDay.GetValueOrDefault(day) ?? [];
                rows.Add(BuildDayRow(employee, dayItems, day, now, limits, adjMap));
            }
        }

        rows = rows
            .OrderBy(r => r.EmployeeName)
            .ThenBy(r => r.Date)
            .ToList();

        return new ReportSummaryDto(
            from,
            to,
            comfortLimit,
            mealLimit,
            rows.Select(r => r.EmployeeId).Distinct().Count(),
            rows.Count(r => r.ComfortStatus == BreakStatusCodes.WellSatisfied),
            0,
            rows.Count(r => r.ComfortStatus == BreakStatusCodes.Exceeded),
            rows.Count(r => r.MealStatus == BreakStatusCodes.WellSatisfied),
            0,
            rows.Count(r => r.MealStatus == BreakStatusCodes.Exceeded),
            shiftId,
            shiftName,
            shiftDisplay,
            rows,
            comfortStartLimit,
            mealStartLimit);
    }

    private static (int TotalSeconds, int Count, bool Exceeded) SumBreakType(
        IReadOnlyList<(BreakSession Session, ShiftPeriod Period)> items,
        string breakType,
        DateTime now,
        int limitMinutes)
    {
        var typed = items.Where(x =>
        {
            var type = string.IsNullOrWhiteSpace(x.Session.BreakType) ? BreakTypes.Comfort : x.Session.BreakType;
            return breakType.Equals(type, StringComparison.OrdinalIgnoreCase);
        }).ToList();

        var total = 0;
        var exceeded = false;
        foreach (var periodGroup in typed.GroupBy(x => (x.Period.Start, x.Period.End)))
        {
            var period = new ShiftPeriod(periodGroup.Key.Start, periodGroup.Key.End);
            var reference = now < period.End ? now : period.End;
            var seconds = TimeDisplay.ComputeShiftTotalSeconds(periodGroup.Select(x => x.Session), reference);
            total += seconds;
            var (status, _) = BreakStatusCodes.FromTotalSeconds(seconds, limitMinutes);
            if (status == BreakStatusCodes.Exceeded)
                exceeded = true;
        }

        return (total, typed.Count, exceeded);
    }

    private static IReadOnlyList<DateOnly> EachDate(DateOnly from, DateOnly to)
    {
        var dates = new List<DateOnly>();
        for (var day = from; day <= to; day = day.AddDays(1))
            dates.Add(day);
        return dates;
    }

    private static ResolvedBreakLimitsDto ResolveLimits(
        Employee employee,
        IReadOnlyDictionary<(int ShiftId, int DepartmentId), ResolvedBreakLimitsDto> limitsMap,
        IReadOnlyDictionary<int, (int Meal, int Comfort)> deptStartLimits,
        int mealStartLimit,
        int comfortStartLimit,
        int mealMinutesDefault,
        int comfortMinutesDefault)
    {
        if (employee.ShiftId.HasValue &&
            limitsMap.TryGetValue((employee.ShiftId.Value, employee.DepartmentId), out var resolved))
        {
            return resolved;
        }

        var dept = deptStartLimits.TryGetValue(employee.DepartmentId, out var starts)
            ? starts
            : (Meal: mealStartLimit, Comfort: comfortStartLimit);
        return new ResolvedBreakLimitsDto(
            dept.Meal,
            dept.Comfort,
            mealMinutesDefault,
            comfortMinutesDefault);
    }

    private static ReportRowDto BuildDayRow(
        Employee employee,
        IReadOnlyList<(BreakSession Session, ShiftPeriod Period)> items,
        DateOnly day,
        DateTime now,
        ResolvedBreakLimitsDto limits,
        IReadOnlyDictionary<(int EmployeeId, DateOnly Date, string Type), int> adjMap)
    {
        var meal = SumBreakType(items, BreakTypes.Meal, now, limits.MealLimitMinutes);
        var comfort = SumBreakType(items, BreakTypes.Comfort, now, limits.ComfortLimitMinutes);
        var mealSeconds = BreakTimeAdjustmentMath.Apply(
            meal.TotalSeconds, adjMap.GetValueOrDefault((employee.Id, day, BreakTypes.Meal)));
        var comfortSeconds = BreakTimeAdjustmentMath.Apply(
            comfort.TotalSeconds, adjMap.GetValueOrDefault((employee.Id, day, BreakTypes.Comfort)));
        var (mealStatus, mealColor) = BreakStatusCodes.FromTotalSeconds(mealSeconds, limits.MealLimitMinutes);
        var (comfortStatus, comfortColor) = BreakStatusCodes.FromTotalSeconds(comfortSeconds, limits.ComfortLimitMinutes);

        ShiftPeriod period;
        if (items.Count > 0)
            period = items[0].Period;
        else if (employee.Shift is not null)
            period = ShiftWindow.StartingOn(employee.Shift, day);
        else
            period = ShiftWindow.CalendarDay(day);

        return new ReportRowDto(
            employee.Id,
            employee.EmployeeCode,
            employee.FullName,
            employee.Department?.Name ?? "—",
            employee.Shift?.Name,
            day,
            comfortSeconds,
            TimeDisplay.FormatSeconds(comfortSeconds),
            comfortStatus,
            comfortColor,
            comfort.Count,
            mealSeconds,
            TimeDisplay.FormatSeconds(mealSeconds),
            mealStatus,
            mealColor,
            meal.Count,
            period.Start,
            period.End,
            day.ToString("yyyy-MM-dd"));
    }
}
