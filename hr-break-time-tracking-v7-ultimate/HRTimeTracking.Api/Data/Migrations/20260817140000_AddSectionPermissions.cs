using HRTimeTracking.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HRTimeTracking.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260817140000_AddSectionPermissions")]
public partial class AddSectionPermissions : Migration
{
    /// <summary>
    /// Additive only: RolePermissions and UserPermissions tables.
    /// Existing users, roles, and break data are not modified. Seed copies current
    /// hardcoded role access onto the new tables.
    /// </summary>
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.RolePermissions', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.RolePermissions (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    RoleName nvarchar(50) NOT NULL,
                    SectionKey nvarchar(50) NOT NULL
                );
            END

            IF OBJECT_ID(N'dbo.RolePermissions', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RolePermissions_RoleName_SectionKey' AND object_id = OBJECT_ID(N'dbo.RolePermissions'))
                CREATE UNIQUE INDEX IX_RolePermissions_RoleName_SectionKey
                    ON dbo.RolePermissions (RoleName, SectionKey);

            IF OBJECT_ID(N'dbo.UserPermissions', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.UserPermissions (
                    Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    UserId nvarchar(450) NOT NULL,
                    SectionKey nvarchar(50) NOT NULL
                );
            END

            IF OBJECT_ID(N'dbo.UserPermissions', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UserPermissions_UserId_SectionKey' AND object_id = OBJECT_ID(N'dbo.UserPermissions'))
                CREATE UNIQUE INDEX IX_UserPermissions_UserId_SectionKey
                    ON dbo.UserPermissions (UserId, SectionKey);

            IF OBJECT_ID(N'dbo.UserPermissions', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.AspNetUsers', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_UserPermissions_AspNetUsers_UserId')
                ALTER TABLE dbo.UserPermissions
                ADD CONSTRAINT FK_UserPermissions_AspNetUsers_UserId
                FOREIGN KEY (UserId) REFERENCES dbo.AspNetUsers (Id) ON DELETE CASCADE;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally empty: never drop permission data.
    }
}
