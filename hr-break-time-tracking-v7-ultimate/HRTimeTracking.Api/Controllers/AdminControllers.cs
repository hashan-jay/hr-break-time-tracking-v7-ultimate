using HRTimeTracking.Api.Authorization;
using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = AppRoles.Developer)]
public class UsersController : ControllerBase
{
    private readonly IUserAdminService _service;
    private readonly IPermissionService _permissions;

    public UsersController(IUserAdminService service, IPermissionService permissions)
    {
        _service = service;
        _permissions = permissions;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserDto>>> GetAll()
        => Ok(await _service.GetAllAsync());

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create([FromBody] CreateUserRequest request)
    {
        var (ok, error, data) = await _service.CreateAsync(request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Create failed."));
        return Ok(data);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<UserDto>> Update(string id, [FromBody] UpdateUserRequest request)
    {
        var (ok, error, data) = await _service.UpdateAsync(id, request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpPut("{id}/permissions")]
    public async Task<ActionResult<IReadOnlyList<string>>> UpdatePermissions(
        string id, [FromBody] UpdateSectionsRequest request)
    {
        var (ok, error, data) = await _permissions.UpdateUserPermissionsAsync(
            id, request.Sections ?? [], User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpPost("{id}/password")]
    public async Task<ActionResult<ApiMessage>> ChangePassword(string id, [FromBody] ChangePasswordRequest request)
    {
        var (ok, error) = await _service.ChangePasswordAsync(id, request.NewPassword, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Password change failed."));
        return Ok(new ApiMessage("Password updated."));
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult<ApiMessage>> Deactivate(string id)
    {
        var (ok, error) = await _service.DeactivateAsync(id, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Deactivate failed."));
        return Ok(new ApiMessage("User deactivated."));
    }
}

[ApiController]
[Route("api/permissions")]
[Authorize(Roles = AppRoles.Developer)]
public class PermissionsController : ControllerBase
{
    private readonly IPermissionService _permissions;

    public PermissionsController(IPermissionService permissions)
    {
        _permissions = permissions;
    }

    [HttpGet("catalog")]
    public ActionResult<IReadOnlyList<SectionCatalogItem>> Catalog()
        => Ok(AppSections.Catalog.Select(x => new SectionCatalogItem(x.Key, x.Label)).ToList());

    [HttpGet("roles")]
    public async Task<ActionResult<IReadOnlyList<RoleAccessDto>>> Roles()
        => Ok(await _permissions.GetRoleDefaultsAsync());

    [HttpPut("roles/{roleName}")]
    public async Task<ActionResult<RoleAccessDto>> UpdateRole(string roleName, [FromBody] UpdateSectionsRequest request)
    {
        var (ok, error, data) = await _permissions.UpdateRoleDefaultsAsync(
            roleName, request.Sections ?? [], User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
[RequireSection(AppSections.Settings)]
public class SettingsController : ControllerBase
{
    private readonly ISettingsService _service;

    public SettingsController(ISettingsService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SystemSettingDto>>> GetAll()
    {
        var settings = await _service.GetAllAsync();
        if (!User.IsInRole(AppRoles.Developer))
        {
            settings = settings
                .Where(s => !string.Equals(s.Key, SettingsService.PortalWeatherKey, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }
        return Ok(settings);
    }

    [HttpGet("department-start-limits")]
    public async Task<ActionResult<IReadOnlyList<DepartmentStartLimitDto>>> GetDepartmentStartLimits(
        [FromQuery] bool includeDeleted = false)
        => Ok(await _service.GetDepartmentStartLimitsAsync(includeDeleted));

    [HttpPut("department-start-limits/{departmentId:int}")]
    public async Task<ActionResult<DepartmentStartLimitDto>> UpdateDepartmentStartLimits(
        int departmentId,
        [FromBody] UpdateDepartmentStartLimitsRequest request)
    {
        var (ok, error, data) = await _service.UpdateDepartmentStartLimitsAsync(
            departmentId, request.MealStartLimit, request.ComfortStartLimit, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpGet("shift-department-break-limits")]
    public async Task<ActionResult<IReadOnlyList<ShiftDepartmentBreakLimitsGroupDto>>> GetShiftDepartmentBreakLimits()
        => Ok(await _service.GetShiftDepartmentBreakLimitsAsync());

    [HttpPut("shift-department-break-limits/{shiftId:int}/{departmentId:int}")]
    public async Task<ActionResult<ShiftDepartmentBreakLimitDto>> UpdateShiftDepartmentBreakLimits(
        int shiftId,
        int departmentId,
        [FromBody] UpdateShiftDepartmentBreakLimitsRequest request)
    {
        var (ok, error, data) = await _service.UpdateShiftDepartmentBreakLimitsAsync(
            shiftId,
            departmentId,
            request.MealStartLimit,
            request.ComfortStartLimit,
            request.MealLimitMinutes,
            request.ComfortLimitMinutes,
            User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpPut("{key}")]
    public async Task<ActionResult<SystemSettingDto>> Update(string key, [FromBody] UpdateSettingRequest request)
    {
        if (string.Equals(key, SettingsService.PortalWeatherKey, StringComparison.OrdinalIgnoreCase)
            && !User.IsInRole(AppRoles.Developer))
            return Forbid();

        var (ok, error, data) = await _service.UpdateAsync(key, request.Value, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
[RequireSection(AppSections.Audit)]
public class AuditController : ControllerBase
{
    private readonly AppDbContext _db;

    public AuditController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AuditLogDto>>> Get(
        [FromQuery] int take = 100,
        [FromQuery] string? entityType = null,
        [FromQuery] string? from = null,
        [FromQuery] string? to = null)
    {
        take = Math.Clamp(take, 1, 500);
        var query = _db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(a => a.EntityType == entityType);

        if (TryParseLocalDateRange(from, to, out var fromUtc, out var toUtcExclusive))
            query = query.Where(a => a.CreatedAt >= fromUtc && a.CreatedAt < toUtcExclusive);

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(take)
            .Select(a => new AuditLogDto(a.Id, a.UserId, a.Action, a.EntityType, a.EntityId, a.Details, a.CreatedAt, a.IpAddress))
            .ToListAsync();

        // Convert UTC-stored audit times to PC local for display.
        items = items
            .Select(a => a with { CreatedAt = TimeDisplay.FromStoredUtc(a.CreatedAt) })
            .ToList();

        return Ok(items);
    }

    [HttpGet("report")]
    public async Task<ActionResult<AuditReportDto>> Report(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null)
    {
        var fromDate = DateOnly.TryParse(from, out var f) ? f : DateOnly.FromDateTime(DateTime.Now);
        var toDate = DateOnly.TryParse(to, out var t) ? t : fromDate;
        if (toDate < fromDate) (fromDate, toDate) = (toDate, fromDate);

        var fromUtc = DateTime.SpecifyKind(fromDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Local).ToUniversalTime();
        var toUtcExclusive = DateTime.SpecifyKind(toDate.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Local).ToUniversalTime();

        var logs = await _db.AuditLogs.AsNoTracking()
            .Where(a => a.CreatedAt >= fromUtc && a.CreatedAt < toUtcExclusive)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        var userIds = logs
            .Select(a => a.UserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var userNames = new Dictionary<string, string>(StringComparer.Ordinal);
        if (userIds.Count > 0)
        {
            var users = await _db.Users.AsNoTracking()
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.UserName, u.FullName })
                .ToListAsync();

            foreach (var user in users)
            {
                if (string.IsNullOrWhiteSpace(user.Id))
                    continue;

                var label = !string.IsNullOrWhiteSpace(user.UserName)
                    ? user.UserName!
                    : (!string.IsNullOrWhiteSpace(user.FullName) ? user.FullName : user.Id);
                userNames[user.Id] = label;
            }
        }

        var sessionIds = logs
            .Where(a => string.Equals(a.EntityType, "BreakSession", StringComparison.OrdinalIgnoreCase)
                        && int.TryParse(a.EntityId, out _))
            .Select(a => int.Parse(a.EntityId!))
            .Distinct()
            .ToList();

        var sessions = new Dictionary<int, (string EmployeeName, DateTime OutTime, DateTime? InTime)>();
        if (sessionIds.Count > 0)
        {
            var found = await _db.BreakSessions.AsNoTracking()
                .Include(s => s.Employee)
                .Where(s => sessionIds.Contains(s.Id))
                .Select(s => new
                {
                    s.Id,
                    EmployeeName = s.Employee.FullName + " (" + s.Employee.EmployeeCode + ")",
                    s.OutTime,
                    s.InTime
                })
                .ToListAsync();

            foreach (var item in found)
            {
                sessions[item.Id] = (
                    item.EmployeeName,
                    TimeDisplay.AsLocal(item.OutTime),
                    TimeDisplay.AsLocal(item.InTime));
            }
        }

        var rows = new List<AuditReportRowDto>(logs.Count);
        foreach (var entry in logs)
        {
            string? userName = null;
            if (!string.IsNullOrWhiteSpace(entry.UserId))
                userNames.TryGetValue(entry.UserId, out userName);

            string? employeeName = null;
            DateTime? outTime = null;
            DateTime? inTime = null;
            if (string.Equals(entry.EntityType, "BreakSession", StringComparison.OrdinalIgnoreCase)
                && int.TryParse(entry.EntityId, out var sessionId)
                && sessions.TryGetValue(sessionId, out var session))
            {
                employeeName = session.EmployeeName;
                outTime = session.OutTime;
                inTime = session.InTime;
            }

            rows.Add(new AuditReportRowDto(
                entry.Id,
                entry.UserId,
                userName,
                entry.Action ?? string.Empty,
                entry.EntityType ?? string.Empty,
                entry.EntityId,
                entry.Details,
                TimeDisplay.FromStoredUtc(entry.CreatedAt),
                entry.IpAddress,
                employeeName,
                outTime,
                inTime));
        }

        var actionCounts = rows
            .GroupBy(r => r.Action, StringComparer.OrdinalIgnoreCase)
            .Select(g => new AuditActionCountDto(g.Key, g.Count()))
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Action, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var distinctUsers = rows
            .Select(r => r.UserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .Distinct(StringComparer.Ordinal)
            .Count();

        return Ok(new AuditReportDto(
            fromDate,
            toDate,
            rows.Count,
            distinctUsers,
            actionCounts.Count,
            actionCounts,
            rows));
    }

    private static bool TryParseLocalDateRange(string? from, string? to, out DateTime fromUtc, out DateTime toUtcExclusive)
    {
        fromUtc = default;
        toUtcExclusive = default;

        if (string.IsNullOrWhiteSpace(from) && string.IsNullOrWhiteSpace(to))
            return false;

        var fromDate = DateOnly.TryParse(from, out var parsedFrom)
            ? parsedFrom
            : DateOnly.FromDateTime(DateTime.Now);
        var toDate = DateOnly.TryParse(to, out var parsedTo) ? parsedTo : fromDate;
        if (toDate < fromDate) (fromDate, toDate) = (toDate, fromDate);

        fromUtc = DateTime.SpecifyKind(fromDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Local).ToUniversalTime();
        toUtcExclusive = DateTime.SpecifyKind(toDate.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Local).ToUniversalTime();
        return true;
    }
}
