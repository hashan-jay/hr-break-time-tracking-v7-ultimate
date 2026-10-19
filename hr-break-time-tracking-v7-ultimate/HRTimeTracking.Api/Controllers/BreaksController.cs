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
public class BreaksController : ControllerBase
{
    private readonly IBreakTrackingService _service;
    private readonly IReportService _reports;

    public BreaksController(IBreakTrackingService service, IReportService reports)
    {
        _service = service;
        _reports = reports;
    }

    [HttpGet("live")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<LiveBoardDto>> Live(
        [FromQuery] string? search = null,
        [FromQuery] int? departmentId = null,
        [FromQuery] int? shiftId = null,
        [FromQuery] int? shiftId2 = null)
        => Ok(await _service.GetLiveBoardAsync(search, departmentId, shiftId, shiftId2));

    [HttpGet("employee/{employeeId:int}/status")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<EmployeeBreakStatusDto>> Status(int employeeId)
    {
        var status = await _service.GetEmployeeStatusAsync(employeeId);
        return status is null ? NotFound(new ApiMessage("Employee not found.")) : Ok(status);
    }

    [HttpGet("employee/{employeeId:int}/taken")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<IReadOnlyList<BreakSessionDto>>> Taken(int employeeId)
    {
        var rows = await _service.GetEmployeeTakenBreaksAsync(employeeId);
        return rows is null ? NotFound(new ApiMessage("Employee not found.")) : Ok(rows);
    }

    [HttpGet("exceeded")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<ExceededDayDto>> Exceeded(
        [FromQuery] string? date = null,
        [FromQuery] string? search = null,
        [FromQuery] int? departmentId = null,
        [FromQuery] int? shiftId = null,
        [FromQuery] int? shiftId2 = null)
    {
        var day = DateOnly.TryParse(date, out var parsed) ? parsed : TimeDisplay.TodayLocal();
        if (day > TimeDisplay.TodayLocal())
            return BadRequest(new ApiMessage("Choose today or an earlier date."));
        return Ok(await _reports.GetExceededDayAsync(day, search, departmentId, shiftId, shiftId2));
    }

    [HttpGet("sessions")]
    [RequireSection(AppSections.Tracking, AppSections.Reports)]
    public async Task<ActionResult<IReadOnlyList<BreakSessionDto>>> Sessions(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        [FromQuery] int? employeeId = null,
        [FromQuery] int? departmentId = null,
        [FromQuery] string? breakType = null)
    {
        DateOnly? fromDate = DateOnly.TryParse(from, out var f) ? f : null;
        DateOnly? toDate = DateOnly.TryParse(to, out var t) ? t : null;
        return Ok(await _service.GetSessionsAsync(fromDate, toDate, employeeId, departmentId, breakType));
    }

    [HttpPost("toggle")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<EmployeeBreakStatusDto>> Toggle([FromBody] ToggleBreakRequest request)
    {
        var (ok, error, data) = await _service.ToggleAsync(request.EmployeeId, request.BreakType, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Toggle failed."));
        return Ok(data);
    }

    [HttpPost("out")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<EmployeeBreakStatusDto>> Out([FromBody] ToggleBreakRequest request)
    {
        var (ok, error, data) = await _service.RecordOutAsync(request.EmployeeId, request.BreakType, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Out-time failed."));
        return Ok(data);
    }

    [HttpPost("in")]
    [RequireSection(AppSections.Tracking)]
    public async Task<ActionResult<EmployeeBreakStatusDto>> In([FromBody] ToggleBreakRequest request)
    {
        var (ok, error, data) = await _service.RecordInAsync(request.EmployeeId, request.BreakType, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "In-time failed."));
        return Ok(data);
    }
}
