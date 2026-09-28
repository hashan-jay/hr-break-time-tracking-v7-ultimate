using System.ComponentModel.DataAnnotations;

namespace HRTimeTracking.Api.Models;

public class Employee
{
    public int Id { get; set; }

    [MaxLength(50)]
    public string EmployeeCode { get; set; } = string.Empty;

    [MaxLength(150)]
    public string FullName { get; set; } = string.Empty;

    public int DepartmentId { get; set; }

    public Department Department { get; set; } = null!;

    /// <summary>Optional shift assignment. Null preserves existing employees without a shift.</summary>
    public int? ShiftId { get; set; }

    public Shift? Shift { get; set; }

    /// <summary>
    /// Deactivated employees stay in the database with their break history.
    /// True means deactivated, not permanently removed.
    /// </summary>
    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public DateTime HireDate { get; set; } = DateTime.UtcNow;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// One-way hash of the employee's 3-character break passcode.
    /// Null until the employee creates a passcode on the portal. Never expose this value.
    /// </summary>
    [MaxLength(500)]
    public string? PasscodeHash { get; set; }

    public DateTime? PasscodeSetAt { get; set; }

    public int PasscodeFailedCount { get; set; }

    public DateTime? PasscodeLockoutUntil { get; set; }

    public ICollection<BreakSession> BreakSessions { get; set; } = new List<BreakSession>();
}
