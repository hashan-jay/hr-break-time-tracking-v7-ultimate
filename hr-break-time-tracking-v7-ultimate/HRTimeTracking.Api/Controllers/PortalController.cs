using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HRTimeTracking.Api.Controllers;

/// <summary>
/// Public employee self-service portal (no login required).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class PortalController : ControllerBase
{
    private readonly IBreakTrackingService _breaks;
    private readonly IShiftService _shifts;
    private readonly IEmployeePasscodeService _passcodes;

    public PortalController(IBreakTrackingService breaks, IShiftService shifts, IEmployeePasscodeService passcodes)
    {
        _breaks = breaks;
        _shifts = shifts;
        _passcodes = passcodes;
    }

    [HttpGet("live")]
    public async Task<ActionResult<LiveBoardDto>> Live(
        [FromQuery] string? search = null,
        [FromQuery] int? shiftId = null,
        [FromQuery] int? shiftId2 = null)
        => Ok(await _breaks.GetLiveBoardAsync(search, departmentId: null, shiftId, shiftId2));

    /// <summary>Active shifts for the public portal filter dropdown (read-only).</summary>
    [HttpGet("shifts")]
    public async Task<ActionResult<IReadOnlyList<ShiftDto>>> Shifts()
        => Ok(await _shifts.GetAllAsync(includeInactive: false));

    /// <summary>
    /// Single-employee snapshot for the portal popup. Reads the same Employee,
    /// Shift, Department, and BreakSession rows as the live board.
    /// </summary>
    [HttpGet("employee/{employeeId:int}")]
    public async Task<ActionResult<EmployeeBreakStatusDto>> Employee(int employeeId)
    {
        var status = await _breaks.GetEmployeeStatusAsync(employeeId);
        return status is null ? NotFound(new ApiMessage("Employee not found.")) : Ok(status);
    }

    [HttpGet("passcode-status/{employeeId:int}")]
    public async Task<ActionResult<PasscodeApiResult>> PasscodeStatus(int employeeId)
    {
        var result = await _passcodes.GetStatusAsync(employeeId);
        if (result.ErrorCode == "NOT_FOUND") return NotFound(result);
        return Ok(result);
    }

    [HttpPost("passcode")]
    public async Task<ActionResult<PasscodeApiResult>> SetPasscode([FromBody] SetEmployeePasscodeRequest request)
    {
        var result = await _passcodes.SetAsync(request);
        if (!result.Ok && result.ErrorCode != "ALREADY_SET") return BadRequest(result);
        return Ok(result);
    }

    [HttpPost("toggle")]
    public async Task<ActionResult<EmployeeBreakStatusDto>> Toggle([FromBody] ToggleBreakRequest request)
    {
        var verify = await _passcodes.VerifyAsync(request.EmployeeId, request.Passcode);
        if (!verify.Ok) return BadRequest(verify);

        var (ok, error, data) = await _breaks.ToggleAsync(request.EmployeeId, request.BreakType, userId: null);
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Toggle failed."));
        return Ok(data);
    }
}
