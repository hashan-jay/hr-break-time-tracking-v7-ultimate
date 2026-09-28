using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IDepartmentService
{
    Task<IReadOnlyList<DepartmentDto>> GetAllAsync(bool includeDeleted = false, string? search = null);
    Task<DepartmentDto?> GetByIdAsync(int id);
    Task<(bool Ok, string? Error, DepartmentDto? Data)> CreateAsync(CreateDepartmentRequest request, string? userId);
    Task<(bool Ok, string? Error, DepartmentDto? Data)> UpdateAsync(int id, UpdateDepartmentRequest request, string? userId);
    Task<(bool Ok, string? Error)> DeleteAsync(int id, string? userId);
    Task<(bool Ok, string? Error, DepartmentDto? Data)> RecoverAsync(int id, string? userId);
}

public class DepartmentService : IDepartmentService
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly ISettingsService _settings;
    private readonly ILiveUpdateNotifier _liveUpdates;

    public DepartmentService(AppDbContext db, IAuditService audit, ISettingsService settings, ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _audit = audit;
        _settings = settings;
        _liveUpdates = liveUpdates;
    }

    public async Task<IReadOnlyList<DepartmentDto>> GetAllAsync(bool includeDeleted = false, string? search = null)
    {
        var query = _db.Departments.AsNoTracking().AsQueryable();
        if (!includeDeleted) query = query.Where(d => !d.IsDeleted);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(d => d.Name.ToLower().Contains(term) || (d.Description != null && d.Description.ToLower().Contains(term)));
        }

        return await query
            .OrderBy(d => d.IsDeleted)
            .ThenBy(d => d.Name)
            .Select(d => new DepartmentDto(
                d.Id,
                d.Name,
                d.Description,
                d.IsDeleted,
                d.DeletedAt,
                d.Employees.Count(e => !e.IsDeleted),
                d.CreatedAt,
                d.MealBreakStartLimit,
                d.ComfortBreakStartLimit))
            .ToListAsync();
    }

    public async Task<DepartmentDto?> GetByIdAsync(int id)
    {
        return await _db.Departments.AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new DepartmentDto(
                d.Id,
                d.Name,
                d.Description,
                d.IsDeleted,
                d.DeletedAt,
                d.Employees.Count(e => !e.IsDeleted),
                d.CreatedAt,
                d.MealBreakStartLimit,
                d.ComfortBreakStartLimit))
            .FirstOrDefaultAsync();
    }

    public async Task<(bool Ok, string? Error, DepartmentDto? Data)> CreateAsync(CreateDepartmentRequest request, string? userId)
    {
        var name = request.Name.Trim();
        if (await _db.Departments.AnyAsync(d => d.Name == name))
            return (false, "A department with this name already exists.", null);

        var entity = new Department
        {
            Name = name,
            Description = request.Description?.Trim(),
            CreatedAt = DateTime.UtcNow,
            MealBreakStartLimit = await _settings.GetMealStartLimitAsync(),
            ComfortBreakStartLimit = await _settings.GetComfortStartLimitAsync()
        };
        _db.Departments.Add(entity);
        await _db.SaveChangesAsync();
        await _settings.EnsureShiftDepartmentLimitsForDepartmentAsync(entity.Id);
        await _audit.LogAsync(userId, "Create", "Department", entity.Id.ToString(), $"Created department '{entity.Name}'.");
        await _liveUpdates.NotifyAsync("departments");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error, DepartmentDto? Data)> UpdateAsync(int id, UpdateDepartmentRequest request, string? userId)
    {
        var entity = await _db.Departments.FindAsync(id);
        if (entity is null) return (false, "Department not found.", null);
        if (entity.IsDeleted) return (false, "This department is deleted. Recover it before editing.", null);

        var name = request.Name.Trim();
        if (await _db.Departments.AnyAsync(d => d.Name == name && d.Id != id))
            return (false, "A department with this name already exists.", null);

        entity.Name = name;
        entity.Description = request.Description?.Trim();
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Update", "Department", entity.Id.ToString(), $"Updated department '{entity.Name}'.");
        await _liveUpdates.NotifyAsync("departments");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error)> DeleteAsync(int id, string? userId)
    {
        var entity = await _db.Departments.FindAsync(id);
        if (entity is null) return (false, "Department not found.");
        if (entity.IsDeleted) return (false, "Department is already deleted.");

        var hasEmployees = await _db.Employees.AnyAsync(e => e.DepartmentId == id && !e.IsDeleted);
        if (hasEmployees)
            return (false, "Cannot delete a department that still has active employees. Move or deactivate those employees first.");

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Delete", "Department", entity.Id.ToString(), $"Deleted department '{entity.Name}'.");
        await _liveUpdates.NotifyAsync("departments");
        return (true, null);
    }

    public async Task<(bool Ok, string? Error, DepartmentDto? Data)> RecoverAsync(int id, string? userId)
    {
        var entity = await _db.Departments.FindAsync(id);
        if (entity is null) return (false, "Department not found.", null);
        if (!entity.IsDeleted) return (false, "Department is not deleted.", null);

        entity.IsDeleted = false;
        entity.DeletedAt = null;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Recover", "Department", entity.Id.ToString(), $"Recovered department '{entity.Name}'.");
        await _liveUpdates.NotifyAsync("departments");
        return (true, null, await GetByIdAsync(entity.Id));
    }
}

