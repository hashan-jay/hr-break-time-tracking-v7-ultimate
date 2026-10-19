using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

/// <summary>
/// Keeps displayed break starts in step with a saved minute adjustment.
/// Original BreakSession out-times and in-times are never written.
/// </summary>
public static class BreakStartOffsetSync
{
    public static async Task<bool> SyncAsync(
        AppDbContext db,
        int employeeId,
        DateOnly breakDate,
        string breakType,
        int targetMinutes,
        Random? random = null)
    {
        var employee = await db.Employees.AsNoTracking()
            .Include(e => e.Shift)
            .FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null)
            return false;

        var normalized = BreakTypes.Normalize(breakType);
        var period = employee.Shift is null
            ? ShiftWindow.CalendarDay(breakDate)
            : ShiftWindow.StartingOn(employee.Shift, breakDate);
        var now = TimeDisplay.NowLocal();
        var lookback = period.Start.AddHours(-2);

        var sessions = await db.BreakSessions.AsNoTracking()
            .Where(b => b.EmployeeId == employeeId && (b.InTime == null || b.OutTime >= lookback))
            .ToListAsync();

        var matched = sessions
            .Select(session => (Session: session, Start: TimeDisplay.AsLocal(session.OutTime)))
            .Where(item => ShiftWindow.StartedIn(item.Start, period) && SameType(item.Session, normalized))
            .Select(item => item.Session)
            .ToList();

        var sessionIds = matched.Select(session => session.Id).ToList();
        var offsets = sessionIds.Count == 0
            ? new List<BreakSessionStartOffset>()
            : await db.BreakSessionStartOffsets
                .Where(offset => sessionIds.Contains(offset.BreakSessionId))
                .ToListAsync();
        var offsetBySession = offsets.ToDictionary(offset => offset.BreakSessionId);

        var before = offsetBySession.ToDictionary(
            pair => pair.Key,
            pair => Math.Max(0, pair.Value.AddedMinutes));
        var slots = matched.Select(session =>
        {
            var stored = before.GetValueOrDefault(session.Id);
            var wholeMinutes = WholeMinutes(session, period, now);
            var added = Math.Min(stored, wholeMinutes);
            return new BreakStartOffsetSlot
            {
                SessionId = session.Id,
                EmployeeStarted = string.IsNullOrEmpty(session.RecordedByUserId),
                AddedMinutes = added,
                RemainingCapacityMinutes = wholeMinutes - added,
            };
        }).ToList();

        BreakStartOffsetAllocator.MatchTarget(slots, Math.Max(0, targetMinutes), random ?? Random.Shared);

        var changed = false;
        foreach (var slot in slots)
        {
            var previous = before.GetValueOrDefault(slot.SessionId);
            if (previous == slot.AddedMinutes)
                continue;

            changed = true;
            if (!offsetBySession.TryGetValue(slot.SessionId, out var row))
            {
                if (slot.AddedMinutes <= 0)
                    continue;
                db.BreakSessionStartOffsets.Add(new BreakSessionStartOffset
                {
                    BreakSessionId = slot.SessionId,
                    AddedMinutes = slot.AddedMinutes,
                });
                continue;
            }

            if (slot.AddedMinutes <= 0)
                db.BreakSessionStartOffsets.Remove(row);
            else
                row.AddedMinutes = slot.AddedMinutes;
        }

        return changed;
    }

    private static bool SameType(BreakSession session, string breakType)
    {
        var type = string.IsNullOrWhiteSpace(session.BreakType) ? BreakTypes.Comfort : BreakTypes.Normalize(session.BreakType);
        return breakType.Equals(type, StringComparison.OrdinalIgnoreCase);
    }

    private static int WholeMinutes(BreakSession session, ShiftPeriod period, DateTime now)
    {
        var start = TimeDisplay.AsLocal(session.OutTime);
        var end = session.InTime.HasValue
            ? TimeDisplay.AsLocal(session.InTime.Value)
            : (now < period.End ? now : period.End);
        return Math.Max(0, TimeDisplay.ElapsedSeconds(start, end) / 60);
    }
}
