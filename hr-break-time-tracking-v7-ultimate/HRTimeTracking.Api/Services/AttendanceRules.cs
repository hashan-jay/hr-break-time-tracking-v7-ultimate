using HRTimeTracking.Api.Models;

namespace HRTimeTracking.Api.Services;

/// <summary>
/// Attendance is derived from completed meal or comfort breaks.
/// Absent names stay hidden until one hour before the shift period ends.
/// </summary>
public static class AttendanceRules
{
    public static readonly TimeSpan AbsentLead = TimeSpan.FromHours(1);

    public readonly record struct BreakMark(string BreakType, DateTime OutTime, DateTime? InTime);

    /// <summary>
    /// Present when a meal or comfort break both started inside the shift window and has an end time.
    /// An open break is not present yet.
    /// </summary>
    public static bool IsPresent(IEnumerable<BreakMark> sessions, ShiftPeriod period)
    {
        foreach (var session in sessions)
        {
            if (session.InTime is null)
                continue;
            if (!BreakTypes.IsValid(session.BreakType))
                continue;
            if (!ShiftWindow.StartedIn(session.OutTime, period))
                continue;
            if (TimeDisplay.AsLocal(session.InTime.Value) < TimeDisplay.AsLocal(session.OutTime))
                continue;
            return true;
        }

        return false;
    }

    /// <summary>
    /// Absent is visible only in the last hour of the shift, and after the shift has ended.
    /// Before the shift starts (including a future date) it stays hidden.
    /// </summary>
    public static bool ShowAbsent(ShiftPeriod period, DateTime now)
    {
        now = TimeDisplay.AsLocal(now);
        if (now < period.Start)
            return false;
        if (now >= period.End)
            return true;
        return now >= period.End - AbsentLead;
    }

    public static string Summarize(IEnumerable<BreakMark> sessions, ShiftPeriod period)
    {
        var meal = false;
        var comfort = false;
        foreach (var session in sessions)
        {
            if (session.InTime is null || !ShiftWindow.StartedIn(session.OutTime, period))
                continue;
            if (BreakTypes.Meal.Equals(session.BreakType, StringComparison.OrdinalIgnoreCase))
                meal = true;
            else if (BreakTypes.Comfort.Equals(session.BreakType, StringComparison.OrdinalIgnoreCase))
                comfort = true;
        }

        if (meal && comfort) return "Meal, Comfort";
        if (meal) return "Meal";
        if (comfort) return "Comfort";
        return "";
    }

    public static DateTime? LastEndedAt(IEnumerable<BreakMark> sessions, ShiftPeriod period)
    {
        DateTime? last = null;
        foreach (var session in sessions)
        {
            if (session.InTime is not DateTime ended || !ShiftWindow.StartedIn(session.OutTime, period))
                continue;
            if (!BreakTypes.IsValid(session.BreakType))
                continue;
            var local = TimeDisplay.AsLocal(ended);
            if (last is null || local > last)
                last = local;
        }

        return last;
    }
}
