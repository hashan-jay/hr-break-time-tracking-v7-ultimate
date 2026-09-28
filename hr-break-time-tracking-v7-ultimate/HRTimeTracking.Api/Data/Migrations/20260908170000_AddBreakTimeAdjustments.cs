using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260908170000_AddBreakTimeAdjustments")]
public partial class AddBreakTimeAdjustments : Migration
{
    /// <summary>
    /// Additive only: creates BreakTimeAdjustments. Never changes or deletes BreakSessions.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.BreakTimeAdjustments', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.BreakTimeAdjustments (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    EmployeeId int NOT NULL,
                    BreakDate date NOT NULL,
                    BreakType nvarchar(20) NOT NULL,
                    AdjustmentMinutes int NOT NULL,
                    AttemptsUsed int NOT NULL,
                    UpdatedByUserId nvarchar(450) NULL,
                    CreatedAt datetime2 NOT NULL,
                    UpdatedAt datetime2 NULL
                );
            END

            IF OBJECT_ID(N'dbo.BreakTimeAdjustments', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.Employees', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_BreakTimeAdjustments_Employees_EmployeeId')
            BEGIN
                ALTER TABLE dbo.BreakTimeAdjustments
                ADD CONSTRAINT FK_BreakTimeAdjustments_Employees_EmployeeId
                FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees (Id) ON DELETE CASCADE;
            END

            IF OBJECT_ID(N'dbo.BreakTimeAdjustments', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_BreakTimeAdjustments_EmployeeId_BreakDate_BreakType'
                      AND object_id = OBJECT_ID(N'dbo.BreakTimeAdjustments'))
            BEGIN
                CREATE UNIQUE INDEX IX_BreakTimeAdjustments_EmployeeId_BreakDate_BreakType
                    ON dbo.BreakTimeAdjustments (EmployeeId, BreakDate, BreakType);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Keep the table. Down must not drop data.
    }
}
