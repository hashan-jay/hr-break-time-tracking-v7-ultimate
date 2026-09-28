using HRTimeTracking.Api.Models;

namespace HRTimeTracking.Api.Services;

/// <summary>
/// One continuous work period for a shift. Overnight shifts (20:00–08:00)
/// stay on a single window that crosses midnight.
/// </summary>
public readonly record struct ShiftPeriod(DateTime Start, DateTime End)
{
    public DateOnly StartDate => DateOnly.FromDateTime(Start);
    public bool Contains(DateTime value)
    {
        var local = TimeDisplay.AsLocal(value);
        return local >= Start && local < End;
    }
}

/// <summary>
/// Resolves the shift-wise time window used for Meal/Comfort totals and reports.
/// Employees without a shift fall back to the local calendar day.
/// </summary>
public static class ShiftWindow
{
    public static ShiftPeriod CalendarDay(DateOnly date)
    {
        var start = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        return new ShiftPeriod(start, start.AddDays(1));
    }

    public static ShiftPeriod CalendarDay(DateTime now)
        => CalendarDay(DateOnly.FromDateTime(TimeDisplay.AsLocal(now)));

    /// <summary>
    /// The shift window that is live at this instant. Returns null between shifts
    /// and when the employee has no shift, so only current-shift staff can capture breaks.
    /// </summary>
    public static ShiftPeriod? ActiveAt(Shift? shift, DateTime now)
    {
        now = TimeDisplay.AsLocal(now);
        if (shift is null)
            return null;

        var date = DateOnly.FromDateTime(now);

        if (shift.SpansNextDay)
        {
            var tonightStart = date.ToDateTime(shift.StartTime, DateTimeKind.Local);
            var tonightEnd = date.AddDays(1).ToDateTime(shift.EndTime, DateTimeKind.Local);
            if (now >= tonightStart && now < tonightEnd)
                return new ShiftPeriod(tonightStart, tonightEnd);

            var lastStart = date.AddDays(-1).ToDateTime(shift.StartTime, DateTimeKind.Local);
            var lastEnd = date.ToDateTime(shift.EndTime, DateTimeKind.Local);
            if (now >= lastStart && now < lastEnd)
                return new ShiftPeriod(lastStart, lastEnd);

            return null;
        }

        var start = date.ToDateTime(shift.StartTime, DateTimeKind.Local);
        var end = date.ToDateTime(shift.EndTime, DateTimeKind.Local);
        if (now >= start && now < end)
            return new ShiftPeriod(start, end);

        return null;
    }

    /// <summary>
    /// Next shift start after an off-shift gap (for live "reset until" labels).
    /// </summary>
    public static DateTime? NextStart(Shift? shift, DateTime now)
    {
        if (shift is null) return null;
        now = TimeDisplay.AsLocal(now);
        var date = DateOnly.FromDateTime(now);
        var todayStart = date.ToDateTime(shift.StartTime, DateTimeKind.Local);
        if (now < todayStart)
            return todayStart;
        return date.AddDays(1).ToDateTime(shift.StartTime, DateTimeKind.Local);
    }

    /// <summary>
    /// Period a stored out-time belongs to for shift-strict reports.
    /// Unassigned employees use the calendar day. Assigned employees only count
    /// out-times that fall inside a live shift window.
    /// </summary>
    public static ShiftPeriod? ReportPeriod(Shift? shift, DateTime outTime)
        => shift is null ? CalendarDay(outTime) : ActiveAt(shift, outTime);

    /// <summary>
    /// Current (or most recently started) period. Prefer <see cref="ActiveAt"/> for live totals.
    /// </summary>
    public static ShiftPeriod Resolve(Shift? shift, DateTime now)
    {
        now = TimeDisplay.AsLocal(now);
        var active = ActiveAt(shift, now);
        if (active.HasValue)
            return active.Value;

        if (shift is null)
            return CalendarDay(now);

        return shift.SpansNextDay
            ? ResolveOvernight(shift, now)
            : ResolveSameDay(shift, now);
    }

