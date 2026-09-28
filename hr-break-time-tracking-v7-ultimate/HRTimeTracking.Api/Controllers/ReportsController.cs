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
public class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    [HttpGet("dashboard")]
    [RequireSection(AppSections.Dashboard)]
    public async Task<ActionResult<DashboardDto>> Dashboard()
    {
        return Ok(await _reportService.GetDashboardAsync());
    }

    [HttpGet("breaks")]
    [RequireSection(AppSections.Reports)]
    public async Task<ActionResult<ReportSummaryDto>> Breaks(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        [FromQuery] string? fromDate = null,
        [FromQuery] string? toDate = null,
        [FromQuery] string? departmentId = null,
        [FromQuery] string? employeeId = null,
        [FromQuery] string? shiftId = null)
    {
        var start = ParseDate(fromDate) ?? ParseDate(from) ?? DateOnly.FromDateTime(DateTime.Now);
        var end = ParseDate(toDate) ?? ParseDate(to) ?? start;
        var report = await _reportService.GetReportAsync(
            start, end, ParseId(departmentId), ParseId(employeeId), ParseId(shiftId));
        return Ok(report);
    }

    /// <summary>HR Assistant can view/search break data (read-only reports for viewing).</summary>
    [HttpGet("breaks/view")]
    [RequireSection(AppSections.Reports)]
    public async Task<ActionResult<ReportSummaryDto>> BreaksView(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        [FromQuery] string? fromDate = null,
        [FromQuery] string? toDate = null,
        [FromQuery] string? departmentId = null,
        [FromQuery] string? employeeId = null,
        [FromQuery] string? shiftId = null)
    {
        var start = ParseDate(fromDate) ?? ParseDate(from) ?? DateOnly.FromDateTime(DateTime.Now);
        var end = ParseDate(toDate) ?? ParseDate(to) ?? start;
        var report = await _reportService.GetReportAsync(
            start, end, ParseId(departmentId), ParseId(employeeId), ParseId(shiftId));
        return Ok(report);
    }

    private static DateOnly? ParseDate(string? value)
        => DateOnly.TryParse(value, out var date) ? date : null;

    private static int? ParseId(string? value)
        => int.TryParse(value, out var id) && id > 0 ? id : null;
}
