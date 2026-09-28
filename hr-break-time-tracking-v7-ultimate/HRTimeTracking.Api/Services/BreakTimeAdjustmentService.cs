using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IBreakTimeAdjustmentService
{
    Task<(bool Ok, string? Error, BreakTimeAdjustmentListDto? Data)> ListExceededAsync(DateOnly date);
    Task<(bool Ok, string? Error, BreakTimeAdjustmentRowDto? Data)> SaveAsync(
        SaveBreakTimeAdjustmentRequest request, string? userId);
}

public class BreakTimeAdjustmentService : IBreakTimeAdjustmentService
{
    public const int EditablePastDays = 3;

    private readonly AppDbContext _db;
    private readonly IReportService _reports;
    private readonly IAuditService _audit;
    private readonly ILiveUpdateNotifier _liveUpdates;

    public BreakTimeAdjustmentService(
        AppDbContext db,
        IReportService reports,
        IAuditService audit,
        ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _reports = reports;
        _audit = audit;
        _liveUpdates = liveUpdates;
    }

    public static (DateOnly Min, DateOnly Max) EditableWindow(DateOnly today)
        => (today.AddDays(-EditablePastDays), today);

    public async Task<(bool Ok, string? Error, BreakTimeAdjustmentListDto? Data)> ListExceededAsync(DateOnly date)
    {
        var today = TimeDisplay.TodayLocal();
        var (min, max) = EditableWindow(today);
        if (date < min || date > max)
            return (false, "Break times can only be adjusted for today and the past 3 days.", null);

        var report = await _reports.GetReportAsync(date, date, null, null, null);
        var stored = await _db.BreakTimeAdjustments.AsNoTracking()
            .Where(a => a.BreakDate == date)
            .ToListAsync();
        var byKey = stored.ToDictionary(
            a => (a.EmployeeId, BreakTypes.Normalize(a.BreakType)),
            a => a);

        var employeeIds = report.Rows.Select(r => r.EmployeeId).Distinct().ToList();
        var shiftByEmployee = employeeIds.Count == 0
            ? new Dictionary<int, int?>()
            : await _db.Employees.AsNoTracking()
                .Where(e => employeeIds.Contains(e.Id))
                .ToDictionaryAsync(e => e.Id, e => e.ShiftId);

        var rows = new List<BreakTimeAdjustmentRowDto>();
        foreach (var row in report.Rows)
        {
            shiftByEmployee.TryGetValue(row.EmployeeId, out var shiftId);
            if (UsedBreak(row.MealBreakCount, row.MealBreakSeconds))
                rows.Add(ToRow(row, BreakTypes.Meal, row.MealBreakSeconds, report.MealLimitMinutes, row.MealStatus, row.MealStatusColor, shiftId, byKey));
            if (UsedBreak(row.ComfortBreakCount, row.ComfortBreakSeconds))
                rows.Add(ToRow(row, BreakTypes.Comfort, row.ComfortBreakSeconds, report.ComfortLimitMinutes, row.ComfortStatus, row.ComfortStatusColor, shiftId, byKey));
        }

        var usedShiftIds = rows.Select(r => r.ShiftId).Where(id => id.HasValue).Select(id => id!.Value).ToHashSet();
        var shiftRows = await _db.Shifts.AsNoTracking()
            .Where(s => s.IsActive || usedShiftIds.Contains(s.Id))
            .OrderBy(s => s.StartTime)
            .ThenBy(s => s.Name)
            .ToListAsync();
        var shifts = shiftRows
            .Select(s => new BreakTimeAdjustmentShiftOptionDto(
                s.Id,
                s.Name,
                ShiftService.BuildDisplayLabel(s.Name, s.StartTime, s.EndTime, s.SpansNextDay)))
            .ToList();

        return (true, null, new BreakTimeAdjustmentListDto(
            date,
            min,
            max,
            report.MealLimitMinutes,
            report.ComfortLimitMinutes,
            rows
                .OrderBy(r => r.EmployeeName)
                .ThenBy(r => r.BreakType)
                .ToList(),
            shifts));
    }