    /// <summary>
    /// Period used when recording a new out-time. Between shifts, calendar day is
    /// stored on the row but shift reports ignore those off-shift sessions.
    /// </summary>
    public static ShiftPeriod ForOutTime(Shift? shift, DateTime outTime)
        => ActiveAt(shift, outTime) ?? CalendarDay(outTime);

    public static ShiftPeriod StartingOn(Shift shift, DateOnly startDate)
    {
        var start = startDate.ToDateTime(shift.StartTime, DateTimeKind.Local);
        var end = shift.SpansNextDay
            ? startDate.AddDays(1).ToDateTime(shift.EndTime, DateTimeKind.Local)
            : startDate.ToDateTime(shift.EndTime, DateTimeKind.Local);
        return new ShiftPeriod(start, end);
    }

    /// <summary>Whole minutes from the shift clock range (overnight windows include the next day).</summary>
    public static int DurationMinutes(Shift shift)
    {
        var period = StartingOn(shift, DateOnly.FromDayNumber(0));
        var minutes = (period.End - period.Start).TotalMinutes;
        return minutes <= 0 ? 0 : (int)Math.Round(minutes);
    }

    /// <summary>
    /// When a forgotten open break must stop: the end of the shift period it
    /// was started in. Overnight windows use the next-morning end time.
    /// </summary>
    public static DateTime? AutoCloseAt(Shift? shift, DateOnly breakDate, DateTime outTime)
    {
        outTime = TimeDisplay.AsLocal(outTime);
        if (shift is not null)
        {
            var period = StartingOn(shift, breakDate);
            if (outTime < period.End)
                return period.End;

            var atOut = ActiveAt(shift, outTime);
            if (atOut.HasValue && outTime < atOut.Value.End)
                return atOut.Value.End;

            return null;
        }

        var day = CalendarDay(outTime);
        return outTime < day.End ? day.End : null;
    }

    public static bool StartedIn(DateTime outTime, ShiftPeriod period)
    {
        var local = TimeDisplay.AsLocal(outTime);
        return local >= period.Start && local < period.End;
    }

    public static bool Overlaps(ShiftPeriod period, DateOnly from, DateOnly to)
    {
        var rangeStart = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        var rangeEnd = to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        return period.Start < rangeEnd && period.End > rangeStart;
    }

    public static string FormatLabel(Shift? shift, ShiftPeriod period)
    {
        if (shift is null)
            return $"Calendar day {period.StartDate:yyyy-MM-dd}";

        return $"{ShiftService.BuildDisplayLabel(shift.Name, shift.StartTime, shift.EndTime, shift.SpansNextDay)} · {period.StartDate:yyyy-MM-dd}";
    }

    private static ShiftPeriod ResolveSameDay(Shift shift, DateTime now)
    {
        var date = DateOnly.FromDateTime(now);
        var todayStart = date.ToDateTime(shift.StartTime, DateTimeKind.Local);
        var todayEnd = date.ToDateTime(shift.EndTime, DateTimeKind.Local);

        if (now < todayStart)
        {
            var previous = date.AddDays(-1);
            return new ShiftPeriod(
                previous.ToDateTime(shift.StartTime, DateTimeKind.Local),
                previous.ToDateTime(shift.EndTime, DateTimeKind.Local));
        }

        return new ShiftPeriod(todayStart, todayEnd);
    }

    private static ShiftPeriod ResolveOvernight(Shift shift, DateTime now)
    {
        var date = DateOnly.FromDateTime(now);
        var tonightStart = date.ToDateTime(shift.StartTime, DateTimeKind.Local);
        var tonightEnd = date.AddDays(1).ToDateTime(shift.EndTime, DateTimeKind.Local);

        if (now >= tonightStart)
            return new ShiftPeriod(tonightStart, tonightEnd);

        var lastStart = date.AddDays(-1).ToDateTime(shift.StartTime, DateTimeKind.Local);
        var lastEnd = date.ToDateTime(shift.EndTime, DateTimeKind.Local);
        return new ShiftPeriod(lastStart, lastEnd);
    }
}
