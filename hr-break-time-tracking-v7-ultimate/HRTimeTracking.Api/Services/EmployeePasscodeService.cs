using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.DTOs;
using HRTimeTracking.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IEmployeePasscodeService
{
    Task<PasscodeApiResult> GetStatusAsync(int employeeId);
    Task<PasscodeApiResult> SetAsync(SetEmployeePasscodeRequest request);
    Task<PasscodeApiResult> VerifyAsync(int employeeId, string? passcode);
    Task<(bool Ok, string? Error)> ResetAsync(int employeeId, string? userId);
}

public class EmployeePasscodeService : IEmployeePasscodeService
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly PasswordHasher<object> _hasher = new();
    private readonly ILiveUpdateNotifier _liveUpdates;

    public EmployeePasscodeService(AppDbContext db, IAuditService audit, ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _audit = audit;
        _liveUpdates = liveUpdates;
    }

    public async Task<PasscodeApiResult> GetStatusAsync(int employeeId)
    {
        var employee = await _db.Employees.AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null || employee.IsDeleted)
            return Fail("Employee not found.", "NOT_FOUND");

        return Status(employee, "OK");
    }

    public async Task<PasscodeApiResult> SetAsync(SetEmployeePasscodeRequest request)
    {
        var passcodeError = EmployeePasscodeRules.Validate(request.Passcode);
        if (passcodeError is not null)
            return Fail(passcodeError, "PASSCODE_INVALID_CHARS");

        if (!string.Equals(request.Passcode, request.ConfirmPasscode, StringComparison.Ordinal))
            return Fail("Passcode and confirm passcode do not match.", "PASSCODE_MISMATCH");

        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.Id == request.EmployeeId);
        if (employee is null || employee.IsDeleted)
            return Fail("Employee not found.", "NOT_FOUND");

        if (!string.IsNullOrEmpty(employee.PasscodeHash))
            return Status(employee, "A passcode is already set for this employee. Enter it to start or end the break.", "ALREADY_SET");

        employee.PasscodeHash = _hasher.HashPassword(null!, request.Passcode);
        employee.PasscodeSetAt = DateTime.UtcNow;
        employee.PasscodeFailedCount = 0;
        employee.PasscodeLockoutUntil = null;
        employee.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(null, "PasscodeSet", "Employee", employee.Id.ToString(),
            $"Break passcode created for '{employee.FullName}' ({employee.EmployeeCode}).");
        await _liveUpdates.NotifyAsync("employees");

        return new PasscodeApiResult(true, "Passcode saved. Enter it to continue.", null, true, EmployeePasscodeRules.MaxAttempts);
    }

    public async Task<PasscodeApiResult> VerifyAsync(int employeeId, string? passcode)
    {
        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null || employee.IsDeleted)
            return Fail("Employee not found.", "NOT_FOUND");

        if (string.IsNullOrEmpty(employee.PasscodeHash))
            return new PasscodeApiResult(false, "Create your 3-character passcode first.", "PASSCODE_REQUIRED", false);

        if (employee.PasscodeLockoutUntil.HasValue && employee.PasscodeLockoutUntil.Value <= DateTime.UtcNow)
        {
            employee.PasscodeFailedCount = 0;
            employee.PasscodeLockoutUntil = null;
        }

        if (IsLocked(employee))
            return Locked(employee);

        if (string.IsNullOrEmpty(passcode))
            return FailResult(employee, "Enter your 3-character passcode.", "PASSCODE_INVALID");

        var passcodeError = EmployeePasscodeRules.Validate(passcode);
        if (passcodeError is not null)
        {
            await RegisterFailureAsync(employee);
            return FailResult(employee, passcodeError, "PASSCODE_INVALID_CHARS");
        }

        var verify = _hasher.VerifyHashedPassword(null!, employee.PasscodeHash, passcode!);
        if (verify == PasswordVerificationResult.Failed)
        {
            await RegisterFailureAsync(employee);
            if (IsLocked(employee))
                return Locked(employee);

            var left = Math.Max(0, EmployeePasscodeRules.MaxAttempts - employee.PasscodeFailedCount);
            return new PasscodeApiResult(
                false,
                "Incorrect passcode.",
                "PASSCODE_INVALID",
                true,
                left,
                false,
                employee.PasscodeLockoutUntil);
        }

        if (verify == PasswordVerificationResult.SuccessRehashNeeded)
            employee.PasscodeHash = _hasher.HashPassword(null!, passcode!);

        employee.PasscodeFailedCount = 0;
        employee.PasscodeLockoutUntil = null;
        employee.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return new PasscodeApiResult(true, "Passcode confirmed.", null, true, EmployeePasscodeRules.MaxAttempts);
    }

    public async Task<(bool Ok, string? Error)> ResetAsync(int employeeId, string? userId)
    {
        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.Id == employeeId);
        if (employee is null) return (false, "Employee not found.");

        employee.PasscodeHash = null;
        employee.PasscodeSetAt = null;
        employee.PasscodeFailedCount = 0;
        employee.PasscodeLockoutUntil = null;
        employee.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync(userId, "PasscodeReset", "Employee", employee.Id.ToString(),
            $"Break passcode reset for '{employee.FullName}' ({employee.EmployeeCode}).");
        await _liveUpdates.NotifyAsync("employees");
        return (true, null);
    }

    private async Task RegisterFailureAsync(Employee employee)
    {
        employee.PasscodeFailedCount += 1;
        if (employee.PasscodeFailedCount >= EmployeePasscodeRules.MaxAttempts)
        {
            employee.PasscodeLockoutUntil = DateTime.UtcNow.AddMinutes(EmployeePasscodeRules.LockoutMinutes);
            employee.PasscodeFailedCount = EmployeePasscodeRules.MaxAttempts;
        }
        employee.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    private static bool IsLocked(Employee employee) =>
        employee.PasscodeLockoutUntil.HasValue && employee.PasscodeLockoutUntil.Value > DateTime.UtcNow;

    private static PasscodeApiResult Status(Employee employee, string message, string? errorCode = null)
    {
        var now = DateTime.UtcNow;
        var locked = employee.PasscodeLockoutUntil.HasValue && employee.PasscodeLockoutUntil.Value > now;
        var failed = locked
            ? EmployeePasscodeRules.MaxAttempts
            : employee.PasscodeLockoutUntil.HasValue && employee.PasscodeLockoutUntil.Value <= now
                ? 0
                : employee.PasscodeFailedCount;
        var left = Math.Max(0, EmployeePasscodeRules.MaxAttempts - failed);
        return new PasscodeApiResult(
            errorCode is null,
            message,
            errorCode,
            !string.IsNullOrEmpty(employee.PasscodeHash),
            left,
            locked,
            employee.PasscodeLockoutUntil);
    }

    private static PasscodeApiResult Locked(Employee employee)
    {
        var until = employee.PasscodeLockoutUntil ?? DateTime.UtcNow;
        return new PasscodeApiResult(
            false,
            $"Too many incorrect attempts. Try again after {until.ToLocalTime():HH:mm}.",
            "PASSCODE_LOCKED",
            true,
            0,
            true,
            employee.PasscodeLockoutUntil);
    }

    private static PasscodeApiResult Fail(string message, string errorCode) =>
        new(false, message, errorCode);

    private static PasscodeApiResult FailResult(Employee employee, string message, string errorCode)
    {
        var locked = IsLocked(employee);
        var left = locked
            ? 0
            : Math.Max(0, EmployeePasscodeRules.MaxAttempts - employee.PasscodeFailedCount);
        return new PasscodeApiResult(
            false,
            message,
            errorCode,
            !string.IsNullOrEmpty(employee.PasscodeHash),
            left,
            locked,
            employee.PasscodeLockoutUntil);
    }
}
