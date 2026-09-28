using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HRTimeTracking.Api.Controllers;

[ApiController]
[Route("api/break-time-adjustments")]
[Authorize(Roles = AppRoles.Developer)]
public class BreakTimeAdjustmentsController : ControllerBase
{
    private readonly IBreakTimeAdjustmentService _service;

    public BreakTimeAdjustmentsController(IBreakTimeAdjustmentService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<BreakTimeAdjustmentListDto>> List([FromQuery] string? date = null)
    {
        var day = DateOnly.TryParse(date, out var parsed)
            ? parsed
            : TimeDisplay.TodayLocal();
        var (ok, error, data) = await _service.ListExceededAsync(day);
        if (!ok) return BadRequest(new ApiMessage(error ?? "Could not load break times."));
        return Ok(data);
    }

    [HttpPost]
    public async Task<ActionResult<BreakTimeAdjustmentRowDto>> Save([FromBody] SaveBreakTimeAdjustmentRequest request)
    {
        var (ok, error, data) = await _service.SaveAsync(request, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Could not save the adjustment."));
        return Ok(data);
    }
}
