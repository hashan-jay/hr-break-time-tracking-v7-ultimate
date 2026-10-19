using HRTimeTracking.Api.Services;
using Xunit;

namespace HRTimeTracking.Tests;

public class BreakStartOffsetAllocatorTests
{
    [Fact]
    public void PutsTheWholeReductionOnOneRowWhenThatRowCanHoldIt()
    {
        var slots = new List<BreakStartOffsetSlot>
        {
            Slot(1, capacity: 1, employee: true),
            Slot(2, capacity: 10, employee: true),
        };

        BreakStartOffsetAllocator.MatchTarget(slots, 10, new Random(1));

        Assert.Equal(0, slots[0].AddedMinutes);
        Assert.Equal(10, slots[1].AddedMinutes);
        Assert.Equal(0, slots[1].RemainingCapacityMinutes);
    }

    [Fact]
    public void UsesOnlyEmployeeStartedRowsWhenTheyCanAbsorbTheReduction()
    {
        for (var seed = 0; seed < 40; seed++)
        {
            var slots = new List<BreakStartOffsetSlot>
            {
                Slot(1, capacity: 20, employee: false),
                Slot(2, capacity: 20, employee: true),
            };

            BreakStartOffsetAllocator.MatchTarget(slots, 10, new Random(seed));

            Assert.Equal(0, slots[0].AddedMinutes);
            Assert.Equal(10, slots[1].AddedMinutes);
        }
    }

    [Fact]
    public void SpreadsMinutesWhenNoSingleRowCanHoldTheReduction()
    {
        var slots = new List<BreakStartOffsetSlot>
        {
            Slot(1, capacity: 3, employee: true),
            Slot(2, capacity: 4, employee: true),
        };

        BreakStartOffsetAllocator.MatchTarget(slots, 6, new Random(3));

        Assert.Equal(6, slots.Sum(slot => slot.AddedMinutes));
        Assert.True(slots[0].AddedMinutes <= 3);
        Assert.True(slots[1].AddedMinutes <= 4);
    }

    [Fact]
    public void GivesMinutesBackByMovingTheStartForwardLess()
    {
        var slots = new List<BreakStartOffsetSlot>
        {
            Slot(1, capacity: 0, added: 10, employee: true),
            Slot(2, capacity: 5, employee: true),
        };

        BreakStartOffsetAllocator.MatchTarget(slots, 4, new Random(2));

        Assert.Equal(4, slots.Sum(slot => slot.AddedMinutes));
        Assert.Equal(4, slots[0].AddedMinutes);
        Assert.Equal(0, slots[1].AddedMinutes);
    }

    [Fact]
    public void LeavesAnExistingMatchUntouched()
    {
        var slots = new List<BreakStartOffsetSlot>
        {
            Slot(1, capacity: 9, added: 1, employee: true),
            Slot(2, capacity: 10, employee: true),
        };

        BreakStartOffsetAllocator.MatchTarget(slots, 1, new Random(9));

        Assert.Equal(1, slots[0].AddedMinutes);
        Assert.Equal(0, slots[1].AddedMinutes);
    }

    [Fact]
    public void NeverAddsMoreMinutesThanTheRowsCanHold()
    {
        var slots = new List<BreakStartOffsetSlot>
        {
            Slot(1, capacity: 1, employee: true),
            Slot(2, capacity: 0, employee: true),
        };

        BreakStartOffsetAllocator.MatchTarget(slots, 10, new Random(4));

        Assert.Equal(1, slots.Sum(slot => slot.AddedMinutes));
    }

    private static BreakStartOffsetSlot Slot(int id, int capacity, bool employee, int added = 0)
        => new()
        {
            SessionId = id,
            EmployeeStarted = employee,
            RemainingCapacityMinutes = capacity,
            AddedMinutes = added,
        };
}
