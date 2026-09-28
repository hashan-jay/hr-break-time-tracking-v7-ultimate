using System.ComponentModel.DataAnnotations;

namespace HRTimeTracking.Api.Models;

public class Department
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(250)]
    public string? Description { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>Meal break starts allowed per employee per shift for this department.</summary>
    public int MealBreakStartLimit { get; set; } = BreakStatusCodes.DefaultMealStartLimit;

    /// <summary>Comfort break starts allowed per employee per shift for this department.</summary>
    public int ComfortBreakStartLimit { get; set; } = BreakStatusCodes.DefaultComfortStartLimit;

    public ICollection<Employee> Employees { get; set; } = new List<Employee>();
}
