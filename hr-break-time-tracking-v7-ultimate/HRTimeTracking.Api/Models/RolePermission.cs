using System.ComponentModel.DataAnnotations;

namespace HRTimeTracking.Api.Models;

public class RolePermission
{
    public int Id { get; set; }

    [MaxLength(50)]
    public string RoleName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string SectionKey { get; set; } = string.Empty;
}
