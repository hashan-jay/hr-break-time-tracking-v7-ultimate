using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260821180000_AddShiftDepartmentBreakLimits")]
public partial class AddShiftDepartmentBreakLimits : Migration
{
    /// <summary>
    /// Additive only: creates ShiftDepartmentBreakLimits and backfills one row per shift
    /// and department from existing department start limits and global duration settings.
    /// Never deletes or overwrites configured rows.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.ShiftDepartmentBreakLimits', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ShiftDepartmentBreakLimits (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    ShiftId int NOT NULL,
                    DepartmentId int NOT NULL,
                    MealBreakStartLimit int NOT NULL,
                    ComfortBreakStartLimit int NOT NULL,
                    MealBreakLimitMinutes int NOT NULL,
                    ComfortBreakLimitMinutes int NOT NULL,
                    CreatedAt datetime2 NOT NULL,
                    UpdatedAt datetime2 NULL
                );
            END

            IF OBJECT_ID(N'dbo.ShiftDepartmentBreakLimits', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.Shifts', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_ShiftDepartmentBreakLimits_Shifts_ShiftId')
            BEGIN
                ALTER TABLE dbo.ShiftDepartmentBreakLimits
                ADD CONSTRAINT FK_ShiftDepartmentBreakLimits_Shifts_ShiftId
                FOREIGN KEY (ShiftId) REFERENCES dbo.Shifts (Id) ON DELETE CASCADE;
            END

            IF OBJECT_ID(N'dbo.ShiftDepartmentBreakLimits', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.Departments', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_ShiftDepartmentBreakLimits_Departments_DepartmentId')
            BEGIN
                ALTER TABLE dbo.ShiftDepartmentBreakLimits
                ADD CONSTRAINT FK_ShiftDepartmentBreakLimits_Departments_DepartmentId
                FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments (Id) ON DELETE CASCADE;
            END

            IF OBJECT_ID(N'dbo.ShiftDepartmentBreakLimits', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_ShiftDepartmentBreakLimits_ShiftId_DepartmentId'
                      AND object_id = OBJECT_ID(N'dbo.ShiftDepartmentBreakLimits'))
            BEGIN
                CREATE UNIQUE INDEX IX_ShiftDepartmentBreakLimits_ShiftId_DepartmentId
                    ON dbo.ShiftDepartmentBreakLimits (ShiftId, DepartmentId);
            END

            IF OBJECT_ID(N'dbo.ShiftDepartmentBreakLimits', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.Shifts', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.Departments', N'U') IS NOT NULL
            BEGIN
                DECLARE @mealMinutes int = 60;
                DECLARE @comfortMinutes int = 20;

                SELECT TOP 1 @mealMinutes = TRY_CAST([Value] AS int)
                FROM dbo.SystemSettings WHERE [Key] = N'MealBreakLimitMinutes';
                IF @mealMinutes IS NULL OR @mealMinutes < 1 SET @mealMinutes = 60;
                IF @mealMinutes > 240 SET @mealMinutes = 240;

                SELECT TOP 1 @comfortMinutes = TRY_CAST([Value] AS int)
                FROM dbo.SystemSettings
                WHERE [Key] = N'ComfortBreakLimitMinutes' OR [Key] = N'DailyBreakLimitMinutes'
                ORDER BY CASE WHEN [Key] = N'ComfortBreakLimitMinutes' THEN 0 ELSE 1 END;
                IF @comfortMinutes IS NULL OR @comfortMinutes < 1 SET @comfortMinutes = 20;
                IF @comfortMinutes > 240 SET @comfortMinutes = 240;

                INSERT INTO dbo.ShiftDepartmentBreakLimits (
                    ShiftId,
                    DepartmentId,
                    MealBreakStartLimit,
                    ComfortBreakStartLimit,
                    MealBreakLimitMinutes,
                    ComfortBreakLimitMinutes,
                    CreatedAt)
                SELECT
                    s.Id,
                    d.Id,
                    CASE
                        WHEN d.MealBreakStartLimit IS NULL OR d.MealBreakStartLimit < 1 OR d.MealBreakStartLimit > 20 THEN 1
                        ELSE d.MealBreakStartLimit
                    END,
                    CASE
                        WHEN d.ComfortBreakStartLimit IS NULL OR d.ComfortBreakStartLimit < 1 OR d.ComfortBreakStartLimit > 20 THEN 2
                        ELSE d.ComfortBreakStartLimit
                    END,
                    @mealMinutes,
                    @comfortMinutes,
                    SYSUTCDATETIME()
                FROM dbo.Shifts s
                CROSS JOIN dbo.Departments d
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.ShiftDepartmentBreakLimits existing
                    WHERE existing.ShiftId = s.Id AND existing.DepartmentId = d.Id);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop shift/department break-limit data.
    }
}
