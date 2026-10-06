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

    public AttendanceController(IAttendanceService attendance)
    {
        _attendance = attendance;
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
}
