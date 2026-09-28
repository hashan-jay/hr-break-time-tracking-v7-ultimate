using System.ComponentModel.DataAnnotations;
using HRTimeTracking.Api.Models;

namespace HRTimeTracking.Api.DTOs;

public record LoginRequest(
    [Required] string UserName,
    [Required] string Password);

public record LoginResponse(
    string Token,
    DateTime ExpiresAt,
    UserDto User);

public record UserDto(
    string Id,
    string UserName,
    string FullName,
    IReadOnlyList<string> Roles,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    IReadOnlyList<string> Permissions);

public record CreateUserRequest(
    [Required] string UserName,
    [Required] string FullName,
    [Required, MinLength(8)] string Password,
    [Required] string Role);

public record UpdateUserRequest(
    [Required] string FullName,
    [Required] string Role,
    bool IsActive);

public record ConfirmStaffCredentialsRequest(
    [Required] string UserName,
    [Required] string Password);

public record ChangePasswordRequest(
    [Required, MinLength(8)] string NewPassword);

public record SectionCatalogItem(string Key, string Label);

public record RoleAccessDto(
    string Role,
    string RoleLabel,
    IReadOnlyList<string> Sections,
    bool Locked);

public record UpdateSectionsRequest([Required] IReadOnlyList<string> Sections);

public record DepartmentDto(
    int Id,
    string Name,
    string? Description,
    bool IsDeleted,
    DateTime? DeletedAt,
    int EmployeeCount,
    DateTime CreatedAt,
    int MealStartLimit = BreakStatusCodes.DefaultMealStartLimit,
    int ComfortStartLimit = BreakStatusCodes.DefaultComfortStartLimit);

public record CreateDepartmentRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(250)] string? Description);

public record UpdateDepartmentRequest(
    [Required, MaxLength(100)] string Name,
    [MaxLength(250)] string? Description);

public record EmployeeDto(
    int Id,
    string EmployeeCode,
    string FullName,
    int DepartmentId,
    string DepartmentName,
    int? ShiftId,
    string? ShiftName,
    string? ShiftDisplay,
    bool IsDeactivated,
    DateTime? DeactivatedAt,
    DateTime HireDate,
    bool HasPasscode = false);

public record CreateEmployeeRequest(
    [Required, MaxLength(50)] string EmployeeCode,
    [Required, MaxLength(150)] string FullName,
    [Required] int DepartmentId,
    int? ShiftId);

public record UpdateEmployeeRequest(
    [Required, MaxLength(50)] string EmployeeCode,
    [Required, MaxLength(150)] string FullName,
    [Required] int DepartmentId,
    DateTime HireDate,
    int? ShiftId);

public record EmployeeCodeStatusDto(
    bool Available,
    string? Message);

public record ShiftDto(
    int Id,
    string Name,
    string StartTime,
    string EndTime,
    bool SpansNextDay,
    string DisplayLabel,
    bool IsActive,
    int EmployeeCount,
    DateTime CreatedAt);

public record CreateShiftRequest(
    [Required, MaxLength(100)] string Name,
    [Required] string StartTime,
    [Required] string EndTime,
    bool IsActive = true);

public record UpdateShiftRequest(
    [Required, MaxLength(100)] string Name,
    [Required] string StartTime,
    [Required] string EndTime,
    bool IsActive);

public record BreakSessionDto(
    int Id,
    int EmployeeId,
    string EmployeeCode,
    string EmployeeName,
    string DepartmentName,
    string BreakType,
    DateTime OutTime,
    DateTime? InTime,
    int? DurationSeconds,
    string? DurationDisplay,
    DateOnly BreakDate,
    bool IsOpen,
    bool IsAutoClosed = false);

public record EmployeeBreakStatusDto(
    int EmployeeId,
    string EmployeeCode,
    string FullName,
    int DepartmentId,
    string DepartmentName,
    int ComfortBreakSecondsToday,
    string ComfortBreakDisplay,
    string ComfortStatus,
    string ComfortStatusColor,
    int ComfortClosedCountToday,
    int MealBreakSecondsToday,
    string MealBreakDisplay,
    string MealStatus,
    string MealStatusColor,
    int MealClosedCountToday,
    bool IsOnBreak,
    string? CurrentBreakType,
    DateTime? CurrentOutTime,
    int? CurrentBreakElapsedSeconds,
    int ComfortClosedSeconds = 0,
    int MealClosedSeconds = 0,
    bool IsWithinShift = true,
    string? ShiftName = null,
    string? ShiftDisplay = null,
    DateTime? NextShiftStart = null,
    int ComfortStartCountToday = 0,
    int MealStartCountToday = 0,
    int ComfortStartLimit = BreakStatusCodes.DefaultComfortStartLimit,
    int MealStartLimit = BreakStatusCodes.DefaultMealStartLimit,
    DateTime? ShiftPeriodEnd = null,
    bool HasPasscode = false,
    int MealLimitMinutes = BreakStatusCodes.DefaultMealLimitMinutes,
    int ComfortLimitMinutes = BreakStatusCodes.DefaultComfortLimitMinutes,
    int MealAdjustmentMinutes = 0,
    int ComfortAdjustmentMinutes = 0)
{
    public bool IsOnComfortBreak => IsOnBreak && CurrentBreakType == BreakTypes.Comfort;
    public bool IsOnMealBreak => IsOnBreak && CurrentBreakType == BreakTypes.Meal;
}

