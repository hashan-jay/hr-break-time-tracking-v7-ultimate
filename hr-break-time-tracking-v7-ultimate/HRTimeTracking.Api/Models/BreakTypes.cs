namespace HRTimeTracking.Api.Models;

/// <summary>Break categories tracked separately with independent daily limits.</summary>
public static class BreakTypes
{
    public const string Comfort = "Comfort";
    public const string Meal = "Meal";

    public static readonly string[] All = [Comfort, Meal];

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && All.Any(t => t.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));

    public static string Normalize(string value)
    {
        var trimmed = value.Trim();
        if (Comfort.Equals(trimmed, StringComparison.OrdinalIgnoreCase)) return Comfort;
        if (Meal.Equals(trimmed, StringComparison.OrdinalIgnoreCase)) return Meal;
        throw new ArgumentException("Break type must be Comfort or Meal.");
    }
}
