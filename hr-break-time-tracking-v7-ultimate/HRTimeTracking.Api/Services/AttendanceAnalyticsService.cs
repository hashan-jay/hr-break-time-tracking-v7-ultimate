using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IAttendanceAnalyticsService
{
    Task<(bool Ok, string? Error, AttendanceAnalyticsDto? Data)> GetAsync(
        int? year,
        int? month,
        int? shiftId,
        int? departmentId,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Read-only monthly attendance analytics. Counts holiday days with the same
/// present and absent rules as the attendance roster. Does not write employee,
/// break, or shift rows.
/// </summary>
public class AttendanceAnalyticsService : IAttendanceAnalyticsService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(90);

    private readonly AppDbContext _db;
    private readonly ISettingsService _settings;
    private readonly IAttendanceAnalyticsCache _cache;

    public AttendanceAnalyticsService(
        AppDbContext db,
        ISettingsService settings,
        IAttendanceAnalyticsCache cache)
    {
        _db = db;
        _settings = settings;
        _cache = cache;
    }

    public async Task<(bool Ok, string? Error, AttendanceAnalyticsDto? Data)> GetAsync(
        int? year,
        int? month,
        int? shiftId,
        int? departmentId,
        CancellationToken cancellationToken = default)
    {
        var today = TimeDisplay.TodayLocal();
        var resolvedYear = year ?? today.Year;
        var resolvedMonth = month ?? today.Month;
        if (resolvedYear < 2000 || resolvedYear > 2100 || resolvedMonth is < 1 or > 12)
            return (false, "Choose a valid month.", null);

        var from = new DateOnly(resolvedYear, resolvedMonth, 1);
        var to = from.AddMonths(1).AddDays(-1);
        var limit = await _settings.GetMonthlyHolidayDayLimitAsync();
        var generation = await _cache.GetGenerationAsync(cancellationToken);
        var cacheKey = $"v{generation}:{resolvedYear:D4}-{resolvedMonth:D2}:s{shiftId?.ToString() ?? "all"}:d{departmentId?.ToString() ?? "all"}:l{limit}";

        var cached = await _cache.GetAsync<AttendanceAnalyticsDto>(cacheKey, cancellationToken);
        if (cached is (AttendanceAnalyticsDto snapshot, var cachedProvider))
            return (true, null, snapshot with { FromCache = true, CacheProvider = cachedProvider });

        var shifts = await LoadShiftsAsync(shiftId, cancellationToken);
        if (shiftId is int && shifts.Count == 0)
            return (false, "Shift not found.", null);
        if (shifts.Count == 0)
            return (false, "No active shifts are configured.", null);

        if (departmentId is int selectedDepartment)
        {
            var departmentExists = await _db.Departments.AsNoTracking()
                .AnyAsync(d => d.Id == selectedDepartment, cancellationToken);
            if (!departmentExists)
                return (false, "Department not found.", null);
        }

        var departmentOptions = await _db.Departments.AsNoTracking()
            .Where(d => !d.IsDeleted)
            .OrderBy(d => d.Name)
            .Select(d => new AttendanceAnalyticsOptionDto(d.Id, d.Name))
            .ToListAsync(cancellationToken);

        var shiftIds = shifts.Select(s => s.Id).ToList();
        var employeesQuery = _db.Employees.AsNoTracking()
            .Where(e => !e.IsDeleted && e.ShiftId != null && shiftIds.Contains(e.ShiftId.Value));
        if (departmentId is int departmentFilter)
            employeesQuery = employeesQuery.Where(e => e.DepartmentId == departmentFilter);

        var employees = await employeesQuery
            .OrderBy(e => e.FullName)
            .Select(e => new AnalyticsEmployee(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.Department.Name,
                e.HireDate,
                e.ShiftId!.Value,
                e.Shift!.Name))
            .ToListAsync(cancellationToken);

        var employeeIds = employees.Select(e => e.Id).ToList();
        var sessionRows = employeeIds.Count == 0
            ? []
            : await _db.BreakSessions.AsNoTracking()
                .Where(b => employeeIds.Contains(b.EmployeeId) && b.BreakDate >= from && b.BreakDate <= to)
                .Select(b => new SessionRow(b.EmployeeId, b.BreakType, b.OutTime, b.InTime, b.BreakDate))
                .ToListAsync(cancellationToken);

        var marksByEmployeeDay = sessionRows
            .GroupBy(s => (s.EmployeeId, s.BreakDate))
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<AttendanceRules.BreakMark>)g
                    .Select(s => new AttendanceRules.BreakMark(s.BreakType, s.OutTime, s.InTime))
                    .ToList());

        var employeesByShift = employees
            .GroupBy(e => e.ShiftId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<AnalyticsEmployee>)g.ToList());

        var now = TimeDisplay.NowLocal();
        var totals = employees.ToDictionary(e => e.Id, _ => new PersonTotals());
        var daily = new Dictionary<DateOnly, DayTotals>();
        var departments = new Dictionary<string, DepartmentTotals>(StringComparer.OrdinalIgnoreCase);

        for (var day = from; day <= to; day = day.AddDays(1))
        {
            foreach (var shift in shifts)
            {
                var period = ShiftWindow.StartingOn(shift, day);
                var showAbsent = AttendanceRules.ShowAbsent(period, now);
                var roster = employeesByShift.GetValueOrDefault(shift.Id) ?? [];

                foreach (var employee in roster)
                {
                    if (DateOnly.FromDateTime(TimeDisplay.AsLocal(employee.HireDate)) > day)
                        continue;

                    var marks = marksByEmployeeDay.TryGetValue((employee.Id, day), out var found)
                        ? found
                        : [];
                    var person = totals[employee.Id];
                    person.Scheduled = true;

                    if (!daily.TryGetValue(day, out var dayTotals))
                    {
                        dayTotals = new DayTotals();
                        daily[day] = dayTotals;
                    }

                    if (!departments.TryGetValue(employee.DepartmentName, out var departmentTotals))
                    {
                        departmentTotals = new DepartmentTotals();
                        departments[employee.DepartmentName] = departmentTotals;
                    }

                    departmentTotals.Employees.Add(employee.Id);

                    if (AttendanceRules.IsPresent(marks, period))
                    {
                        person.Present++;
                        dayTotals.Present++;
                        departmentTotals.Present++;
                    }
                    else if (showAbsent)
                    {
                        person.Holiday++;
                        person.LastHoliday = day;
                        dayTotals.Holiday++;
                        departmentTotals.Holiday++;
                    }
                    else
                    {
                        person.Pending++;
                        dayTotals.Pending++;
                    }
                }
            }
        }

        var people = employees
            .Where(e => totals[e.Id].Scheduled)
            .Select(e =>
            {
                var row = totals[e.Id];
                return new AttendanceAnalyticsPersonDto(
                    e.Id,
                    e.EmployeeCode,
                    e.FullName,
                    e.DepartmentName,
                    e.ShiftName,
                    row.Present,
                    row.Holiday,
                    row.Pending,
                    limit,
                    HolidayLimitRules.Excess(row.Holiday, limit),
                    HolidayLimitRules.Exceeds(row.Holiday, limit),
                    HolidayLimitRules.AttendanceRate(row.Present, row.Holiday),
                    row.LastHoliday);
            })
            .OrderByDescending(p => p.ExceedsLimit)
            .ThenByDescending(p => p.ExcessDays)
            .ThenByDescending(p => p.HolidayDays)
            .ThenBy(p => p.FullName)
            .ToList();

        var presentDays = people.Sum(p => p.PresentDays);
        var holidayDays = people.Sum(p => p.HolidayDays);
        var pendingDays = people.Sum(p => p.PendingDays);
        var exceeded = people.Where(p => p.ExceedsLimit).ToList();

        var departmentRows = departments
            .Select(pair =>
            {
                var exceededCount = people.Count(p =>
                    p.ExceedsLimit && string.Equals(p.DepartmentName, pair.Key, StringComparison.OrdinalIgnoreCase));
                return new AttendanceAnalyticsDepartmentDto(
                    pair.Key,
                    pair.Value.Employees.Count,
                    pair.Value.Holiday,
                    exceededCount,
                    HolidayLimitRules.AttendanceRate(pair.Value.Present, pair.Value.Holiday));
            })
            .OrderByDescending(d => d.ExceededCount)
            .ThenByDescending(d => d.HolidayDays)
            .ThenBy(d => d.DepartmentName)
            .ToList();

        var dailyRows = daily
            .OrderBy(pair => pair.Key)
            .Select(pair => new AttendanceAnalyticsDayDto(
                pair.Key,
                pair.Value.Present,
                pair.Value.Holiday,
                pair.Value.Pending))
            .ToList();

        string? shiftName = null;
        if (shifts.Count == 1 && shiftId is int)
            shiftName = shifts[0].Name;

        var computed = new AttendanceAnalyticsDto(
            resolvedYear,
            resolvedMonth,
            from.ToString("MMMM yyyy"),
            from,
            to,
            shiftId,
            shiftName,
            departmentId,
            limit,
            people.Count,
            presentDays,
            holidayDays,
            pendingDays,
            HolidayLimitRules.AttendanceRate(presentDays, holidayDays),
            exceeded.Count,
            people.Count - exceeded.Count,
            HolidayLimitRules.RuleSummary,
            false,
            "memory",
            now,
            departmentOptions,
            dailyRows,
            departmentRows,
            exceeded,
            people);

        var storedProvider = await _cache.SetAsync(cacheKey, computed, CacheTtl, cancellationToken);
        return (true, null, computed with { CacheProvider = storedProvider });
    }

    private async Task<List<Shift>> LoadShiftsAsync(int? shiftId, CancellationToken cancellationToken)
    {
        if (shiftId is int id)
        {
            var selected = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
            return selected is null ? [] : [selected];
        }

        return await _db.Shifts.AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.StartTime)
            .ThenBy(s => s.Name)
            .ToListAsync(cancellationToken);
    }

    private sealed record AnalyticsEmployee(
        int Id,
        string EmployeeCode,
        string FullName,
        string DepartmentName,
        DateTime HireDate,
        int ShiftId,
        string ShiftName);

    private sealed record SessionRow(
        int EmployeeId,
        string BreakType,
        DateTime OutTime,
        DateTime? InTime,
        DateOnly BreakDate);

    private sealed class PersonTotals
    {
        public bool Scheduled { get; set; }
        public int Present { get; set; }
        public int Holiday { get; set; }
        public int Pending { get; set; }
        public DateOnly? LastHoliday { get; set; }
    }

    private sealed class DayTotals
    {
        public int Present { get; set; }
        public int Holiday { get; set; }
        public int Pending { get; set; }
    }

    private sealed class DepartmentTotals
    {
        public HashSet<int> Employees { get; } = [];
        public int Present { get; set; }
        public int Holiday { get; set; }
    }
}
