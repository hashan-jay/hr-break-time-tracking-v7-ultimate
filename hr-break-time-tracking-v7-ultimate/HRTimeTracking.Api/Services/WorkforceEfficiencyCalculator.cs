using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;

namespace HRTimeTracking.Api.Services;

/// <summary>
/// Workforce efficiency from people-minutes:
///   shift people-minutes = shift minutes × people
///   efficiency = 100 − (used break people-minutes ÷ shift people-minutes × 100)
/// Shift minutes come from the shift clock range. The given break allowance is
/// 80 minutes inside every shift (720 − 80 = 640 work minutes on a 12-hour shift).
/// </summary>
public static class WorkforceEfficiencyCalculator
{
    public const int BreakAllowanceMinutes = 80;
    private static readonly HashSet<int> EmptyRoster = [];

    public sealed record EmployeeShiftRow(int EmployeeId, int? ShiftId, bool IsDeleted);

    public sealed record SessionRow(int EmployeeId, DateTime OutTime, DateTime? InTime);

    public static WorkforceEfficiencySnapshotDto Build(
        IReadOnlyList<Shift> shifts,
        IReadOnlyList<EmployeeShiftRow> employees,
        IReadOnlyList<SessionRow> sessions,
        DateOnly from,
        DateOnly today,
        DateTime now)
    {
        now = TimeDisplay.AsLocal(now);
        var allowance = BreakAllowanceMinutes;
        var localSessions = sessions
            .Select(s => s with
            {
                OutTime = TimeDisplay.AsLocal(s.OutTime),
                InTime = TimeDisplay.AsLocal(s.InTime),
            })
            .ToList();

        var rosterByShift = employees
            .Where(e => !e.IsDeleted && e.ShiftId.HasValue)
            .GroupBy(e => e.ShiftId!.Value)
            .ToDictionary(g => g.Key, g => g.Select(e => e.EmployeeId).ToHashSet());

        var shiftIdByEmployee = employees
            .Where(e => e.ShiftId.HasValue)
            .GroupBy(e => e.EmployeeId)
            .ToDictionary(g => g.Key, g => g.First().ShiftId);

        var todayShifts = new List<WorkforceShiftScoreDto>();
        foreach (var shift in shifts.OrderBy(s => s.StartTime).ThenBy(s => s.Name))
        {
            var live = ShiftWindow.ActiveAt(shift, now);
            var startDate = live?.StartDate ?? today;
            var roster = rosterByShift.GetValueOrDefault(shift.Id) ?? EmptyRoster;
            var score = ScoreShift(shift, startDate, now, allowance, roster, localSessions, shiftIdByEmployee);
            if (score is null) continue;
            if (score.EmployeeCount == 0 && !score.IsLive) continue;
            todayShifts.Add(score);
        }

        var liveShifts = todayShifts.Where(s => s.IsLive).ToList();
        var scoredToday = todayShifts.Where(s => s.EmployeeCount > 0).ToList();
        // Glance card is live shifts only. Finished and upcoming shifts stay out of this number.
        var card = liveShifts.Count > 0
            ? Combine(liveShifts, hasLiveShift: true)
            : IdleLiveCard();
        var dayTotal = Combine(scoredToday, hasLiveShift: false);
        var dayIsFinal = DayIsComplete(shifts, today, now);
        var yesterdayStart = today.AddDays(-1);
        var yesterdayScores = new List<WorkforceShiftScoreDto>();
        foreach (var shift in shifts)
        {
            var roster = rosterByShift.GetValueOrDefault(shift.Id) ?? EmptyRoster;
            var score = ScoreShift(shift, yesterdayStart, now, allowance, roster, localSessions, shiftIdByEmployee);
            if (score is not null && score.EmployeeCount > 0)
                yesterdayScores.Add(score);
        }

        var liveIds = liveShifts.Select(s => s.ShiftId).ToHashSet();
        IReadOnlyList<WorkforceShiftScoreDto> yesterdayLiveSource = liveIds.Count == 0
            ? []
            : yesterdayScores.Where(s => liveIds.Contains(s.ShiftId)).ToList();
        var yesterdayLive = Combine(yesterdayLiveSource, hasLiveShift: false);
        var change = !card.HasLiveShift || yesterdayLiveSource.Count == 0
            ? null
            : ChangePercent(card.EfficiencyPercent, yesterdayLive.EfficiencyPercent);
        var yesterdayDay = Combine(yesterdayScores, hasLiveShift: false);
        var dayChange = scoredToday.Count == 0 || yesterdayScores.Count == 0
            ? null
            : ChangePercent(dayTotal.EfficiencyPercent, yesterdayDay.EfficiencyPercent);

        var daily = new List<WorkforceDayPointDto>(30);
        var dailyPercents = new List<double>(30);
        for (var offset = 0; offset < 30; offset++)
        {
            var date = from.AddDays(offset);
            var dayScores = new List<WorkforceShiftScoreDto>();
            foreach (var shift in shifts)
            {
                var roster = rosterByShift.GetValueOrDefault(shift.Id) ?? EmptyRoster;
                var score = ScoreShift(shift, date, now, allowance, roster, localSessions, shiftIdByEmployee);
                if (score is not null && score.EmployeeCount > 0)
                    dayScores.Add(score);
            }

            var combined = Combine(dayScores, hasLiveShift: false);
            dailyPercents.Add(combined.EfficiencyPercent);
            daily.Add(new WorkforceDayPointDto(
                date,
                combined.EfficiencyPercent,
                null,
                null,
                combined.EmployeeCount,
                combined.ShiftPeopleMinutes,
                combined.UsedBreakPeopleMinutes,
                combined.BreakSharePercent,
                DayIsComplete(shifts, date, now)));
        }

        var moving = MovingAverage(dailyPercents, 7);
        var regression = FitLine(dailyPercents);
        var withAnalytics = daily
            .Select((point, index) => point with
            {
                MovingAverage7 = moving[index],
                TrendLine = regression.Line[index],
            })
            .ToList();

        return new WorkforceEfficiencySnapshotDto(
            allowance,
            card.EfficiencyPercent,
            change,
            card.Tone,
            card.Comment,
            card.HasLiveShift,
            card.HighlightedShiftId,
            card.HighlightedShiftLabel,
            todayShifts,
            withAnalytics,
            regression.Summary,
            dayTotal.EfficiencyPercent,
            dayChange,
            dayIsFinal);
    }

