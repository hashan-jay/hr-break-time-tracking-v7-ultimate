namespace HRTimeTracking.Api.Models;

/// <summary>
/// Whole minutes added to the displayed start of one break.
/// The BreakSession out-time and in-time rows are never updated.
/// </summary>
public class BreakSessionStartOffset
{
    public int Id { get; set; }

    public int BreakSessionId { get; set; }

    public BreakSession BreakSession { get; set; } = null!;

    /// <summary>Minutes added to the original start. Never negative.</summary>
    public int AddedMinutes { get; set; }
}
