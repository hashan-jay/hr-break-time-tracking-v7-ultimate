using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IAttendanceService
{
    Task<IReadOnlyList<ShiftDto>> GetShiftsAsync();
    Task<(bool Ok, string? Error, AttendanceRosterDto? Data)> GetRosterAsync(DateOnly date, int? shiftId);
    Task<(bool Ok, string? Error, AttendanceReportDto? Data)> GetReportAsync(
        DateOnly from,
        DateOnly to,
        int? shiftId,
        int? departmentId,
        int? employeeId);
}

/// <summary>
/// Read-only attendance. Queries existing employees, shifts, and break sessions.
/// Does not insert, update, or delete any rows.
/// </summary>
public class AttendanceService : IAttendanceService
{
    private readonly AppDbContext _db;
    private readonly IShiftService _shifts;

    public AttendanceService(AppDbContext db, IShiftService shifts)
    {
        _db = db;
        _shifts = shifts;
    }

    public Task<IReadOnlyList<ShiftDto>> GetShiftsAsync() => _shifts.GetAllAsync(includeInactive: false);

    public async Task<(bool Ok, string? Error, AttendanceRosterDto? Data)> GetRosterAsync(DateOnly date, int? shiftId)
    {
        var shift = await ResolveShiftAsync(shiftId);
        if (shift is null)
        {
            return (false, shiftId is null
                ? "No active shifts are configured."
                : "Shift not found.", null);
        }

        var now = TimeDisplay.NowLocal();
        var period = ShiftWindow.StartingOn(shift, date);
        var showAbsent = AttendanceRules.ShowAbsent(period, now);

        var employees = await _db.Employees.AsNoTracking()
            .Where(e => !e.IsDeleted && e.ShiftId == shift.Id)
            .OrderBy(e => e.FullName)
            .Select(e => new RosterEmployee(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.Department.Name,
                e.HireDate,
                e.ShiftId ?? 0))
            .ToListAsync();

        var employed = employees
            .Where(e => DateOnly.FromDateTime(TimeDisplay.AsLocal(e.HireDate)) <= date)
            .ToList();
        var employeeIds = employed.Select(e => e.Id).ToList();

        var sessionRows = employeeIds.Count == 0
            ? []
            : await _db.BreakSessions.AsNoTracking()
                .Where(b => employeeIds.Contains(b.EmployeeId) && b.BreakDate == date)
                .Select(b => new SessionRow(b.EmployeeId, b.BreakType, b.OutTime, b.InTime, b.BreakDate))
                .ToListAsync();

        var byEmployee = sessionRows
            .GroupBy(s => s.EmployeeId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<AttendanceRules.BreakMark>)g
                    .Select(s => new AttendanceRules.BreakMark(s.BreakType, s.OutTime, s.InTime))
                    .ToList());

        var present = new List<AttendancePersonDto>();
        var absent = new List<AttendancePersonDto>();

        foreach (var employee in employed)
        {
            var marks = byEmployee.TryGetValue(employee.Id, out var found)
                ? found
                : [];

            if (AttendanceRules.IsPresent(marks, period))
            {
                present.Add(new AttendancePersonDto(
                    employee.Id,
                    employee.EmployeeCode,
                    employee.FullName,
                    employee.DepartmentName,
                    "PRESENT",
                    AttendanceRules.Summarize(marks, period),
                    AttendanceRules.LastEndedAt(marks, period)));
                continue;
            }

            if (!showAbsent)
                continue;

            absent.Add(new AttendancePersonDto(
                employee.Id,
                employee.EmployeeCode,
                employee.FullName,
                employee.DepartmentName,
                "ABSENT",
                "",
                null));
        }

        var roster = new AttendanceRosterDto(
            date,
            shift.Id,
            shift.Name,
            ShiftService.BuildDisplayLabel(shift.Name, shift.StartTime, shift.EndTime, shift.SpansNextDay),
            ShiftService.FormatMilitary(shift.StartTime),
            ShiftService.FormatMilitary(shift.EndTime),
            shift.SpansNextDay,
            period.Start,
            period.End,
            period.End - AttendanceRules.AbsentLead,
            showAbsent,
            now,
            present.Count,
            showAbsent ? absent.Count : 0,
            present,
            showAbsent ? absent : []);

