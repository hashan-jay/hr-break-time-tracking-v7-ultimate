using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HRTimeTracking.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        var (ok, error, response) = await _authService.LoginAsync(request.UserName, request.Password);
        if (!ok || response is null) return Unauthorized(new ApiMessage(error ?? "Login failed."));
        return Ok(response);
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        var user = await _authService.GetCurrentUserAsync(userId);
        if (user is null || !user.IsActive) return Unauthorized(new ApiMessage("User is inactive or not found."));
        return Ok(user);
    }
}
