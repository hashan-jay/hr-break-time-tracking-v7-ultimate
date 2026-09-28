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
public class EmployeesController : ControllerBase
{
    private readonly IEmployeeService _service;
    private readonly IEmployeePasscodeService _passcodes;
    private readonly IAuthService _auth;

    public EmployeesController(IEmployeeService service, IEmployeePasscodeService passcodes, IAuthService auth)
    {
        _service = service;
        _passcodes = passcodes;
        _auth = auth;
    }

    [HttpGet]
    [RequireSection(AppSections.Employees, AppSections.Tracking, AppSections.Reports)]
    public async Task<ActionResult<IReadOnlyList<EmployeeDto>>> GetAll(
        [FromQuery] string? search = null,
        [FromQuery] int? departmentId = null,
        [FromQuery] bool includeDeactivated = false)
    {
        return Ok(await _service.GetAllAsync(search, departmentId, includeDeactivated));
    }

    [HttpGet("deactivated")]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<IReadOnlyList<EmployeeDto>>> GetDeactivated(
        [FromQuery] string? search = null,
        [FromQuery] int? departmentId = null)
    {
        if (!User.CanDeactivateEmployees())
            return StatusCode(StatusCodes.Status403Forbidden,
                new ApiMessage("Only HR Manager, System Administration, and Developer can view deactivated employees."));

        return Ok(await _service.GetAllAsync(search, departmentId, deactivatedOnly: true));
    }

    [HttpGet("passcode-directory")]
    [RequireSection(AppSections.UserPasscodes)]
    public async Task<ActionResult<IReadOnlyList<EmployeeDto>>> PasscodeDirectory(
        [FromQuery] string? search = null)
    {
        return Ok(await _service.GetAllAsync(search, departmentId: null, includeDeactivated: false));
    }

    [HttpGet("code-status")]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<EmployeeCodeStatusDto>> CodeStatus(
        [FromQuery] string? code = null,
        [FromQuery] int? excludeId = null)
    {
        return Ok(await _service.CheckCodeAsync(code, excludeId));
    }

    [HttpGet("{id:int}")]
    [RequireSection(AppSections.Employees, AppSections.Tracking, AppSections.Reports)]
    public async Task<ActionResult<EmployeeDto>> GetById(int id)
    {
        var item = await _service.GetByIdAsync(id);
        if (item is null) return NotFound(new ApiMessage("Employee not found."));
        return Ok(item);
    }

    [HttpPost]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<EmployeeDto>> Create([FromBody] CreateEmployeeRequest request)
    {
        var (ok, error, data) = await _service.CreateAsync(request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Create failed."));
        return CreatedAtAction(nameof(GetById), new { id = data.Id }, data);
    }

    [HttpPut("{id:int}")]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<EmployeeDto>> Update(int id, [FromBody] UpdateEmployeeRequest request)
    {
        var (ok, error, data) = await _service.UpdateAsync(id, request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpPost("{id:int}/deactivate")]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<EmployeeDto>> Deactivate(int id)
    {
        if (!User.CanDeactivateEmployees())
            return StatusCode(StatusCodes.Status403Forbidden,
                new ApiMessage("Only HR Manager, System Administration, and Developer can deactivate employees."));

        var (ok, error, data) = await _service.DeactivateAsync(id, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Deactivate failed."));
        return Ok(data);
    }

    [HttpPost("{id:int}/activate")]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<EmployeeDto>> Activate(int id)
    {
        if (!User.CanDeactivateEmployees())
            return StatusCode(StatusCodes.Status403Forbidden,
                new ApiMessage("Only HR Manager, System Administration, and Developer can activate employees."));

        var (ok, error, data) = await _service.ActivateAsync(id, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Activate failed."));
        return Ok(data);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = AppRoles.Developer)]
    [RequireSection(AppSections.Employees)]
    public async Task<ActionResult<ApiMessage>> Delete(int id)
    {
        var (ok, error) = await _service.DeleteAsync(id, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Delete failed."));
        return Ok(new ApiMessage("Employee and related break records permanently deleted."));
    }

    [HttpPost("{id:int}/passcode/reset")]
    [RequireSection(AppSections.UserPasscodes)]
    public async Task<ActionResult<ApiMessage>> ResetPasscode(int id, [FromBody] ConfirmStaffCredentialsRequest request)
    {
        var (confirmed, confirmError) = await _auth.ConfirmCurrentPasswordAsync(
            User.GetUserId() ?? string.Empty, request.UserName, request.Password);
        if (!confirmed)
            return BadRequest(new ApiMessage(confirmError ?? "Could not confirm your credentials."));

        var (ok, error) = await _passcodes.ResetAsync(id, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Reset failed."));
        return Ok(new ApiMessage("Passcode reset. The employee must create a new passcode on the next break."));
    }
}
