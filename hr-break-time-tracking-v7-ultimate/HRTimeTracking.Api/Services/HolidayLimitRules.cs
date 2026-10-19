namespace HRTimeTracking.Api.Services;

/// <summary>
/// Monthly holiday allowance. A holiday day is a confirmed absent shift day
/// from the existing attendance rules. The allowance itself is a developer setting.
/// </summary>
public static class HolidayLimitRules
{
    public const string SettingKey = "MonthlyHolidayDayLimit";
    public const int DefaultDays = 2;
    public const int MinDays = 0;
    public const int MaxDays = 31;

    public const string Description =
        "Developer only. Maximum confirmed holiday days allowed per employee in a calendar month. A holiday day is a confirmed absent shift day.";

    public const string RuleSummary =
        "A holiday day is a confirmed absent shift day. The employee was scheduled, the shift has reached its final hour, and no meal or comfort break was completed. Days still in progress are not counted toward the monthly limit.";

    public static bool TryParse(string? value, out int days)
    {
        if (int.TryParse(value?.Trim(), out days) && days >= MinDays && days <= MaxDays)
            return true;

        days = DefaultDays;
        return false;
    }

    public static int ParseOrDefault(string? value)
        => TryParse(value, out var days) ? days : DefaultDays;

    public static bool Exceeds(int holidayDays, int limit)
        => Math.Max(0, holidayDays) > limit;

    public static int Excess(int holidayDays, int limit)
        => Math.Max(0, Math.Max(0, holidayDays) - limit);

    /// <summary>
    /// Present days divided by decided days. Pending days stay out of the rate
    /// so an open shift does not look like absence.
    /// </summary>
    public static decimal? AttendanceRate(int presentDays, int holidayDays)
    {
        var decided = presentDays + holidayDays;
        if (decided <= 0) return null;
        return Math.Round(presentDays * 100m / decided, 1, MidpointRounding.AwayFromZero);
    }
}
