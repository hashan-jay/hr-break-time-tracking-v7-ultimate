namespace HRTimeTracking.Api.Models;

public static class BreakStatusCodes
{
    public const int DefaultComfortLimitMinutes = 20;
    public const int DefaultMealLimitMinutes = 60;
    public const int DefaultMealStartLimit = 1;
    public const int DefaultComfortStartLimit = 2;
    public const int MinStartLimit = 1;
    public const int MaxStartLimit = 20;

    /// <summary>Legacy alias kept for older references; equals Comfort default.</summary>
    public const int DefaultDailyLimitMinutes = DefaultComfortLimitMinutes;

    public const string WellSatisfied = "WELL SATISFIED";
    public const string Exceeded = "EXCEEDED BREAK TIME LIMIT";

    public const string ColorGreen = "green";
    public const string ColorRed = "red";

    /// <summary>
    /// Limit X minutes is treated as X:00. Green if tracked time is &lt;= X:00,
    /// red if tracked time is greater than X:00.
    /// </summary>
    public static (string Status, string Color) FromTotalSeconds(int totalSeconds, int dailyLimitMinutes = DefaultComfortLimitMinutes)
    {
        var limitSeconds = Math.Max(0, dailyLimitMinutes) * 60;

        if (totalSeconds <= limitSeconds)
            return (WellSatisfied, ColorGreen);

        return (Exceeded, ColorRed);
    }
}
