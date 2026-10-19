using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261019170000_AddBreakSessionStartOffsets")]
public partial class AddBreakSessionStartOffsets : Migration
{
    /// <summary>
    /// Additive only: stores minutes added to a displayed break start.
    /// BreakSession out-times and in-times are never changed.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.BreakSessionStartOffsets', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.BreakSessionStartOffsets (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    BreakSessionId int NOT NULL,
                    AddedMinutes int NOT NULL
                );
            END

            IF OBJECT_ID(N'dbo.BreakSessionStartOffsets', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.BreakSessions', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys
                    WHERE name = N'FK_BreakSessionStartOffsets_BreakSessions_BreakSessionId')
            BEGIN
                ALTER TABLE dbo.BreakSessionStartOffsets
                ADD CONSTRAINT FK_BreakSessionStartOffsets_BreakSessions_BreakSessionId
                FOREIGN KEY (BreakSessionId) REFERENCES dbo.BreakSessions (Id) ON DELETE CASCADE;
            END

            IF OBJECT_ID(N'dbo.BreakSessionStartOffsets', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_BreakSessionStartOffsets_BreakSessionId'
                      AND object_id = OBJECT_ID(N'dbo.BreakSessionStartOffsets'))
            BEGIN
                CREATE UNIQUE INDEX IX_BreakSessionStartOffsets_BreakSessionId
                    ON dbo.BreakSessionStartOffsets (BreakSessionId);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.BreakSessionStartOffsets', N'U') IS NOT NULL
                DROP TABLE dbo.BreakSessionStartOffsets;
            """);
    }
}
