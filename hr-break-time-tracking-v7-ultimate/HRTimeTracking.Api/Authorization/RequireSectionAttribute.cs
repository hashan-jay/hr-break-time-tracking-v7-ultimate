using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace HRTimeTracking.Api.Authorization;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireSectionAttribute : Attribute, IAsyncAuthorizationFilter
{
    public RequireSectionAttribute(params string[] sections)
    {
        Sections = sections ?? [];
    }

    public string[] Sections { get; }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        if (context.HttpContext.User?.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var permissions = context.HttpContext.RequestServices.GetRequiredService<IPermissionService>();
        var userId = context.HttpContext.User.GetUserId();
        if (!await permissions.HasAnyAsync(userId, Sections))
            context.Result = new ForbidResult();
    }
}
