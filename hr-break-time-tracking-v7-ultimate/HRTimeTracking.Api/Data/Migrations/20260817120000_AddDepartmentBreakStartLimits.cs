using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260817120000_AddDepartmentBreakStartLimits")]
public partial class AddDepartmentBreakStartLimits : Migration
{
    /// <summary>
    /// Additive only: adds Departments.MealBreakStartLimit and ComfortBreakStartLimit.
    /// Existing departments are copied from the current global SystemSettings values
    /// (or 1 / 2 if those keys are missing). Never deletes or alters other data.
    /// Idempotent so a partial previous apply cannot block startup.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.Departments', 'MealBreakStartLimit') IS NULL
            BEGIN
                ALTER TABLE dbo.Departments ADD MealBreakStartLimit int NOT NULL
                    CONSTRAINT DF_Departments_MealBreakStartLimit DEFAULT (1);

                DECLARE @mealDefault int = 1;
                SELECT @mealDefault = TRY_CAST([Value] AS int)
                FROM dbo.SystemSettings WHERE [Key] = N'MealBreakStartLimit';
                IF @mealDefault IS NULL OR @mealDefault < 1 SET @mealDefault = 1;
                IF @mealDefault > 20 SET @mealDefault = 20;

                DECLARE @mealSql nvarchar(300) =
                    N'UPDATE dbo.Departments SET MealBreakStartLimit = ' + CAST(@mealDefault AS nvarchar(10));
                EXEC sp_executesql @mealSql;
            END

            IF COL_LENGTH('dbo.Departments', 'ComfortBreakStartLimit') IS NULL
            BEGIN
                ALTER TABLE dbo.Departments ADD ComfortBreakStartLimit int NOT NULL
                    CONSTRAINT DF_Departments_ComfortBreakStartLimit DEFAULT (2);

                DECLARE @comfortDefault int = 2;
                SELECT @comfortDefault = TRY_CAST([Value] AS int)
                FROM dbo.SystemSettings WHERE [Key] = N'ComfortBreakStartLimit';
                IF @comfortDefault IS NULL OR @comfortDefault < 1 SET @comfortDefault = 2;
                IF @comfortDefault > 20 SET @comfortDefault = 20;

                DECLARE @comfortSql nvarchar(300) =
                    N'UPDATE dbo.Departments SET ComfortBreakStartLimit = ' + CAST(@comfortDefault AS nvarchar(10));
                EXEC sp_executesql @comfortSql;
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop department start-limit data.
    }
}
