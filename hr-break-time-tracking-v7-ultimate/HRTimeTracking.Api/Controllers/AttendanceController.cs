using HRTimeTracking.Api.Authorization;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HRTimeTracking.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AttendanceController : ControllerBase
{
    private readonly IAttendanceService _attendance;
    private readonly IAttendanceAnalyticsService _analytics;

    public AttendanceController(IAttendanceService attendance, IAttendanceAnalyticsService analytics)
    {
        _attendance = attendance;
        _analytics = analytics;
    }

    [HttpGet("shifts")]
    [RequireSection(AppSections.Attendance)]
    public async Task<ActionResult<IReadOnlyList<ShiftDto>>> Shifts()
        => Ok(await _attendance.GetShiftsAsync());

    [HttpGet]
    [RequireSection(AppSections.Attendance)]
    public async Task<ActionResult<AttendanceRosterDto>> Roster(
        [FromQuery] string? date = null,
        [FromQuery] int? shiftId = null)
    {
        var day = DateOnly.TryParse(date, out var parsed)
            ? parsed
            : TimeDisplay.TodayLocal();

        var result = await _attendance.GetRosterAsync(day, shiftId is > 0 ? shiftId : null);
        if (!result.Ok || result.Data is null)
            return NotFound(new ApiMessage(result.Error ?? "Attendance is unavailable."));

        return Ok(result.Data);
    }

    [HttpGet("analytics")]
    [RequireSection(AppSections.Attendance)]
    public async Task<ActionResult<AttendanceAnalyticsDto>> Analytics(
        [FromQuery] int? year = null,
        [FromQuery] int? month = null,
        [FromQuery] int? shiftId = null,
        [FromQuery] int? departmentId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _analytics.GetAsync(
            year,
            month,
            shiftId is > 0 ? shiftId : null,
            departmentId is > 0 ? departmentId : null,
            cancellationToken);

        if (!result.Ok || result.Data is null)
        {
            var message = result.Error ?? "Attendance analytics are unavailable.";
            if (message.Contains("valid month", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new ApiMessage(message));
            return NotFound(new ApiMessage(message));
        }

        return Ok(result.Data);
    }
}