    public static WorkforceShiftScoreDto? ScoreShift(
        Shift shift,
        DateOnly startDate,
        DateTime now,
        int breakAllowanceMinutes,
        IReadOnlySet<int> rosterEmployeeIds,
        IReadOnlyList<SessionRow> sessions,
        IReadOnlyDictionary<int, int?> shiftIdByEmployee)
    {
        var shiftMinutes = ShiftWindow.DurationMinutes(shift);
        if (shiftMinutes <= 0) return null;

        var period = ShiftWindow.StartingOn(shift, startDate);
        var allowance = Math.Min(Math.Max(breakAllowanceMinutes, 0), shiftMinutes);
        var live = ShiftWindow.ActiveAt(shift, now);
        var isLive = live.HasValue && live.Value.Start == period.Start && live.Value.End == period.End;
        var people = new HashSet<int>(rosterEmployeeIds);
        var usedSeconds = 0;
        var reference = now < period.End ? now : period.End;

        foreach (var session in sessions)
        {
            if (shiftIdByEmployee.GetValueOrDefault(session.EmployeeId) != shift.Id)
                continue;
            if (!ShiftWindow.StartedIn(session.OutTime, period))
                continue;

            people.Add(session.EmployeeId);
            var end = session.InTime ?? reference;
            if (end > period.End) end = period.End;
            usedSeconds += TimeDisplay.ElapsedSeconds(session.OutTime, end);
        }

        if (people.Count == 0 && !shift.IsActive)
            return null;

        var employeeCount = people.Count;
        var usedMinutes = usedSeconds / 60d;
        var scored = ScoreTotals(shiftMinutes, allowance, employeeCount, usedMinutes);
        var label = ShiftService.BuildDisplayLabel(shift.Name, shift.StartTime, shift.EndTime, shift.SpansNextDay);

        return new WorkforceShiftScoreDto(
            shift.Id,
            shift.Name,
            label,
            shiftMinutes,
            scored.WorkMinutes,
            allowance,
            employeeCount,
            scored.ShiftPeopleMinutes,
            scored.UsedBreakPeopleMinutes,
            scored.BreakSharePercent,
            scored.EfficiencyPercent,
            scored.ExpectedEfficiencyPercent,
            scored.Tone,
            Comment(scored.Tone, isLive, shift.Name),
            isLive,
            period.StartDate);
    }