    public async Task<(bool Ok, string? Error, BreakTimeAdjustmentRowDto? Data)> SaveAsync(
        SaveBreakTimeAdjustmentRequest request, string? userId)
    {
        var today = TimeDisplay.TodayLocal();
        var (min, max) = EditableWindow(today);
        if (request.Date < min || request.Date > max)
            return (false, "Break times can only be adjusted for today and the past 3 days.", null);

        if (!BreakTypes.IsValid(request.BreakType))
            return (false, "Break type must be Meal or Comfort.", null);

        var breakType = BreakTypes.Normalize(request.BreakType);
        var report = await _reports.GetReportAsync(request.Date, request.Date, null, request.EmployeeId, null);
        var row = report.Rows.FirstOrDefault(r => r.EmployeeId == request.EmployeeId);
        if (row is null)
            return (false, "No break record was found for that employee on the selected day.", null);

        var displayedNow = breakType == BreakTypes.Meal ? row.MealBreakSeconds : row.ComfortBreakSeconds;
        var limitMinutes = breakType == BreakTypes.Meal ? report.MealLimitMinutes : report.ComfortLimitMinutes;
        var existing = await _db.BreakTimeAdjustments
            .FirstOrDefaultAsync(a =>
                a.EmployeeId == request.EmployeeId
                && a.BreakDate == request.Date
                && a.BreakType == breakType);

        var currentAdj = existing?.AdjustmentMinutes ?? 0;
        var rawSeconds = displayedNow + currentAdj * 60;
        if (rawSeconds < 0)
            return (false, "There is no break time to adjust for this record.", null);

        if ((existing?.AttemptsUsed ?? 0) >= BreakTimeAdjustment.MaxAttempts)
            return (false, "This record has already used both adjustment attempts.", null);

        var requested = request.DisplayedTotalSeconds;
        var remainder = BreakTimeAdjustmentMath.RemainderSeconds(rawSeconds);
        var minSeconds = BreakTimeAdjustmentMath.MinDisplaySeconds(rawSeconds);
        var maxSeconds = BreakTimeAdjustmentMath.MaxDisplaySeconds(rawSeconds);
        if (requested < minSeconds || requested > maxSeconds)
            return (false, "Adjusted time must stay between 00:00 and 23:59 with the original seconds.", null);
        if ((rawSeconds - requested) % 60 != 0 || requested % 60 != remainder)
            return (false, "Only whole minutes can be changed. Seconds stay the same.", null);

        var newMinutes = (rawSeconds - requested) / 60;
        if (existing is null)
        {
            existing = new BreakTimeAdjustment
            {
                EmployeeId = request.EmployeeId,
                BreakDate = request.Date,
                BreakType = breakType,
                CreatedAt = DateTime.UtcNow,
            };
            _db.BreakTimeAdjustments.Add(existing);
        }

        existing.AdjustmentMinutes = newMinutes;
        existing.AttemptsUsed += 1;
        existing.UpdatedByUserId = userId;
        existing.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            userId,
            "BreakAdjust",
            "BreakTimeAdjustment",
            existing.Id.ToString(),
            $"{row.EmployeeName} ({row.EmployeeCode}) {breakType} {request.Date:yyyy-MM-dd}: {TimeDisplay.FormatSeconds(rawSeconds)} → {TimeDisplay.FormatSeconds(requested)} ({FormatMinuteDelta(newMinutes)}). Attempt {existing.AttemptsUsed}/{BreakTimeAdjustment.MaxAttempts}.");
        await _liveUpdates.NotifyAsync("breaks");

        var left = Math.Max(0, BreakTimeAdjustment.MaxAttempts - existing.AttemptsUsed);
        var (status, color) = BreakStatusCodes.FromTotalSeconds(requested, limitMinutes);
        var shiftId = await _db.Employees.AsNoTracking()
            .Where(e => e.Id == row.EmployeeId)
            .Select(e => e.ShiftId)
            .FirstOrDefaultAsync();
        return (true, null, new BreakTimeAdjustmentRowDto(
            row.EmployeeId,
            row.EmployeeCode,
            row.EmployeeName,
            row.DepartmentName,
            row.ShiftName,
            request.Date,
            breakType,
            limitMinutes,
            rawSeconds,
            TimeDisplay.FormatSeconds(rawSeconds),
            requested,
            TimeDisplay.FormatSeconds(requested),
            newMinutes,
            existing.AttemptsUsed,
            left,
            left > 0,
            shiftId,
            status,
            color));
    }

    private static string FormatMinuteDelta(int minutes)
        => minutes == 0 ? "0 min"
            : minutes > 0 ? $"-{minutes} min"
            : $"+{-minutes} min";

    private static bool UsedBreak(int count, int seconds) => count > 0 || seconds > 0;

    private static BreakTimeAdjustmentRowDto ToRow(
        ReportRowDto row,
        string breakType,
        int displayedSeconds,
        int fallbackLimit,
        string status,
        string statusColor,
        int? shiftId,
        IReadOnlyDictionary<(int EmployeeId, string BreakType), BreakTimeAdjustment> stored)
    {
        stored.TryGetValue((row.EmployeeId, breakType), out var adj);
        var minutes = adj?.AdjustmentMinutes ?? 0;
        var used = adj?.AttemptsUsed ?? 0;
        var left = Math.Max(0, BreakTimeAdjustment.MaxAttempts - used);
        var raw = displayedSeconds + minutes * 60;
        var limit = breakType == BreakTypes.Meal
            ? (fallbackLimit > 0 ? fallbackLimit : 60)
            : (fallbackLimit > 0 ? fallbackLimit : 20);
        return new BreakTimeAdjustmentRowDto(
            row.EmployeeId,
            row.EmployeeCode,
            row.EmployeeName,
            row.DepartmentName,
            row.ShiftName,
            row.Date,
            breakType,
            limit,
            raw,
            TimeDisplay.FormatSeconds(raw),
            displayedSeconds,
            TimeDisplay.FormatSeconds(displayedSeconds),
            minutes,
            used,
            left,
            left > 0,
            shiftId,
            string.IsNullOrWhiteSpace(status) ? BreakStatusCodes.FromTotalSeconds(displayedSeconds, limit).Status : status,
            string.IsNullOrWhiteSpace(statusColor) ? BreakStatusCodes.FromTotalSeconds(displayedSeconds, limit).Color : statusColor);
    }
}
