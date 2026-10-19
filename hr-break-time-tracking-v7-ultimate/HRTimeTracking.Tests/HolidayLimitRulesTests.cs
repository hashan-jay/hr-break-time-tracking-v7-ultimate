using HRTimeTracking.Api.Services;
using Xunit;

namespace HRTimeTracking.Tests;

public class HolidayLimitRulesTests
{
    [Theory]
    [InlineData("0", 0)]
    [InlineData("2", 2)]
    [InlineData("31", 31)]
    [InlineData(" 4 ", 4)]
    public void Parse_AcceptsWholeDaysInsideTheRange(string raw, int expected)
    {
        Assert.True(HolidayLimitRules.TryParse(raw, out var days));
        Assert.Equal(expected, days);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("two")]
    [InlineData("-1")]
    [InlineData("32")]
    [InlineData("1.5")]
    public void Parse_RejectsValuesOutsideTheDeveloperRange(string? raw)
    {
        Assert.False(HolidayLimitRules.TryParse(raw, out var days));
        Assert.Equal(HolidayLimitRules.DefaultDays, days);
        Assert.Equal(HolidayLimitRules.DefaultDays, HolidayLimitRules.ParseOrDefault(raw));
    }

    [Theory]
    [InlineData(0, 2, false, 0)]
    [InlineData(2, 2, false, 0)]
    [InlineData(3, 2, true, 1)]
    [InlineData(1, 0, true, 1)]
    public void Exceeds_CountsOnlyDaysOverTheMonthlyLimit(int holidayDays, int limit, bool exceeds, int excess)
    {
        Assert.Equal(exceeds, HolidayLimitRules.Exceeds(holidayDays, limit));
        Assert.Equal(excess, HolidayLimitRules.Excess(holidayDays, limit));
    }

    [Fact]
    public void AttendanceRate_IgnoresDaysStillInProgress()
    {
        Assert.Null(HolidayLimitRules.AttendanceRate(0, 0));
        Assert.Equal(75.0m, HolidayLimitRules.AttendanceRate(3, 1));
        Assert.Equal(0m, HolidayLimitRules.AttendanceRate(0, 2));
        Assert.Equal(100m, HolidayLimitRules.AttendanceRate(4, 0));
    }
}