public record ToggleBreakRequest(
    [Required] int EmployeeId,
    [Required] string BreakType,
    string? Passcode = null);

public record SetEmployeePasscodeRequest(
    [Required] int EmployeeId,
    [Required] string Passcode,
    [Required] string ConfirmPasscode);

public record PasscodeApiResult(
    bool Ok,
    string Message,
    string? ErrorCode = null,
    bool HasPasscode = false,
    int AttemptsLeft = EmployeePasscodeRules.MaxAttempts,
    bool IsLocked = false,
    DateTime? LockedUntil = null);

public record LiveBoardDto(
    DateOnly Date,
    int ComfortLimitMinutes,
    int MealLimitMinutes,
    IReadOnlyList<EmployeeBreakStatusDto> Employees,
    int OnBreakCount,
    int ComfortOnBreakCount,
    int MealOnBreakCount,
    int ComfortExceededCount,
    int ComfortSatisfiedCount,
    int ComfortWellSatisfiedCount,
    int MealExceededCount,
    int MealSatisfiedCount,
    int MealWellSatisfiedCount,
    DateTime? PeriodStart = null,
    DateTime? PeriodEnd = null,
    string? PeriodLabel = null,
    int ComfortStartLimit = BreakStatusCodes.DefaultComfortStartLimit,
    int MealStartLimit = BreakStatusCodes.DefaultMealStartLimit,
    string PortalWeather = "rain");

public record ReportRowDto(
    int EmployeeId,
    string EmployeeCode,
    string EmployeeName,
    string DepartmentName,
    string? ShiftName,
    DateOnly Date,
    int ComfortBreakSeconds,
    string ComfortBreakDisplay,
    string ComfortStatus,
    string ComfortStatusColor,
    int ComfortBreakCount,
    int MealBreakSeconds,
    string MealBreakDisplay,
    string MealStatus,
    string MealStatusColor,
    int MealBreakCount,
    DateTime? PeriodStart = null,
    DateTime? PeriodEnd = null,
    string? PeriodLabel = null);

public record ReportSummaryDto(
    DateOnly From,
    DateOnly To,
    int ComfortLimitMinutes,
    int MealLimitMinutes,
    int EmployeeDays,
    int ComfortWellSatisfiedCount,
    int ComfortSatisfiedCount,
    int ComfortExceededCount,
    int MealWellSatisfiedCount,
    int MealSatisfiedCount,
    int MealExceededCount,
    int? ShiftId,
    string? ShiftName,
    string? ShiftDisplay,
    IReadOnlyList<ReportRowDto> Rows,
    int ComfortStartLimit = BreakStatusCodes.DefaultComfortStartLimit,
    int MealStartLimit = BreakStatusCodes.DefaultMealStartLimit);

public record DashboardTrendPointDto(
    DateOnly Date,
    int Breaks,
    int MealBreaks,
    int ComfortBreaks);

public record DashboardDto(
    int ActiveEmployees,
    int ActiveDepartments,
    int OnBreakNow,
    int ComfortOnBreakNow,
    int MealOnBreakNow,
    int ComfortExceededToday,
    int ComfortSatisfiedToday,
    int ComfortWellSatisfiedToday,
    int MealExceededToday,
    int MealSatisfiedToday,
    int MealWellSatisfiedToday,
    int ComfortLimitMinutes,
    int MealLimitMinutes,
    int ComfortStartLimit = BreakStatusCodes.DefaultComfortStartLimit,
    int MealStartLimit = BreakStatusCodes.DefaultMealStartLimit,
    int BreaksToday = 0,
    int BreaksYesterday = 0,
    double? BreaksChangePercent = null,
    double CompliancePercent = 100,
    double? ComplianceChangePercent = null,
    int LimitBreachesToday = 0,
    int LimitBreachesYesterday = 0,
    double? LimitBreachesChangePercent = null,
    IReadOnlyList<DashboardTrendPointDto>? Trend = null,
    WorkforceEfficiencySnapshotDto? WorkforceEfficiency = null);

public record WorkforceShiftScoreDto(
    int ShiftId,
    string ShiftName,
    string ShiftLabel,
    int ShiftMinutes,
    int WorkMinutes,
    int BreakAllowanceMinutes,
    int EmployeeCount,
    double ShiftPeopleMinutes,
    double UsedBreakPeopleMinutes,
    double BreakSharePercent,
    double EfficiencyPercent,
    double ExpectedEfficiencyPercent,
    string Tone,
    string Comment,
    bool IsLive,
    DateOnly PeriodStartDate);

public record WorkforceDayPointDto(
    DateOnly Date,
    double EfficiencyPercent,
    double? MovingAverage7,
    double? TrendLine,
    int EmployeeCount,
    double ShiftPeopleMinutes,
    double UsedBreakPeopleMinutes,
    double BreakSharePercent,
    bool IsFinal = false);

