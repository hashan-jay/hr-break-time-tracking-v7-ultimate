using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IShiftService
{
    Task<IReadOnlyList<ShiftDto>> GetAllAsync(bool includeInactive = false);
    Task<ShiftDto?> GetByIdAsync(int id);
    Task<(bool Ok, string? Error, ShiftDto? Data)> CreateAsync(CreateShiftRequest request, string? userId);
    Task<(bool Ok, string? Error, ShiftDto? Data)> UpdateAsync(int id, UpdateShiftRequest request, string? userId);
    Task<(bool Ok, string? Error)> DeactivateAsync(int id, string? userId);
}

public class ShiftService : IShiftService
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly ISettingsService _settings;
    private readonly ILiveUpdateNotifier _liveUpdates;

    public ShiftService(AppDbContext db, IAuditService audit, ISettingsService settings, ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _audit = audit;
        _settings = settings;
        _liveUpdates = liveUpdates;
    }

    public static string FormatMilitary(TimeOnly time) => time.ToString("HH:mm");

    public static string BuildDisplayLabel(string name, TimeOnly start, TimeOnly end, bool spansNextDay)
    {
        var endLabel = spansNextDay
            ? $"{FormatMilitary(end)} (+1)"
            : FormatMilitary(end);
        return $"{name} ({FormatMilitary(start)} – {endLabel})";
    }

    public static bool IsHalfHour(TimeOnly time) =>
        time.Second == 0 && time.Millisecond == 0 && (time.Minute == 0 || time.Minute == 30);

    public static (bool Ok, string? Error, TimeOnly Start, TimeOnly End, bool SpansNextDay) ParseTimes(string startRaw, string endRaw)
    {
        if (!TimeOnly.TryParse(startRaw, out var start) || !TimeOnly.TryParse(endRaw, out var end))
            return (false, "Start and end times must be valid military times (HH:mm).", default, default, false);

        if (!IsHalfHour(start) || !IsHalfHour(end))
            return (false, "Shift times must use half-hour steps (e.g. 07:00, 07:30, 19:30).", default, default, false);

        if (start == end)
            return (false, "Start time and end time cannot be the same.", default, default, false);

        var spansNextDay = end <= start;
        return (true, null, start, end, spansNextDay);
    }

    private static ShiftDto Map(Shift s, int employeeCount) => new(
        s.Id,
        s.Name,
        FormatMilitary(s.StartTime),
        FormatMilitary(s.EndTime),
        s.SpansNextDay,
        BuildDisplayLabel(s.Name, s.StartTime, s.EndTime, s.SpansNextDay),
        s.IsActive,
        employeeCount,
        s.CreatedAt);

    public async Task<IReadOnlyList<ShiftDto>> GetAllAsync(bool includeInactive = false)
    {
        var query = _db.Shifts.AsNoTracking().AsQueryable();
        if (!includeInactive) query = query.Where(s => s.IsActive);

        return await query
            .OrderBy(s => s.StartTime)
            .ThenBy(s => s.Name)
            .Select(s => new ShiftDto(
                s.Id,
                s.Name,
                FormatMilitary(s.StartTime),
                FormatMilitary(s.EndTime),
                s.SpansNextDay,
                BuildDisplayLabel(s.Name, s.StartTime, s.EndTime, s.SpansNextDay),
                s.IsActive,
                s.Employees.Count(e => !e.IsDeleted),
                s.CreatedAt))
            .ToListAsync();
    }

    public async Task<ShiftDto?> GetByIdAsync(int id)
    {
        var s = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return null;
        var count = await _db.Employees.CountAsync(e => e.ShiftId == id && !e.IsDeleted);
        return Map(s, count);
    }

    public async Task<(bool Ok, string? Error, ShiftDto? Data)> CreateAsync(CreateShiftRequest request, string? userId)
    {
        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return (false, "Shift name is required.", null);

        if (await _db.Shifts.AnyAsync(s => s.Name == name))
            return (false, "A shift with this name already exists.", null);

        var parsed = ParseTimes(request.StartTime, request.EndTime);
        if (!parsed.Ok) return (false, parsed.Error, null);

        var entity = new Shift
        {
            Name = name,
            StartTime = parsed.Start,
            EndTime = parsed.End,
            SpansNextDay = parsed.SpansNextDay,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow
        };
        _db.Shifts.Add(entity);
        await _db.SaveChangesAsync();
        await _settings.EnsureShiftDepartmentLimitsForShiftAsync(entity.Id);
        await _audit.LogAsync(userId, "Create", "Shift", entity.Id.ToString(),
            $"Created shift '{entity.Name}' {FormatMilitary(entity.StartTime)}-{FormatMilitary(entity.EndTime)}" +
            (entity.SpansNextDay ? " (overnight)." : "."));
        await _liveUpdates.NotifyAsync("shifts");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error, ShiftDto? Data)> UpdateAsync(int id, UpdateShiftRequest request, string? userId)
    {
        var entity = await _db.Shifts.FindAsync(id);
        if (entity is null) return (false, "Shift not found.", null);

        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return (false, "Shift name is required.", null);

        if (await _db.Shifts.AnyAsync(s => s.Name == name && s.Id != id))
            return (false, "A shift with this name already exists.", null);

        var parsed = ParseTimes(request.StartTime, request.EndTime);
        if (!parsed.Ok) return (false, parsed.Error, null);

        entity.Name = name;
        entity.StartTime = parsed.Start;
        entity.EndTime = parsed.End;
        entity.SpansNextDay = parsed.SpansNextDay;
        entity.IsActive = request.IsActive;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Update", "Shift", entity.Id.ToString(),
            $"Updated shift '{entity.Name}' {FormatMilitary(entity.StartTime)}-{FormatMilitary(entity.EndTime)}" +
            (entity.SpansNextDay ? " (overnight)." : "."));
        await _liveUpdates.NotifyAsync("shifts");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error)> DeactivateAsync(int id, string? userId)
    {
        var entity = await _db.Shifts.FindAsync(id);
        if (entity is null) return (false, "Shift not found.");
        if (!entity.IsActive) return (false, "Shift is already inactive.");

        entity.IsActive = false;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Deactivate", "Shift", entity.Id.ToString(), $"Deactivated shift '{entity.Name}'.");
        await _liveUpdates.NotifyAsync("shifts");
        return (true, null);
    }
}
