using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260814100000_AddShifts")]
public partial class AddShifts : Migration
{
    /// <summary>
    /// Additive only: creates Shifts table and nullable Employees.ShiftId.
    /// Does not modify or delete any existing employee/break/department data.
    /// Idempotent so a partial previous apply cannot block startup.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.Shifts', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.Shifts (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    Name nvarchar(100) NOT NULL,
                    StartTime time NOT NULL,
                    EndTime time NOT NULL,
                    SpansNextDay bit NOT NULL,
                    IsActive bit NOT NULL,
                    CreatedAt datetime2 NOT NULL,
                    UpdatedAt datetime2 NULL
                );
            END

            IF OBJECT_ID(N'dbo.Shifts', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Shifts_Name' AND object_id = OBJECT_ID(N'dbo.Shifts'))
                CREATE UNIQUE INDEX IX_Shifts_Name ON dbo.Shifts (Name);

            IF OBJECT_ID(N'dbo.Shifts', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Shifts_IsActive' AND object_id = OBJECT_ID(N'dbo.Shifts'))
                CREATE INDEX IX_Shifts_IsActive ON dbo.Shifts (IsActive);

            IF COL_LENGTH('dbo.Employees', 'ShiftId') IS NULL
                ALTER TABLE dbo.Employees ADD ShiftId int NULL;

            IF COL_LENGTH('dbo.Employees', 'ShiftId') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Employees_ShiftId' AND object_id = OBJECT_ID(N'dbo.Employees'))
                CREATE INDEX IX_Employees_ShiftId ON dbo.Employees (ShiftId);

            IF COL_LENGTH('dbo.Employees', 'ShiftId') IS NOT NULL
               AND OBJECT_ID(N'dbo.Shifts', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Employees_Shifts_ShiftId')
                ALTER TABLE dbo.Employees
                ADD CONSTRAINT FK_Employees_Shifts_ShiftId
                FOREIGN KEY (ShiftId) REFERENCES dbo.Shifts (Id) ON DELETE SET NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop shift data or employee assignments.
    }
}