    public static (int WorkMinutes, double ShiftPeopleMinutes, double UsedBreakPeopleMinutes, double BreakSharePercent, double EfficiencyPercent, double ExpectedEfficiencyPercent, string Tone)
        ScoreTotals(int shiftMinutes, int allowanceMinutes, int employeeCount, double usedBreakPeopleMinutes)
    {
        var workMinutes = Math.Max(0, shiftMinutes - allowanceMinutes);
        if (employeeCount <= 0 || shiftMinutes <= 0)
        {
            return (workMinutes, 0, 0, 0, 100, ExpectedPercent(shiftMinutes, allowanceMinutes), Tones.Good);
        }

        var shiftPeopleMinutes = shiftMinutes * (double)employeeCount;
        var used = Math.Max(0, usedBreakPeopleMinutes);
        var breakShare = used / shiftPeopleMinutes * 100d;
        var efficiency = Math.Clamp(100d - breakShare, 0, 100);
        var expected = ExpectedPercent(shiftMinutes, allowanceMinutes);
        return (
            workMinutes,
            Round1(shiftPeopleMinutes),
            Round1(used),
            Round1(breakShare),
            Round1(efficiency),
            Round1(expected),
            Tone(efficiency, expected));
    }

    public static string Tone(double efficiencyPercent, double expectedPercent)
    {
        if (efficiencyPercent + 0.05 >= expectedPercent)
            return Tones.Good;
        if (efficiencyPercent >= expectedPercent - 3)
            return Tones.Watch;
        return Tones.Alert;
    }

    public static string Comment(string tone, bool isLive, string? shiftName)
    {
        var where = string.IsNullOrWhiteSpace(shiftName) ? "the workforce" : shiftName;
        var live = isLive ? " This is the shift being tracked now." : string.Empty;
        return tone switch
        {
            Tones.Watch =>
                $"Break people-minutes on {where} are a little above the {BreakAllowanceMinutes}-minute allowance. Review the floor before efficiency slips further.{live}",
            Tones.Alert =>
                $"Workforce efficiency on {where} is below the healthy range. Break time is taking more of the shift than planned.{live}",
            _ =>
                $"People are working well on {where}. Workforce efficiency is in the healthy range.{live}",
        };
    }

    private static CombinedScore IdleLiveCard()
        => new(
            100,
            Tones.Good,
            "No live shift is being tracked now. Today's all-shifts total is recorded when the last shift of the day ends.",
            false,
            null,
            "No live shift",
            0,
            0,
            0,
            0);

    private static bool DayIsComplete(IReadOnlyList<Shift> shifts, DateOnly date, DateTime now)
    {
        if (shifts.Count == 0) return true;
        foreach (var shift in shifts)
        {
            var period = ShiftWindow.StartingOn(shift, date);
            if (now < period.End)
                return false;
        }
        return true;
    }

    private static CombinedScore Combine(
        IReadOnlyList<WorkforceShiftScoreDto> scores,
        bool hasLiveShift)
    {
        var usable = scores.Where(s => s.EmployeeCount > 0 && s.ShiftPeopleMinutes > 0).ToList();
        if (usable.Count == 0)
        {
            return new CombinedScore(
                100,
                Tones.Good,
                Comment(Tones.Good, hasLiveShift, hasLiveShift ? null : "today's roster"),
                hasLiveShift,
                scores.FirstOrDefault(s => s.IsLive)?.ShiftId,
                scores.FirstOrDefault(s => s.IsLive)?.ShiftLabel,
                0,
                0,
                0,
                0);
        }

        var shiftPeople = usable.Sum(s => s.ShiftPeopleMinutes);
        var used = usable.Sum(s => s.UsedBreakPeopleMinutes);
        var employees = usable.Sum(s => s.EmployeeCount);
        var expectedPeople = usable.Sum(s => s.ShiftMinutes * (double)s.EmployeeCount - s.BreakAllowanceMinutes * (double)s.EmployeeCount);
        var efficiency = Math.Clamp((shiftPeople - used) / shiftPeople * 100d, 0, 100);
        var expected = shiftPeople <= 0 ? 100 : expectedPeople / shiftPeople * 100d;
        var tone = Tone(efficiency, expected);
        var live = usable.Where(s => s.IsLive).ToList();
        var highlight = live.Count == 1
            ? live[0]
            : live.Count > 1
                ? null
                : usable.Count == 1 ? usable[0] : null;
        var label = live.Count == 1
            ? live[0].ShiftLabel
            : live.Count > 1
                ? $"{live.Count} live shifts"
                : usable.Count == 1
                    ? usable[0].ShiftLabel
                    : "All shifts today";

        return new CombinedScore(
            Round1(efficiency),
            tone,
            Comment(tone, hasLiveShift, highlight?.ShiftName ?? (live.Count > 1 ? "the live shifts" : null)),
            hasLiveShift,
            highlight?.ShiftId,
            label,
            employees,
            Round1(shiftPeople),
            Round1(used),
            Round1(used / shiftPeople * 100d));
    }