        return (true, null, roster);
    }

    public async Task<(bool Ok, string? Error, AttendanceReportDto? Data)> GetReportAsync(
        DateOnly from,
        DateOnly to,
        int? shiftId,
        int? departmentId,
        int? employeeId)
    {
        if (to < from) (from, to) = (to, from);
        if (to.DayNumber - from.DayNumber > 366)
            return (false, "Choose a date range of 366 days or less.", null);

        var shifts = await LoadReportShiftsAsync(shiftId);
        if (shiftId is int && shifts.Count == 0)
            return (false, "Shift not found.", null);
        if (shifts.Count == 0)
            return (false, "No active shifts are configured.", null);

        var shiftIds = shifts.Select(s => s.Id).ToList();
        var employeesQuery = _db.Employees.AsNoTracking()
            .Where(e => e.ShiftId != null && shiftIds.Contains(e.ShiftId.Value));
        if (employeeId is int selectedEmployee)
            employeesQuery = employeesQuery.Where(e => e.Id == selectedEmployee);
        else
            employeesQuery = employeesQuery.Where(e => !e.IsDeleted);
        if (departmentId is int selectedDepartment)
            employeesQuery = employeesQuery.Where(e => e.DepartmentId == selectedDepartment);

        var employees = await employeesQuery
            .OrderBy(e => e.FullName)
            .Select(e => new RosterEmployee(
                e.Id,
                e.EmployeeCode,
                e.FullName,
                e.Department.Name,
                e.HireDate,
                e.ShiftId!.Value))
            .ToListAsync();

        var employeeIds = employees.Select(e => e.Id).ToList();
        var sessionRows = employeeIds.Count == 0
            ? []
            : await _db.BreakSessions.AsNoTracking()
                .Where(b => employeeIds.Contains(b.EmployeeId) && b.BreakDate >= from && b.BreakDate <= to)
                .Select(b => new SessionRow(b.EmployeeId, b.BreakType, b.OutTime, b.InTime, b.BreakDate))
                .ToListAsync();

        var marksByEmployeeDay = sessionRows
            .GroupBy(s => (s.EmployeeId, s.BreakDate))
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<AttendanceRules.BreakMark>)g
                    .Select(s => new AttendanceRules.BreakMark(s.BreakType, s.OutTime, s.InTime))
                    .ToList());

        var employeesByShift = employees
            .GroupBy(e => e.ShiftId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var now = TimeDisplay.NowLocal();
        var rows = new List<AttendanceReportRowDto>();
        var pendingShiftDays = 0;
        var absentIncluded = false;

        for (var day = from; day <= to; day = day.AddDays(1))
        {
            foreach (var shift in shifts)
            {
                var period = ShiftWindow.StartingOn(shift, day);
                var showAbsent = AttendanceRules.ShowAbsent(period, now);
                var roster = employeesByShift.GetValueOrDefault(shift.Id) ?? [];
                var employed = roster
                    .Where(e => DateOnly.FromDateTime(TimeDisplay.AsLocal(e.HireDate)) <= day)
                    .ToList();
                if (employed.Count == 0)
                    continue;

                if (showAbsent)
                    absentIncluded = true;
                else
                    pendingShiftDays++;

                var shiftDisplay = ShiftService.BuildDisplayLabel(
                    shift.Name, shift.StartTime, shift.EndTime, shift.SpansNextDay);

                foreach (var employee in employed)
                {
                    var marks = marksByEmployeeDay.TryGetValue((employee.Id, day), out var found)
                        ? found
                        : [];

                    if (AttendanceRules.IsPresent(marks, period))
                    {
                        rows.Add(new AttendanceReportRowDto(
                            day,
                            employee.Id,
                            employee.EmployeeCode,
                            employee.FullName,
                            employee.DepartmentName,
                            shift.Id,
                            shift.Name,
                            shiftDisplay,
                            "PRESENT",
                            "green",
                            AttendanceRules.Summarize(marks, period),
                            AttendanceRules.LastEndedAt(marks, period)));
                        continue;
                    }

                    if (!showAbsent)
                        continue;

                    rows.Add(new AttendanceReportRowDto(
                        day,
                        employee.Id,
                        employee.EmployeeCode,
                        employee.FullName,
                        employee.DepartmentName,
                        shift.Id,
                        shift.Name,
                        shiftDisplay,
                        "ABSENT",
                        "red",
                        "",
                        null));
                }
            }
        }

        rows = rows
            .OrderBy(r => r.Date)
            .ThenBy(r => r.ShiftDisplay)
            .ThenBy(r => r.Status == "PRESENT" ? 0 : 1)
            .ThenBy(r => r.EmployeeName)
            .ToList();

        string? filterShiftName = null;
        string? filterShiftDisplay = null;
        if (shifts.Count == 1 && shiftId is int)
        {
            filterShiftName = shifts[0].Name;
            filterShiftDisplay = ShiftService.BuildDisplayLabel(
                shifts[0].Name, shifts[0].StartTime, shifts[0].EndTime, shifts[0].SpansNextDay);
        }

        var report = new AttendanceReportDto(
            from,
            to,
            shiftId,
            filterShiftName,
            filterShiftDisplay,
            rows.Count(r => r.Status == "PRESENT"),
            rows.Count(r => r.Status == "ABSENT"),
            pendingShiftDays,
            absentIncluded,
            rows);

        return (true, null, report);
    }

    private async Task<List<Shift>> LoadReportShiftsAsync(int? shiftId)
    {
        if (shiftId is int id)
        {
            var selected = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
            return selected is null ? [] : [selected];
        }

        return await _db.Shifts.AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.StartTime)
            .ThenBy(s => s.Name)
            .ToListAsync();
    }

    private async Task<Shift?> ResolveShiftAsync(int? shiftId)
    {
        if (shiftId is int id)
        {
            return await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
        }

        var active = await _db.Shifts.AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.StartTime)
            .ThenBy(s => s.Name)
            .ToListAsync();

        var now = TimeDisplay.NowLocal();
        return active.FirstOrDefault(s => ShiftWindow.ActiveAt(s, now).HasValue) ?? active.FirstOrDefault();
    }

    private sealed record RosterEmployee(
        int Id,
        string EmployeeCode,
        string FullName,
        string DepartmentName,
        DateTime HireDate,
        int ShiftId = 0);

    private sealed record SessionRow(
        int EmployeeId,
        string BreakType,
        DateTime OutTime,
        DateTime? InTime,
        DateOnly BreakDate = default);
}
