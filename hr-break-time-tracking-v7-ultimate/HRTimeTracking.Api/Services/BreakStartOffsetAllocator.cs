namespace HRTimeTracking.Api.Services;

/// <summary>
/// One break that can absorb a minute adjustment by moving its displayed start later.
/// </summary>
public sealed class BreakStartOffsetSlot
{
    public int SessionId { get; init; }

    public bool EmployeeStarted { get; init; }

    public int RemainingCapacityMinutes { get; set; }

    public int AddedMinutes { get; set; }
}

/// <summary>
/// Spreads a minute reduction across break rows by adding those minutes to start times.
/// A row is never asked to give more minutes than it has, and minutes already applied stay put
/// until the saved adjustment itself changes.
/// </summary>
public static class BreakStartOffsetAllocator
{
    public static void MatchTarget(IList<BreakStartOffsetSlot> slots, int targetAddedMinutes, Random random)
    {
        ArgumentNullException.ThrowIfNull(slots);
        ArgumentNullException.ThrowIfNull(random);
        if (targetAddedMinutes < 0)
            targetAddedMinutes = 0;

        var current = slots.Sum(slot => Math.Max(0, slot.AddedMinutes));
        if (current == targetAddedMinutes)
            return;

        if (current < targetAddedMinutes)
            Increase(slots, targetAddedMinutes - current, random);
        else
            Decrease(slots, current - targetAddedMinutes, random);
    }

    private static void Increase(IList<BreakStartOffsetSlot> slots, int minutes, Random random)
    {
        var guard = 0;
        while (minutes > 0 && guard++ < 10000)
        {
            var pool = Pool(slots, slot => slot.RemainingCapacityMinutes > 0);
            if (pool.Count == 0)
                return;

            var full = pool.Where(slot => slot.RemainingCapacityMinutes >= minutes).ToList();
            var pick = full.Count > 0
                ? full[random.Next(full.Count)]
                : pool[random.Next(pool.Count)];
            var give = Math.Min(pick.RemainingCapacityMinutes, minutes);
            pick.AddedMinutes += give;
            pick.RemainingCapacityMinutes -= give;
            minutes -= give;
        }
    }

    private static void Decrease(IList<BreakStartOffsetSlot> slots, int minutes, Random random)
    {
        var guard = 0;
        while (minutes > 0 && guard++ < 10000)
        {
            var pool = Pool(slots, slot => slot.AddedMinutes > 0);
            if (pool.Count == 0)
                return;

            var full = pool.Where(slot => slot.AddedMinutes >= minutes).ToList();
            var pick = full.Count > 0
                ? full[random.Next(full.Count)]
                : pool[random.Next(pool.Count)];
            var take = Math.Min(pick.AddedMinutes, minutes);
            pick.AddedMinutes -= take;
            pick.RemainingCapacityMinutes += take;
            minutes -= take;
        }
    }

    /// <summary>
    /// Employee-started rows are adjusted first so the Live Tracking table can show the new total.
    /// </summary>
    private static List<BreakStartOffsetSlot> Pool(
        IList<BreakStartOffsetSlot> slots,
        Func<BreakStartOffsetSlot, bool> ready)
    {
        var eligible = slots.Where(ready).ToList();
        var preferred = eligible.Where(slot => slot.EmployeeStarted).ToList();
        return preferred.Count > 0 ? preferred : eligible;
    }
}
