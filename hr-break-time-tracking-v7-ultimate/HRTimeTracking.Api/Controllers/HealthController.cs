using HRTimeTracking.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromServices] AppDbContext db)
    {
        var dbOk = await db.Database.CanConnectAsync();
        if (!dbOk)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                status = "unhealthy",
                message = "Database is unavailable."
            });
        }

        return Ok(new
        {
            status = "healthy",
            application = "HR Time Tracking API"
        });
    }
}
