using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260821140000_AddEmployeePasscode")]
public partial class AddEmployeePasscode : Migration
{
    /// <summary>
    /// Additive only: passcode hash and lockout columns on Employees.
    /// Existing employee rows and break records are not modified.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.Employees', 'PasscodeHash') IS NULL
                ALTER TABLE dbo.Employees ADD PasscodeHash nvarchar(500) NULL;
            IF COL_LENGTH('dbo.Employees', 'PasscodeSetAt') IS NULL
                ALTER TABLE dbo.Employees ADD PasscodeSetAt datetime2 NULL;
            IF COL_LENGTH('dbo.Employees', 'PasscodeFailedCount') IS NULL
                ALTER TABLE dbo.Employees ADD PasscodeFailedCount int NOT NULL
                    CONSTRAINT DF_Employees_PasscodeFailedCount DEFAULT (0);
            IF COL_LENGTH('dbo.Employees', 'PasscodeLockoutUntil') IS NULL
                ALTER TABLE dbo.Employees ADD PasscodeLockoutUntil datetime2 NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop employee columns or data.
    }
}
