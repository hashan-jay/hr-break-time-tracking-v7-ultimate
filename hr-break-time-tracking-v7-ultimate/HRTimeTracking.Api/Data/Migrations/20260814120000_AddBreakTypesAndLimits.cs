using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260814120000_AddBreakTypesAndLimits")]
public partial class AddBreakTypesAndLimits : Migration
{
    /// <summary>
    /// Additive only: adds BreakSessions.BreakType (default Comfort for existing rows)
    /// and does not delete or alter existing break times, employees, or other data.
    /// Idempotent so a partial previous apply cannot block startup.
    /// Meal/Comfort limit settings are seeded in DbSeeder (idempotent inserts).
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.BreakSessions', 'BreakType') IS NULL
            BEGIN
                ALTER TABLE dbo.BreakSessions ADD BreakType nvarchar(20) NOT NULL
                    CONSTRAINT DF_BreakSessions_BreakType DEFAULT ('Comfort');
            END

            IF COL_LENGTH('dbo.BreakSessions', 'BreakType') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_BreakSessions_EmployeeId_BreakType_BreakDate'
                      AND object_id = OBJECT_ID(N'dbo.BreakSessions'))
                CREATE INDEX IX_BreakSessions_EmployeeId_BreakType_BreakDate
                    ON dbo.BreakSessions (EmployeeId, BreakType, BreakDate);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop break-type data.
    }
}
