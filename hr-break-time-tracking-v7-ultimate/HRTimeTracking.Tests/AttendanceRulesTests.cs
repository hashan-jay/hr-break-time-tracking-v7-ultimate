using HRTimeTracking.Api.Models;
using HRTimeTracking.Api.Services;
using Xunit;

namespace HRTimeTracking.Tests;

public class AttendanceRulesTests
{
    [Fact]
    public void DayShift_HidesAbsentUntilOneHourBeforeEnd()
    {
        var period = Day(new DateTime(2026, 10, 7, 7, 0, 0), new DateTime(2026, 10, 7, 19, 0, 0));

        Assert.False(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 7, 6, 59, 0, DateTimeKind.Local)));
        Assert.False(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 7, 17, 59, 0, DateTimeKind.Local)));
        Assert.True(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 7, 18, 0, 0, DateTimeKind.Local)));
        Assert.True(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 7, 19, 0, 0, DateTimeKind.Local)));
    }

    [Fact]
    public void OvernightShift_UsesOneHourBeforeItsOwnEnd()
    {
        var period = Day(new DateTime(2026, 10, 7, 19, 0, 0), new DateTime(2026, 10, 8, 7, 0, 0));

        Assert.False(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 8, 5, 59, 0, DateTimeKind.Local)));
        Assert.True(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 8, 6, 0, 0, DateTimeKind.Local)));
    }

    [Fact]
    public void FutureShift_DoesNotShowAbsent()
    {
        var period = Day(new DateTime(2026, 10, 8, 7, 0, 0), new DateTime(2026, 10, 8, 19, 0, 0));
        Assert.False(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 7, 18, 30, 0, DateTimeKind.Local)));
    }

    [Fact]
    public void EndedShift_ShowsAbsent()
    {
        var period = Day(new DateTime(2026, 10, 6, 7, 0, 0), new DateTime(2026, 10, 6, 19, 0, 0));
        Assert.True(AttendanceRules.ShowAbsent(period, new DateTime(2026, 10, 7, 9, 0, 0, DateTimeKind.Local)));
    }

    [Fact]
    public void NamedEmployee_KeepsUndecidedDayInTheRange()
    {
        Assert.Equal("PRESENT", AttendanceRules.ReportStatus(true, false, true));
        Assert.Equal("ABSENT", AttendanceRules.ReportStatus(false, true, true));
        Assert.Equal("NOT YET", AttendanceRules.ReportStatus(false, false, true));
        Assert.Null(AttendanceRules.ReportStatus(false, false, false));
    }

    [Fact]
    public void Present_RequiresStartedAndEndedMealOrComfortBreak()
    {
        var period = Day(new DateTime(2026, 10, 7, 7, 0, 0), new DateTime(2026, 10, 7, 19, 0, 0));
        var openMeal = new AttendanceRules.BreakMark(
            BreakTypes.Meal,
            new DateTime(2026, 10, 7, 12, 0, 0, DateTimeKind.Local),
            null);
        var closedComfort = new AttendanceRules.BreakMark(
            BreakTypes.Comfort,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Local),
            new DateTime(2026, 10, 7, 10, 15, 0, DateTimeKind.Local));
        var outside = new AttendanceRules.BreakMark(
            BreakTypes.Meal,
            new DateTime(2026, 10, 7, 20, 0, 0, DateTimeKind.Local),
            new DateTime(2026, 10, 7, 20, 20, 0, DateTimeKind.Local));

        Assert.False(AttendanceRules.IsPresent([openMeal], period));
        Assert.True(AttendanceRules.IsPresent([closedComfort], period));
        Assert.False(AttendanceRules.IsPresent([outside], period));
        Assert.Equal("Comfort", AttendanceRules.Summarize([closedComfort, openMeal], period));
    }

    private static ShiftPeriod Day(DateTime start, DateTime end)
        => new(
            DateTime.SpecifyKind(start, DateTimeKind.Local),
            DateTime.SpecifyKind(end, DateTimeKind.Local));
}
