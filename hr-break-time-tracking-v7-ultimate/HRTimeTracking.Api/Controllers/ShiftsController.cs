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
public class ShiftsController : ControllerBase
{
    private readonly IShiftService _service;
    private readonly IPermissionService _permissions;

    public ShiftsController(IShiftService service, IPermissionService permissions)
    {
        _service = service;
        _permissions = permissions;
    }

    [HttpGet]
    [RequireSection(AppSections.Shifts, AppSections.Tracking, AppSections.Employees, AppSections.Reports)]
    public async Task<ActionResult<IReadOnlyList<ShiftDto>>> GetAll([FromQuery] bool includeInactive = false)
    {
        if (includeInactive && !await _permissions.HasAnyAsync(User.GetUserId(), AppSections.Shifts))
            includeInactive = false;
        return Ok(await _service.GetAllAsync(includeInactive));
    }

    [HttpGet("{id:int}")]
    [RequireSection(AppSections.Shifts, AppSections.Tracking, AppSections.Employees, AppSections.Reports)]
    public async Task<ActionResult<ShiftDto>> GetById(int id)
    {
        var item = await _service.GetByIdAsync(id);
        return item is null ? NotFound(new ApiMessage("Shift not found.")) : Ok(item);
    }

    [HttpPost]
    [RequireSection(AppSections.Shifts)]
    public async Task<ActionResult<ShiftDto>> Create([FromBody] CreateShiftRequest request)
    {
        var (ok, error, data) = await _service.CreateAsync(request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Create failed."));
        return CreatedAtAction(nameof(GetById), new { id = data.Id }, data);
    }

    [HttpPut("{id:int}")]
    [RequireSection(AppSections.Shifts)]
    public async Task<ActionResult<ShiftDto>> Update(int id, [FromBody] UpdateShiftRequest request)
    {
        var (ok, error, data) = await _service.UpdateAsync(id, request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpPost("{id:int}/deactivate")]
    [RequireSection(AppSections.Shifts)]
    public async Task<ActionResult> Deactivate(int id)
    {
        var (ok, error) = await _service.DeactivateAsync(id, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Deactivate failed."));
        return Ok(new ApiMessage("Shift deactivated."));
    }
}