    private static double ExpectedPercent(int shiftMinutes, int allowanceMinutes)
    {
        if (shiftMinutes <= 0) return 100;
        var allowance = Math.Min(Math.Max(allowanceMinutes, 0), shiftMinutes);
        return (shiftMinutes - allowance) * 100d / shiftMinutes;
    }

    private static double? ChangePercent(double current, double previous)
    {
        if (Math.Abs(previous) < 0.0001)
            return Math.Abs(current) < 0.0001 ? 0 : 100;
        return Math.Round((current - previous) / previous * 100, 1);
    }

    private static IReadOnlyList<double?> MovingAverage(IReadOnlyList<double> values, int window)
    {
        var result = new double?[values.Count];
        double run = 0;
        for (var i = 0; i < values.Count; i++)
        {
            run += values[i];
            if (i >= window) run -= values[i - window];
            var count = Math.Min(i + 1, window);
            result[i] = count == 0 ? null : Round1(run / count);
        }
        return result;
    }

    private static (WorkforceRegressionDto Summary, IReadOnlyList<double?> Line) FitLine(IReadOnlyList<double> values)
    {
        var n = values.Count;
        var line = new double?[n];
        if (n < 2)
        {
            return (new WorkforceRegressionDto(0, values.FirstOrDefault(), 0, values.FirstOrDefault(), "steady",
                "Not enough daily points yet to fit a trend."), line);
        }

        double sumX = 0, sumY = 0, sumXy = 0, sumXx = 0;
        for (var i = 0; i < n; i++)
        {
            sumX += i;
            sumY += values[i];
            sumXy += i * values[i];
            sumXx += i * (double)i;
        }

        var denom = n * sumXx - sumX * sumX;
        var slope = Math.Abs(denom) < 0.0001 ? 0 : (n * sumXy - sumX * sumY) / denom;
        var intercept = (sumY - slope * sumX) / n;

        double ssTot = 0, ssRes = 0;
        var mean = sumY / n;
        for (var i = 0; i < n; i++)
        {
            var fitted = intercept + slope * i;
            line[i] = Round1(Math.Clamp(fitted, 0, 100));
            ssTot += (values[i] - mean) * (values[i] - mean);
            ssRes += (values[i] - fitted) * (values[i] - fitted);
        }

        var rSquared = ssTot < 0.0001 ? 1 : Math.Clamp(1 - ssRes / ssTot, 0, 1);
        var forecast = Math.Clamp(intercept + slope * n, 0, 100);
        var trend = slope > 0.08 ? "rising" : slope < -0.08 ? "falling" : "steady";
        var insight = trend switch
        {
            "rising" =>
                $"Linear regression shows efficiency rising about {Math.Abs(slope):0.0} points per day (R² {rSquared:0.00}). Forecast for the next day is {forecast:0.0}%.",
            "falling" =>
                $"Linear regression shows efficiency easing about {Math.Abs(slope):0.0} points per day (R² {rSquared:0.00}). Forecast for the next day is {forecast:0.0}%.",
            _ =>
                $"Linear regression is steady (slope {slope:0.00} points/day, R² {rSquared:0.00}). Next-day forecast is {forecast:0.0}%.",
        };

        return (new WorkforceRegressionDto(
            Math.Round(slope, 3),
            Round1(intercept),
            Math.Round(rSquared, 3),
            Round1(forecast),
            trend,
            insight), line);
    }

    private static double Round1(double value) => Math.Round(value, 1);

    private static class Tones
    {
        public const string Good = "good";
        public const string Watch = "watch";
        public const string Alert = "alert";
    }

    private sealed record CombinedScore(
        double EfficiencyPercent,
        string Tone,
        string Comment,
        bool HasLiveShift,
        int? HighlightedShiftId,
        string? HighlightedShiftLabel,
        int EmployeeCount,
        double ShiftPeopleMinutes,
        double UsedBreakPeopleMinutes,
        double BreakSharePercent);
}