public interface IEmployeeService
{
    Task<IReadOnlyList<EmployeeDto>> GetAllAsync(string? search = null, int? departmentId = null, bool includeDeactivated = false, bool deactivatedOnly = false);
    Task<EmployeeDto?> GetByIdAsync(int id);
    Task<(bool Ok, string? Error, EmployeeDto? Data)> CreateAsync(CreateEmployeeRequest request, string? userId);
    Task<(bool Ok, string? Error, EmployeeDto? Data)> UpdateAsync(int id, UpdateEmployeeRequest request, string? userId);
    Task<EmployeeCodeStatusDto> CheckCodeAsync(string? code, int? excludeId);
    Task<(bool Ok, string? Error, EmployeeDto? Data)> DeactivateAsync(int id, string? userId);
    Task<(bool Ok, string? Error, EmployeeDto? Data)> ActivateAsync(int id, string? userId);
    Task<(bool Ok, string? Error)> DeleteAsync(int id, string? userId);
}

public class EmployeeService : IEmployeeService
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly ILiveUpdateNotifier _liveUpdates;

    public EmployeeService(AppDbContext db, IAuditService audit, ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _audit = audit;
        _liveUpdates = liveUpdates;
    }

    private static EmployeeDto Map(Employee e) => new(
        e.Id,
        e.EmployeeCode,
        e.FullName,
        e.DepartmentId,
        e.Department.Name,
        e.ShiftId,
        e.Shift?.Name,
        e.Shift is null
            ? null
            : ShiftService.BuildDisplayLabel(e.Shift.Name, e.Shift.StartTime, e.Shift.EndTime, e.Shift.SpansNextDay),
        e.IsDeleted,
        e.DeletedAt,
        e.HireDate,
        !string.IsNullOrEmpty(e.PasscodeHash));

    public async Task<IReadOnlyList<EmployeeDto>> GetAllAsync(
        string? search = null,
        int? departmentId = null,
        bool includeDeactivated = false,
        bool deactivatedOnly = false)
    {
        var query = _db.Employees.AsNoTracking()
            .Include(e => e.Department)
            .Include(e => e.Shift)
            .AsQueryable();

        if (deactivatedOnly) query = query.Where(e => e.IsDeleted);
        else if (!includeDeactivated) query = query.Where(e => !e.IsDeleted);

        if (departmentId.HasValue) query = query.Where(e => e.DepartmentId == departmentId.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(e =>
                e.FullName.ToLower().Contains(term) ||
                e.EmployeeCode.ToLower().Contains(term) ||
                e.Department.Name.ToLower().Contains(term) ||
                (e.Shift != null && e.Shift.Name.ToLower().Contains(term)));
        }

        var list = await query
            .OrderBy(e => e.IsDeleted)
            .ThenBy(e => e.FullName)
            .ToListAsync();
        return list.Select(Map).ToList();
    }

    public async Task<EmployeeDto?> GetByIdAsync(int id)
    {
        var e = await _db.Employees.AsNoTracking()
            .Include(x => x.Department)
            .Include(x => x.Shift)
            .FirstOrDefaultAsync(x => x.Id == id);
        return e is null ? null : Map(e);
    }

    public async Task<(bool Ok, string? Error, EmployeeDto? Data)> CreateAsync(CreateEmployeeRequest request, string? userId)
    {
        var code = request.EmployeeCode.Trim();
        var codeError = await CodeTakenMessageAsync(code, excludeId: null);
        if (codeError is not null) return (false, codeError, null);

        var dept = await _db.Departments.FirstOrDefaultAsync(d => d.Id == request.DepartmentId && !d.IsDeleted);
        if (dept is null) return (false, "Department not found.", null);

        var shiftError = await ValidateShiftAsync(request.ShiftId);
        if (shiftError is not null) return (false, shiftError, null);

        var entity = new Employee
        {
            EmployeeCode = code,
            FullName = request.FullName.Trim(),
            DepartmentId = request.DepartmentId,
            ShiftId = request.ShiftId,
            HireDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        _db.Employees.Add(entity);
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Create", "Employee", entity.Id.ToString(), $"Created employee '{entity.FullName}' ({entity.EmployeeCode}).");
        await _liveUpdates.NotifyAsync("employees");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error, EmployeeDto? Data)> UpdateAsync(int id, UpdateEmployeeRequest request, string? userId)
    {
        var entity = await _db.Employees.FindAsync(id);
        if (entity is null) return (false, "Employee not found.", null);
        if (entity.IsDeleted) return (false, "This employee is deactivated. Activate them before editing.", null);

        var code = request.EmployeeCode.Trim();
        if (string.IsNullOrWhiteSpace(code))
            return (false, "Employee code is required.", null);

        var codeError = await CodeTakenMessageAsync(code, excludeId: id);
        if (codeError is not null) return (false, codeError, null);

        var deptExists = await _db.Departments.AnyAsync(d => d.Id == request.DepartmentId && !d.IsDeleted);
        if (!deptExists) return (false, "Department not found.", null);

        var shiftError = await ValidateShiftAsync(request.ShiftId);
        if (shiftError is not null) return (false, shiftError, null);

        var previousCode = entity.EmployeeCode;
        entity.EmployeeCode = code;
        entity.FullName = request.FullName.Trim();
        entity.DepartmentId = request.DepartmentId;
        entity.ShiftId = request.ShiftId;
        entity.HireDate = request.HireDate;
        entity.UpdatedAt = DateTime.UtcNow;
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsEmployeeCodeConflict(ex))
        {
            return (false, "This code is used by another user.", null);
        }
        var audit = !string.Equals(previousCode, entity.EmployeeCode, StringComparison.OrdinalIgnoreCase)
            ? $"Updated employee '{entity.FullName}' (code {previousCode} → {entity.EmployeeCode})."
            : $"Updated employee '{entity.FullName}'.";
        await _audit.LogAsync(userId, "Update", "Employee", entity.Id.ToString(), audit);
        await _liveUpdates.NotifyAsync("employees");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<EmployeeCodeStatusDto> CheckCodeAsync(string? code, int? excludeId)
    {
        var trimmed = (code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return new EmployeeCodeStatusDto(true, null);

        var message = await CodeTakenMessageAsync(trimmed, excludeId);
        return message is null
            ? new EmployeeCodeStatusDto(true, null)
            : new EmployeeCodeStatusDto(false, message);
    }

    private async Task<string?> CodeTakenMessageAsync(string code, int? excludeId)
    {
        var key = code.ToLower();
        var taken = await _db.Employees.AsNoTracking().AnyAsync(e =>
            e.EmployeeCode.ToLower() == key
            && (!excludeId.HasValue || e.Id != excludeId.Value));
        return taken ? "This code is used by another user." : null;
    }

    private static bool IsEmployeeCodeConflict(DbUpdateException ex)
    {
        var text = ex.InnerException?.Message ?? ex.Message;
        return text.Contains("IX_Employees_EmployeeCode", StringComparison.OrdinalIgnoreCase)
            || text.Contains("EmployeeCode", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<string?> ValidateShiftAsync(int? shiftId)
    {
        if (!shiftId.HasValue) return null;
        var shift = await _db.Shifts.AsNoTracking().FirstOrDefaultAsync(s => s.Id == shiftId.Value);
        if (shift is null) return "Shift not found.";
        if (!shift.IsActive) return "Selected shift is inactive. Choose an active shift.";
        return null;
    }

    public async Task<(bool Ok, string? Error, EmployeeDto? Data)> DeactivateAsync(int id, string? userId)
    {
        var entity = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id);
        if (entity is null) return (false, "Employee not found.", null);
        if (entity.IsDeleted) return (false, "Employee is already deactivated.", null);

        var closedBreaks = await CloseOpenBreaksAsync(id, userId);

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var details = closedBreaks > 0
            ? $"Deactivated employee '{entity.FullName}' ({entity.EmployeeCode}). Closed {closedBreaks} open break(s)."
            : $"Deactivated employee '{entity.FullName}' ({entity.EmployeeCode}). Existing records kept.";
        await _audit.LogAsync(userId, "Deactivate", "Employee", entity.Id.ToString(), details);
        await _liveUpdates.NotifyAsync("employees");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error, EmployeeDto? Data)> ActivateAsync(int id, string? userId)
    {
        var entity = await _db.Employees.Include(e => e.Department).FirstOrDefaultAsync(e => e.Id == id);
        if (entity is null) return (false, "Employee not found.", null);
        if (!entity.IsDeleted) return (false, "Employee is already active.", null);
        if (entity.Department is { IsDeleted: true })
            return (false, "Cannot activate this employee because their department is deleted. Recover the department first.", null);

        entity.IsDeleted = false;
        entity.DeletedAt = null;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Activate", "Employee", entity.Id.ToString(),
            $"Activated employee '{entity.FullName}' ({entity.EmployeeCode}).");
        await _liveUpdates.NotifyAsync("employees");
        return (true, null, await GetByIdAsync(entity.Id));
    }

    public async Task<(bool Ok, string? Error)> DeleteAsync(int id, string? userId)
    {
        var entity = await _db.Employees.FirstOrDefaultAsync(e => e.Id == id);
        if (entity is null) return (false, "Employee not found.");
        if (!entity.IsDeleted)
            return (false, "Only deactivated employees can be permanently deleted. Deactivate the employee first.");

        var fullName = entity.FullName;
        var code = entity.EmployeeCode;

        var sessions = await _db.BreakSessions.Where(b => b.EmployeeId == id).ToListAsync();
        _db.BreakSessions.RemoveRange(sessions);
        _db.Employees.Remove(entity);
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "Delete", "Employee", id.ToString(),
            $"Permanently deleted deactivated employee '{fullName}' ({code}) and {sessions.Count} break record(s).");
        await _liveUpdates.NotifyAsync("employees");
        return (true, null);
    }

    private async Task<int> CloseOpenBreaksAsync(int employeeId, string? userId)
    {
        var open = await _db.BreakSessions
            .Where(b => b.EmployeeId == employeeId && b.InTime == null)
            .ToListAsync();
        if (open.Count == 0) return 0;

        var now = TimeDisplay.NowLocal();
        foreach (var session in open)
        {
            session.OutTime = TimeDisplay.AsLocal(session.OutTime);
            var inTime = now < session.OutTime ? session.OutTime : now;
            var type = string.IsNullOrWhiteSpace(session.BreakType)
                ? BreakTypes.Comfort
                : BreakTypes.Normalize(session.BreakType);
            session.BreakType = type;
            session.InTime = inTime;
            session.DurationSeconds = TimeDisplay.ElapsedSeconds(session.OutTime, inTime);
            session.ClosedByUserId = userId;
            session.IsAutoClosed = false;
        }

        return open.Count;
    }
}
