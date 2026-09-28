using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260817160000_AddBreakSessionAutoClosed")]
public partial class AddBreakSessionAutoClosed : Migration
{
    /// <summary>
    /// Additive only: BreakSessions.IsAutoClosed. Existing rows default to 0.
    /// Open and closed break times are not modified here; forgotten open
    /// sessions are closed at shift end by the runtime auto-close service.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.BreakSessions', 'IsAutoClosed') IS NULL
            BEGIN
                ALTER TABLE dbo.BreakSessions ADD IsAutoClosed bit NOT NULL
                    CONSTRAINT DF_BreakSessions_IsAutoClosed DEFAULT (0);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop break-session columns or data.
    }
}