public record WorkforceRegressionDto(
    double SlopePerDay,
    double Intercept,
    double RSquared,
    double? ForecastNextDay,
    string TrendLabel,
    string Insight);

public record WorkforceEfficiencySnapshotDto(
    int BreakAllowanceMinutes,
    double EfficiencyPercent,
    double? ChangePercent,
    string Tone,
    string Comment,
    bool HasLiveShift,
    int? HighlightedShiftId,
    string? HighlightedShiftLabel,
    IReadOnlyList<WorkforceShiftScoreDto> Shifts,
    IReadOnlyList<WorkforceDayPointDto> Daily,
    WorkforceRegressionDto? Regression,
    double? DayEfficiencyPercent = null,
    double? DayChangePercent = null,
    bool DayIsFinal = false);

public record SystemSettingDto(int Id, string Key, string Value, string? Description);

public record UpdateSettingRequest([Required, MaxLength(500)] string Value);

public record DepartmentStartLimitDto(
    int DepartmentId,
    string DepartmentName,
    bool IsDeleted,
    int EmployeeCount,
    int MealStartLimit,
    int ComfortStartLimit);

public record UpdateDepartmentStartLimitsRequest(
    [Required, Range(BreakStatusCodes.MinStartLimit, BreakStatusCodes.MaxStartLimit)] int MealStartLimit,
    [Required, Range(BreakStatusCodes.MinStartLimit, BreakStatusCodes.MaxStartLimit)] int ComfortStartLimit);

public record ShiftDepartmentBreakLimitDto(
    int Id,
    int ShiftId,
    string ShiftName,
    string ShiftDisplay,
    int DepartmentId,
    string DepartmentName,
    bool DepartmentIsDeleted,
    int EmployeeCount,
    int MealStartLimit,
    int ComfortStartLimit,
    int MealLimitMinutes,
    int ComfortLimitMinutes);

public record ShiftDepartmentBreakLimitsGroupDto(
    int ShiftId,
    string ShiftName,
    string ShiftDisplay,
    string StartTime,
    string EndTime,
    bool SpansNextDay,
    bool IsActive,
    IReadOnlyList<ShiftDepartmentBreakLimitDto> Departments);

public record UpdateShiftDepartmentBreakLimitsRequest(
    [Required, Range(BreakStatusCodes.MinStartLimit, BreakStatusCodes.MaxStartLimit)] int MealStartLimit,
    [Required, Range(BreakStatusCodes.MinStartLimit, BreakStatusCodes.MaxStartLimit)] int ComfortStartLimit,
    [Required, Range(1, 240)] int MealLimitMinutes,
    [Required, Range(1, 240)] int ComfortLimitMinutes);

public record ResolvedBreakLimitsDto(
    int MealStartLimit,
    int ComfortStartLimit,
    int MealLimitMinutes,
    int ComfortLimitMinutes);

public record AuditLogDto(
    long Id,
    string? UserId,
    string Action,
    string EntityType,
    string? EntityId,
    string? Details,
    DateTime CreatedAt,
    string? IpAddress);

public record AuditReportRowDto(
    long Id,
    string? UserId,
    string? UserName,
    string Action,
    string EntityType,
    string? EntityId,
    string? Details,
    DateTime CreatedAt,
    string? IpAddress,
    string? EmployeeName = null,
    DateTime? OutTime = null,
    DateTime? InTime = null);

public record AuditActionCountDto(string Action, int Count);

public record AuditReportDto(
    DateOnly From,
    DateOnly To,
    int TotalEntries,
    int DistinctUsers,
    int DistinctActions,
    IReadOnlyList<AuditActionCountDto> ActionCounts,
    IReadOnlyList<AuditReportRowDto> Rows);

public record ApiMessage(string Message);

public record BreakTimeAdjustmentRowDto(
    int EmployeeId,
    string EmployeeCode,
    string EmployeeName,
    string DepartmentName,
    string? ShiftName,
    DateOnly Date,
    string BreakType,
    int LimitMinutes,
    int RawTotalSeconds,
    string RawTotalDisplay,
    int DisplayedTotalSeconds,
    string DisplayedTotalDisplay,
    int AdjustmentMinutes,
    int AttemptsUsed,
    int AttemptsLeft,
    bool CanAdjust,
    int? ShiftId = null,
    string Status = "",
    string StatusColor = "green");

public record BreakTimeAdjustmentShiftOptionDto(int Id, string Name, string DisplayLabel);

public record BreakTimeAdjustmentListDto(
    DateOnly Date,
    DateOnly MinDate,
    DateOnly MaxDate,
    int MealLimitMinutes,
    int ComfortLimitMinutes,
    IReadOnlyList<BreakTimeAdjustmentRowDto> Rows,
    IReadOnlyList<BreakTimeAdjustmentShiftOptionDto>? Shifts = null);

public record SaveBreakTimeAdjustmentRequest(
    [Required] int EmployeeId,
    [Required] DateOnly Date,
    [Required] string BreakType,
    [Required] int DisplayedTotalSeconds);
