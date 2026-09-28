using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260817150000_AddSystemAdministrationRole")]
public partial class AddSystemAdministrationRole : Migration
{
    /// <summary>
    /// Additive only: inserts the SystemAdministration Identity role and its default
    /// RolePermissions if they are missing. Existing users, roles, and permission
    /// rows are not modified or deleted.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.AspNetRoles', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles WHERE NormalizedName = N'SYSTEMADMINISTRATION')
            BEGIN
                INSERT INTO dbo.AspNetRoles (Id, Name, NormalizedName, ConcurrencyStamp)
                VALUES (
                    CONVERT(nvarchar(450), NEWID()),
                    N'SystemAdministration',
                    N'SYSTEMADMINISTRATION',
                    CONVERT(nvarchar(450), NEWID())
                );
            END

            IF OBJECT_ID(N'dbo.RolePermissions', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM dbo.RolePermissions WHERE RoleName = N'SystemAdministration')
            BEGIN
                INSERT INTO dbo.RolePermissions (RoleName, SectionKey) VALUES
                    (N'SystemAdministration', N'dashboard'),
                    (N'SystemAdministration', N'settings'),
                    (N'SystemAdministration', N'audit');
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop roles or permission data.
    }
}
