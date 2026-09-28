namespace HRTimeTracking.Api.Models;

public static class AppSections
{
    public const string Dashboard = "dashboard";
    public const string Tracking = "tracking";
    public const string Employees = "employees";
    public const string Departments = "departments";
    public const string Shifts = "shifts";
    public const string Reports = "reports";
    public const string Users = "users";
    public const string Settings = "settings";
    public const string Audit = "audit";
    public const string UserPasscodes = "user-passcodes";

    public static readonly (string Key, string Label)[] Catalog =
    [
        (Dashboard, "Dashboard"),
        (Tracking, "Live Tracking"),
        (Employees, "Employees"),
        (Departments, "Departments"),
        (Shifts, "Shifts"),
        (Reports, "Reports"),
        (Settings, "Settings"),
        (Audit, "Audit Log"),
        (UserPasscodes, "User Passcodes")
    ];

    /// <summary>Sections a Developer may grant to configurable RBAC categories.</summary>
    public static readonly string[] Grantable = Catalog.Select(x => x.Key).ToArray();

    public static readonly string[] All = [..Grantable, Users];

    public static bool IsGrantable(string key)
        => Grantable.Contains(key, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<string> DefaultsFor(string role)
        => role switch
        {
            AppRoles.Developer => All,
            AppRoles.SystemAdministration => [Dashboard, Employees, Settings, Audit],
            AppRoles.HRManager => [Dashboard, Tracking, Employees, Departments, Shifts, Reports, UserPasscodes],
            AppRoles.HRAssistant => [Dashboard, Tracking, Employees, Reports],
            _ => [Dashboard]
        };
}
