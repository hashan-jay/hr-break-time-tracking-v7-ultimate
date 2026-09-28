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
public class DepartmentsController : ControllerBase
{
    private readonly IDepartmentService _service;
    private readonly IPermissionService _permissions;

    public DepartmentsController(IDepartmentService service, IPermissionService permissions)
    {
        _service = service;
        _permissions = permissions;
    }

    [HttpGet]
    [RequireSection(AppSections.Departments, AppSections.Tracking, AppSections.Employees, AppSections.Reports, AppSections.Shifts)]
    public async Task<ActionResult<IReadOnlyList<DepartmentDto>>> GetAll(
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? search = null)
    {
        var canSeeDeleted = await _permissions.HasAnyAsync(User.GetUserId(), AppSections.Departments);
        return Ok(await _service.GetAllAsync(canSeeDeleted && includeDeleted, search));
    }

    [HttpGet("{id:int}")]
    [RequireSection(AppSections.Departments, AppSections.Tracking, AppSections.Employees, AppSections.Reports, AppSections.Shifts)]
    public async Task<ActionResult<DepartmentDto>> GetById(int id)
    {
        var item = await _service.GetByIdAsync(id);
        if (item is null) return NotFound(new ApiMessage("Department not found."));
        var canSeeDeleted = await _permissions.HasAnyAsync(User.GetUserId(), AppSections.Departments);
        if (item.IsDeleted && !canSeeDeleted)
            return NotFound(new ApiMessage("Department not found."));
        return Ok(item);
    }

    [HttpPost]
    [RequireSection(AppSections.Departments)]
    public async Task<ActionResult<DepartmentDto>> Create([FromBody] CreateDepartmentRequest request)
    {
        var (ok, error, data) = await _service.CreateAsync(request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Create failed."));
        return CreatedAtAction(nameof(GetById), new { id = data.Id }, data);
    }

    [HttpPut("{id:int}")]
    [RequireSection(AppSections.Departments)]
    public async Task<ActionResult<DepartmentDto>> Update(int id, [FromBody] UpdateDepartmentRequest request)
    {
        var (ok, error, data) = await _service.UpdateAsync(id, request, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Update failed."));
        return Ok(data);
    }

    [HttpDelete("{id:int}")]
    [RequireSection(AppSections.Departments)]
    public async Task<ActionResult<ApiMessage>> Delete(int id)
    {
        var (ok, error) = await _service.DeleteAsync(id, User.GetUserId());
        if (!ok) return BadRequest(new ApiMessage(error ?? "Delete failed."));
        return Ok(new ApiMessage("Department deleted."));
    }

    [HttpPost("{id:int}/recover")]
    [RequireSection(AppSections.Departments)]
    public async Task<ActionResult<DepartmentDto>> Recover(int id)
    {
        var (ok, error, data) = await _service.RecoverAsync(id, User.GetUserId());
        if (!ok || data is null) return BadRequest(new ApiMessage(error ?? "Recover failed."));
        return Ok(data);
    }
}
