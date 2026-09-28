using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using HRTimeTracking.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace HRTimeTracking.Api.Services;

public interface IJwtTokenService
{
    (string Token, DateTime ExpiresAt) CreateToken(ApplicationUser user, IList<string> roles);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public (string Token, DateTime ExpiresAt) CreateToken(ApplicationUser user, IList<string> roles)
    {
        var jwt = _configuration.GetSection("Jwt");
        var key = jwt["Key"] ?? throw new InvalidOperationException("Jwt:Key is missing.");
        var issuer = jwt["Issuer"] ?? "HRTimeTracking";
        var audience = jwt["Audience"] ?? "HRTimeTracking";
        var expiresMinutes = int.TryParse(jwt["ExpiresMinutes"], out var m) ? m : 480;

        var expiresAt = DateTime.UtcNow.AddMinutes(expiresMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.UniqueName, user.UserName ?? string.Empty),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Name, user.UserName ?? string.Empty),
            new("fullName", user.FullName)
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}

public interface IAuthService
{
    Task<(bool Ok, string? Error, DTOs.LoginResponse? Response)> LoginAsync(string userName, string password);
    Task<DTOs.UserDto?> GetCurrentUserAsync(string userId);
    Task<(bool Ok, string? Error)> ConfirmCurrentPasswordAsync(string userId, string userName, string password);
}

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IAuditService _auditService;
    private readonly IPermissionService _permissions;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IJwtTokenService jwtTokenService,
        IAuditService auditService,
        IPermissionService permissions)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _jwtTokenService = jwtTokenService;
        _auditService = auditService;
        _permissions = permissions;
    }

    public async Task<(bool Ok, string? Error, DTOs.LoginResponse? Response)> LoginAsync(string userName, string password)
    {
        var user = await _userManager.FindByNameAsync(userName);
        if (user is null || !user.IsActive)
            return (false, "Invalid username or password.", null);

        var result = await _signInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        if (!result.Succeeded)
            return (false, "Invalid username or password.", null);

        var roles = await _userManager.GetRolesAsync(user);
        var permissions = await _permissions.GetForUserAsync(user.Id);
        var (token, expiresAt) = _jwtTokenService.CreateToken(user, roles);

        user.LastLoginAt = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);
        await _auditService.LogAsync(user.Id, "Login", "User", user.Id, $"User '{user.UserName}' logged in.");

        var dto = new DTOs.UserDto(
            user.Id,
            user.UserName ?? string.Empty,
            user.FullName,
            roles.ToList(),
            user.IsActive,
            user.CreatedAt,
            user.LastLoginAt,
            permissions);

        return (true, null, new DTOs.LoginResponse(token, expiresAt, dto));
    }

    public async Task<DTOs.UserDto?> GetCurrentUserAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null) return null;
        var roles = await _userManager.GetRolesAsync(user);
        var permissions = await _permissions.GetForUserAsync(user.Id);
        return new DTOs.UserDto(
            user.Id,
            user.UserName ?? string.Empty,
            user.FullName,
            roles.ToList(),
            user.IsActive,
            user.CreatedAt,
            user.LastLoginAt,
            permissions);
    }

    public async Task<(bool Ok, string? Error)> ConfirmCurrentPasswordAsync(string userId, string userName, string password)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !user.IsActive)
            return (false, "Your session is no longer valid. Sign in again.");

        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(password))
            return (false, "Enter your staff username and password to confirm.");

        if (!string.Equals(user.UserName, userName.Trim(), StringComparison.OrdinalIgnoreCase))
            return (false, "Enter your own staff username and password to confirm this reset.");

        var valid = await _userManager.CheckPasswordAsync(user, password);
        if (!valid)
            return (false, "Invalid username or password.");

        return (true, null);
    }
}
