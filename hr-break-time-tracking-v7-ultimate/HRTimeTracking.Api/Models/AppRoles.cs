namespace HRTimeTracking.Api.Models;

public static class AppRoles
{
    public const string Developer = "Developer";
    public const string SystemAdministration = "SystemAdministration";
    public const string HRManager = "HRManager";
    public const string HRAssistant = "HRAssistant";

    public static readonly string[] All =
    [
        Developer,
        SystemAdministration,
        HRManager,
        HRAssistant
    ];

    public static string Label(string role) => role switch
    {
        Developer => "Developer",
        SystemAdministration => "System Administration",
        HRManager => "HR Manager",
        HRAssistant => "HR Assistant",
        _ => role
    };

    public static bool CanDeactivateEmployees(System.Security.Claims.ClaimsPrincipal? user) =>
        user is not null &&
        (user.IsInRole(Developer) || user.IsInRole(HRManager) || user.IsInRole(SystemAdministration));

    public static bool CanPurgeEmployees(System.Security.Claims.ClaimsPrincipal? user) =>
        user is not null && user.IsInRole(Developer);
}
