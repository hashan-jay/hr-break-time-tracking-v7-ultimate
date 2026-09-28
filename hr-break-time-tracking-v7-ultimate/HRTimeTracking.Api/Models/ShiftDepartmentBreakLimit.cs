namespace HRTimeTracking.Api.Models;

/// <summary>
/// Break limits configured per shift and department combination.
/// </summary>
public class ShiftDepartmentBreakLimit
{
    public int Id { get; set; }

    public int ShiftId { get; set; }

    public Shift Shift { get; set; } = null!;

    public int DepartmentId { get; set; }

    public Department Department { get; set; } = null!;

    public int MealBreakStartLimit { get; set; } = BreakStatusCodes.DefaultMealStartLimit;

    public int ComfortBreakStartLimit { get; set; } = BreakStatusCodes.DefaultComfortStartLimit;

    public int MealBreakLimitMinutes { get; set; } = BreakStatusCodes.DefaultMealLimitMinutes;

    public int ComfortBreakLimitMinutes { get; set; } = BreakStatusCodes.DefaultComfortLimitMinutes;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}
