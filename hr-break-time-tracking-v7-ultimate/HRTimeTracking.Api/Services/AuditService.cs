using System.Security.Claims;
using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.Models;

namespace HRTimeTracking.Api.Services;

public interface IAuditService
{
    Task LogAsync(string? userId, string action, string entityType, string? entityId, string? details, string? ipAddress = null);
}

public class AuditService : IAuditService
{
    private readonly AppDbContext _db;

    public AuditService(AppDbContext db)
    {
        _db = db;
    }

    public async Task LogAsync(string? userId, string action, string entityType, string? entityId, string? details, string? ipAddress = null)
    {
        try
        {
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = userId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                Details = details is { Length: > 2000 } ? details[..2000] : details,
                IpAddress = ipAddress,
                CreatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }
        catch
        {
            // Never fail break capture / login because audit insert failed.
        }
    }
}

public static class ClaimsPrincipalExtensions
{
    public static string? GetUserId(this ClaimsPrincipal user)
        => user.FindFirstValue(ClaimTypes.NameIdentifier);

    public static bool CanDeactivateEmployees(this ClaimsPrincipal user)
        => AppRoles.CanDeactivateEmployees(user);

    public static bool CanPurgeEmployees(this ClaimsPrincipal user)
        => AppRoles.CanPurgeEmployees(user);
}
