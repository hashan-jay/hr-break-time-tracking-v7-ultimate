using System.ComponentModel.DataAnnotations;

namespace HRTimeTracking.Api.Models;

/// <summary>
/// Work shift defined by the Developer (military times, 30-minute steps).
/// May span midnight (e.g. 19:30 → 07:30 next day).
/// </summary>
public class Shift
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Local military start time (HH:mm), half-hour increments.</summary>
    public TimeOnly StartTime { get; set; }

    /// <summary>Local military end time (HH:mm), half-hour increments.</summary>
    public TimeOnly EndTime { get; set; }

    /// <summary>True when end is on/after midnight relative to start (overnight shift).</summary>
    public bool SpansNextDay { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public ICollection<Employee> Employees { get; set; } = new List<Employee>();
}
