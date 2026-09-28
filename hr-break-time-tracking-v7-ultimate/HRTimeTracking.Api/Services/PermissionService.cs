using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IPermissionService
{
    Task<IReadOnlyList<string>> GetForUserAsync(string userId);
    Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetForUsersAsync(IEnumerable<string> userIds);
    Task<bool> HasAnyAsync(string? userId, params string[] sections);
    Task<IReadOnlyList<RoleAccessDto>> GetRoleDefaultsAsync();
    Task<(bool Ok, string? Error, RoleAccessDto? Data)> UpdateRoleDefaultsAsync(
        string roleName, IReadOnlyList<string> sections, string? actorUserId);
    Task<(bool Ok, string? Error, IReadOnlyList<string>? Data)> UpdateUserPermissionsAsync(
        string userId, IReadOnlyList<string> sections, string? actorUserId);
    Task ApplyRoleDefaultsToUserAsync(string userId, string roleName);
    Task SeedMissingAsync();
}

public class PermissionService : IPermissionService
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAuditService _audit;

    public PermissionService(AppDbContext db, UserManager<ApplicationUser> userManager, IAuditService audit)
    {
        _db = db;
        _userManager = userManager;
        _audit = audit;
    }

    public async Task<IReadOnlyList<string>> GetForUserAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return [];

        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains(AppRoles.Developer))
            return AppSections.All;

        var role = roles.FirstOrDefault() ?? AppRoles.HRAssistant;
        return await GetRoleSectionsAsync(role);
    }

    public async Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetForUsersAsync(IEnumerable<string> userIds)
    {
        var ids = userIds.Distinct(StringComparer.Ordinal).ToList();
        var result = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        if (ids.Count == 0) return result;

        var roleSections = (await GetRoleDefaultsAsync())
            .ToDictionary(r => r.Role, r => r.Sections, StringComparer.OrdinalIgnoreCase);

        var users = await _userManager.Users.Where(u => ids.Contains(u.Id)).ToListAsync();
        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            if (roles.Contains(AppRoles.Developer))
            {
                result[user.Id] = AppSections.All;
                continue;
            }

            var role = roles.FirstOrDefault() ?? AppRoles.HRAssistant;
            result[user.Id] = roleSections.TryGetValue(role, out var sections)
                ? sections
                : AppSections.DefaultsFor(role);
        }

        return result;
    }

    public async Task<bool> HasAnyAsync(string? userId, params string[] sections)
    {
        if (string.IsNullOrWhiteSpace(userId) || sections is null || sections.Length == 0)
            return false;

        var granted = await GetForUserAsync(userId);
        return sections.Any(s => granted.Contains(s, StringComparer.OrdinalIgnoreCase));
    }

    public async Task<IReadOnlyList<RoleAccessDto>> GetRoleDefaultsAsync()
    {
        var stored = await _db.RolePermissions.AsNoTracking().ToListAsync();
        var byRole = stored.GroupBy(p => p.RoleName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Select(x => x.SectionKey).ToList(), StringComparer.OrdinalIgnoreCase);

        return AppRoles.All.Select(role =>
        {
            var locked = role == AppRoles.Developer;
            var sections = locked
                ? AppSections.All
                : byRole.TryGetValue(role, out var keys)
                    ? Normalize(keys)
                    : AppSections.DefaultsFor(role);
            return new RoleAccessDto(role, AppRoles.Label(role), sections, locked);
        }).ToList();
    }

    public async Task<(bool Ok, string? Error, RoleAccessDto? Data)> UpdateRoleDefaultsAsync(
        string roleName, IReadOnlyList<string> sections, string? actorUserId)
    {
        if (!AppRoles.All.Contains(roleName))
            return (false, "Invalid role.", null);
        if (roleName == AppRoles.Developer)
            return (false, "Developer access cannot be reduced.", null);

        var cleaned = Normalize(sections);
        var existing = await _db.RolePermissions.Where(p => p.RoleName == roleName).ToListAsync();
        _db.RolePermissions.RemoveRange(existing);
        _db.RolePermissions.AddRange(cleaned.Select(key => new RolePermission
        {
            RoleName = roleName,
            SectionKey = key
        }));
        await _db.SaveChangesAsync();
        await _audit.LogAsync(actorUserId, "Update", "RolePermission", roleName,
            $"Updated default section access for {roleName}: {string.Join(", ", cleaned)}.");

        return (true, null, new RoleAccessDto(roleName, AppRoles.Label(roleName), cleaned, false));
    }

    public async Task<(bool Ok, string? Error, IReadOnlyList<string>? Data)> UpdateUserPermissionsAsync(
        string userId, IReadOnlyList<string> sections, string? actorUserId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return (false, "User not found.", null);

        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains(AppRoles.Developer))
            return (false, "Developer accounts always have full access.", null);

        var cleaned = Normalize(sections);
        var existing = await _db.UserPermissions.Where(p => p.UserId == userId).ToListAsync();
        _db.UserPermissions.RemoveRange(existing);
        _db.UserPermissions.AddRange(cleaned.Select(key => new UserPermission
        {
            UserId = userId,
            SectionKey = key
        }));
        await _db.SaveChangesAsync();
        await _audit.LogAsync(actorUserId, "Update", "UserPermission", userId,
            $"Updated section access for '{user.UserName}': {string.Join(", ", cleaned)}.");

        return (true, null, cleaned);
    }

    public async Task ApplyRoleDefaultsToUserAsync(string userId, string roleName)
    {
        var sections = roleName == AppRoles.Developer
            ? AppSections.All
            : await GetRoleSectionsAsync(roleName);

        var existing = await _db.UserPermissions.Where(p => p.UserId == userId).ToListAsync();
        _db.UserPermissions.RemoveRange(existing);
        _db.UserPermissions.AddRange(sections.Select(key => new UserPermission
        {
            UserId = userId,
            SectionKey = key
        }));
        await _db.SaveChangesAsync();
    }

    public async Task SeedMissingAsync()
    {
        foreach (var role in AppRoles.All)
        {
            if (await _db.RolePermissions.AnyAsync(p => p.RoleName == role))
                continue;

            var sections = AppSections.DefaultsFor(role)
                .Where(s => role == AppRoles.Developer || AppSections.IsGrantable(s))
                .ToList();
            _db.RolePermissions.AddRange(sections.Select(key => new RolePermission
            {
                RoleName = role,
                SectionKey = key
            }));
            await _db.SaveChangesAsync();
        }
    }

    private async Task<IReadOnlyList<string>> GetRoleSectionsAsync(string role)
    {
        if (role == AppRoles.Developer)
            return AppSections.All;

        var keys = await _db.RolePermissions.AsNoTracking()
            .Where(p => p.RoleName == role)
            .Select(p => p.SectionKey)
            .ToListAsync();

        return keys.Count > 0 ? Normalize(keys) : AppSections.DefaultsFor(role);
    }

    private static IReadOnlyList<string> Normalize(IEnumerable<string> sections)
    {
        var set = new HashSet<string>(
            sections.Where(s => !string.IsNullOrWhiteSpace(s)),
            StringComparer.OrdinalIgnoreCase);
        return AppSections.Grantable.Where(set.Contains).ToList();
    }
}
