using System.ComponentModel.DataAnnotations;

namespace HRTimeTracking.Api.Models;

public class UserPermission
{
    public int Id { get; set; }

    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    [MaxLength(50)]
    public string SectionKey { get; set; } = string.Empty;

    public ApplicationUser? User { get; set; }
}
