using System.ComponentModel.DataAnnotations;

namespace HRTimeTracking.Api.Models;

public class SystemSetting
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Value { get; set; } = string.Empty;

    [MaxLength(250)]
    public string? Description { get; set; }
}
