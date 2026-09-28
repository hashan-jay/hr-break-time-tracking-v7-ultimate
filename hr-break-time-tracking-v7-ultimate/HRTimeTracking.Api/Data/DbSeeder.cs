using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.Models;
using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<AppDbContext>();
        var userManager = sp.GetRequiredService<UserManager<ApplicationUser>>();
        var roleManager = sp.GetRequiredService<RoleManager<IdentityRole>>();
        var config = sp.GetRequiredService<IConfiguration>();

        try
        {
            await db.Database.MigrateAsync();
        }
        catch (Exception)
        {
            // Existing databases may predate EF history. Additive schema below still applies.
        }

        await SchemaEnsure.ApplyAsync(db);

        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }

        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.DailyLimitKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.DailyLimitKey,
                Value = BreakStatusCodes.DefaultComfortLimitMinutes.ToString(),
                Description = "Legacy alias of Comfort break daily limit (minutes). Kept in sync with ComfortBreakLimitMinutes."
            });
            await db.SaveChangesAsync();
        }

        // Additive: Meal + Comfort limits. Never overwrite existing values.
        var legacyDaily = await db.SystemSettings.AsNoTracking()
            .Where(s => s.Key == Services.SettingsService.DailyLimitKey)
            .Select(s => s.Value)
            .FirstOrDefaultAsync();
        var comfortSeed = int.TryParse(legacyDaily, out var legacyMinutes)
            ? legacyMinutes.ToString()
            : BreakStatusCodes.DefaultComfortLimitMinutes.ToString();

        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.ComfortLimitKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.ComfortLimitKey,
                Value = comfortSeed,
                Description = "Maximum allowed daily Comfort break time in minutes (Developer adjustable)."
            });
            await db.SaveChangesAsync();
        }

        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.MealLimitKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.MealLimitKey,
                Value = BreakStatusCodes.DefaultMealLimitMinutes.ToString(),
                Description = "Maximum allowed daily Meal break time in minutes (Developer adjustable)."
            });
            await db.SaveChangesAsync();
        }

        // Additive: legacy meal alias. Copy current Meal value; never overwrite existing rows.
        var mealCanonical = await db.SystemSettings.AsNoTracking()
            .Where(s => s.Key == Services.SettingsService.MealLimitKey)
            .Select(s => s.Value)
            .FirstOrDefaultAsync();
        var mealAliasSeed = int.TryParse(mealCanonical, out var mealMinutes)
            ? mealMinutes.ToString()
            : BreakStatusCodes.DefaultMealLimitMinutes.ToString();

        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.DailyMealLimitKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.DailyMealLimitKey,
                Value = mealAliasSeed,
                Description = "Legacy alias of Meal break daily limit (minutes). Kept in sync with MealBreakLimitMinutes."
            });
            await db.SaveChangesAsync();
        }

        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.PortalWeatherKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.PortalWeatherKey,
                Value = Services.SettingsService.PortalWeatherRain,
                Description = "Developer only. Employee details effect: none, rain, snow, ducks, birds, watermelon, orange, clowns, bananas, stars, weed paper, or joker."
            });
            await db.SaveChangesAsync();
        }

        // Additive: start-count defaults for new departments. Insert only; never overwrite existing values.
        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.MealStartLimitKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.MealStartLimitKey,
                Value = BreakStatusCodes.DefaultMealStartLimit.ToString(),
                Description = "Default Meal break starts for new departments (Developer adjustable)."
            });
            await db.SaveChangesAsync();
        }

        if (!await db.SystemSettings.AnyAsync(s => s.Key == Services.SettingsService.ComfortStartLimitKey))
        {
            db.SystemSettings.Add(new SystemSetting
            {
                Key = Services.SettingsService.ComfortStartLimitKey,
                Value = BreakStatusCodes.DefaultComfortStartLimit.ToString(),
                Description = "Default Comfort break starts for new departments (Developer adjustable)."
            });
            await db.SaveChangesAsync();
        }

        // Soft-update start-limit descriptions only (values untouched).
        var mealStartSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == Services.SettingsService.MealStartLimitKey);
        if (mealStartSetting is not null &&
            (mealStartSetting.Description is null || mealStartSetting.Description.Contains("per employee per shift", StringComparison.OrdinalIgnoreCase)))
        {
            mealStartSetting.Description = "Default Meal break starts for new departments (Developer adjustable).";
            await db.SaveChangesAsync();
        }

        var comfortStartSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == Services.SettingsService.ComfortStartLimitKey);
        if (comfortStartSetting is not null &&
            (comfortStartSetting.Description is null || comfortStartSetting.Description.Contains("per employee per shift", StringComparison.OrdinalIgnoreCase)))
        {
            comfortStartSetting.Description = "Default Comfort break starts for new departments (Developer adjustable).";
            await db.SaveChangesAsync();
        }

        // Soft-update legacy description only (value untouched).
        var legacySetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == Services.SettingsService.DailyLimitKey);
        if (legacySetting is not null &&
            (legacySetting.Description is null || !legacySetting.Description.Contains("Comfort", StringComparison.OrdinalIgnoreCase)))
        {
            legacySetting.Description = "Legacy alias of Comfort break daily limit (minutes). Kept in sync with ComfortBreakLimitMinutes.";
            await db.SaveChangesAsync();
        }

        var legacyMealSetting = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == Services.SettingsService.DailyMealLimitKey);
        if (legacyMealSetting is not null &&
            (legacyMealSetting.Description is null || !legacyMealSetting.Description.Contains("Meal", StringComparison.OrdinalIgnoreCase)))
        {
            legacyMealSetting.Description = "Legacy alias of Meal break daily limit (minutes). Kept in sync with MealBreakLimitMinutes.";
            await db.SaveChangesAsync();
        }

        await EnsureUserAsync(userManager, config, "SeedUsers:Developer", AppRoles.Developer,
            "developer", "System Developer", "Developer@123");
        await EnsureUserAsync(userManager, config, "SeedUsers:HRManager", AppRoles.HRManager,
            "hrmanager", "HR Manager", "HrManager@123");
        await EnsureUserAsync(userManager, config, "SeedUsers:HRAssistant", AppRoles.HRAssistant,
            "hrassistant", "HR Assistant", "HrAssistant@123");

        if (!await db.Shifts.AnyAsync())
        {
            db.Shifts.AddRange(
                new Shift
                {
                    Name = "Day",
                    StartTime = new TimeOnly(8, 0),
                    EndTime = new TimeOnly(17, 0),
                    SpansNextDay = false,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                },
                new Shift
                {
                    Name = "Night",
                    StartTime = new TimeOnly(20, 0),
                    EndTime = new TimeOnly(8, 0),
                    SpansNextDay = true,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
            await db.SaveChangesAsync();
        }

        if (!await db.Departments.AnyAsync())
        {
            var departments = new[]
            {
                new Department { Name = "Human Resources", Description = "HR and people operations", CreatedAt = DateTime.UtcNow },
                new Department { Name = "Finance", Description = "Accounts and finance", CreatedAt = DateTime.UtcNow },
                new Department { Name = "Operations", Description = "Day-to-day operations", CreatedAt = DateTime.UtcNow },
                new Department { Name = "IT", Description = "Information technology", CreatedAt = DateTime.UtcNow }
            };
            db.Departments.AddRange(departments);
            await db.SaveChangesAsync();

            db.Employees.AddRange(
                new Employee { EmployeeCode = "EMP001", FullName = "Aisha Fernando", DepartmentId = departments[0].Id, HireDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow },
                new Employee { EmployeeCode = "EMP002", FullName = "Nuwan Perera", DepartmentId = departments[1].Id, HireDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow },
                new Employee { EmployeeCode = "EMP003", FullName = "Sajith Silva", DepartmentId = departments[2].Id, HireDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow },
                new Employee { EmployeeCode = "EMP004", FullName = "Dilani Jayasuriya", DepartmentId = departments[3].Id, HireDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow },
                new Employee { EmployeeCode = "EMP005", FullName = "Kasun Bandara", DepartmentId = departments[2].Id, HireDate = DateTime.UtcNow, CreatedAt = DateTime.UtcNow }
            );
            await db.SaveChangesAsync();
        }

        var permissions = sp.GetRequiredService<IPermissionService>();
        await permissions.SeedMissingAsync();
    }

    private static async Task EnsureUserAsync(
        UserManager<ApplicationUser> userManager,
        IConfiguration config,
        string configSection,
        string role,
        string defaultUserName,
        string defaultFullName,
        string defaultPassword)
    {
        var section = config.GetSection(configSection);
        var userName = section["UserName"] ?? defaultUserName;
        var fullName = section["FullName"] ?? defaultFullName;
        var password = section["Password"] ?? defaultPassword;

        var existing = await userManager.FindByNameAsync(userName);
        if (existing is not null) return;

        var user = new ApplicationUser
        {
            UserName = userName,
            FullName = fullName,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
            throw new InvalidOperationException($"Failed to seed user '{userName}': {string.Join(", ", result.Errors.Select(e => e.Description))}");

        await userManager.AddToRoleAsync(user, role);
    }
}
