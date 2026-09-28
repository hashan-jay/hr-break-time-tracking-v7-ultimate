using HRTimeTracking.Api.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<BreakSession> BreakSessions => Set<BreakSession>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<ShiftDepartmentBreakLimit> ShiftDepartmentBreakLimits => Set<ShiftDepartmentBreakLimit>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<BreakTimeAdjustment> BreakTimeAdjustments => Set<BreakTimeAdjustment>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Department>(entity =>
        {
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.IsDeleted);
            entity.Property(x => x.Name).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(250);
            entity.Property(x => x.MealBreakStartLimit).IsRequired();
            entity.Property(x => x.ComfortBreakStartLimit).IsRequired();
        });

        builder.Entity<Shift>(entity =>
        {
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.IsActive);
            entity.Property(x => x.Name).HasMaxLength(100).IsRequired();
        });

        builder.Entity<Employee>(entity =>
        {
            entity.HasIndex(x => x.EmployeeCode).IsUnique();
            entity.HasIndex(x => x.IsDeleted);
            entity.HasIndex(x => x.ShiftId);
            entity.Property(x => x.EmployeeCode).HasMaxLength(50).IsRequired();
            entity.Property(x => x.FullName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.PasscodeHash).HasMaxLength(500);
            entity.Property(x => x.PasscodeFailedCount).IsRequired().HasDefaultValue(0);

            entity.HasOne(x => x.Department)
                .WithMany(x => x.Employees)
                .HasForeignKey(x => x.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Shift)
                .WithMany(x => x.Employees)
                .HasForeignKey(x => x.ShiftId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<BreakSession>(entity =>
        {
            entity.HasIndex(x => new { x.EmployeeId, x.BreakDate });
            entity.HasIndex(x => new { x.EmployeeId, x.InTime });
            entity.HasIndex(x => new { x.EmployeeId, x.BreakType, x.BreakDate });
            entity.Property(x => x.BreakType).HasMaxLength(20).IsRequired();
            entity.Property(x => x.IsAutoClosed).IsRequired().HasDefaultValue(false);
            entity.Property(x => x.RecordedByUserId).HasMaxLength(450);
            entity.Property(x => x.ClosedByUserId).HasMaxLength(450);

            entity.HasOne(x => x.Employee)
                .WithMany(x => x.BreakSessions)
                .HasForeignKey(x => x.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.RecordedByUser)
                .WithMany()
                .HasForeignKey(x => x.RecordedByUserId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(x => x.ClosedByUser)
                .WithMany()
                .HasForeignKey(x => x.ClosedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<AuditLog>(entity =>
        {
            entity.HasIndex(x => x.CreatedAt);
            entity.HasIndex(x => x.EntityType);
            entity.Property(x => x.UserId).HasMaxLength(450);
            entity.Property(x => x.Action).HasMaxLength(100).IsRequired();
            entity.Property(x => x.EntityType).HasMaxLength(100).IsRequired();
            entity.Property(x => x.EntityId).HasMaxLength(100);
            entity.Property(x => x.Details).HasMaxLength(2000);
            entity.Property(x => x.IpAddress).HasMaxLength(45);
        });

        builder.Entity<SystemSetting>(entity =>
        {
            entity.HasIndex(x => x.Key).IsUnique();
            entity.Property(x => x.Key).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Value).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(250);
        });

        builder.Entity<ShiftDepartmentBreakLimit>(entity =>
        {
            entity.HasIndex(x => new { x.ShiftId, x.DepartmentId }).IsUnique();
            entity.Property(x => x.MealBreakStartLimit).IsRequired();
            entity.Property(x => x.ComfortBreakStartLimit).IsRequired();
            entity.Property(x => x.MealBreakLimitMinutes).IsRequired();
            entity.Property(x => x.ComfortBreakLimitMinutes).IsRequired();

            entity.HasOne(x => x.Shift)
                .WithMany()
                .HasForeignKey(x => x.ShiftId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Department)
                .WithMany()
                .HasForeignKey(x => x.DepartmentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<RolePermission>(entity =>
        {
            entity.HasIndex(x => new { x.RoleName, x.SectionKey }).IsUnique();
            entity.Property(x => x.RoleName).HasMaxLength(50).IsRequired();
            entity.Property(x => x.SectionKey).HasMaxLength(50).IsRequired();
        });

        builder.Entity<UserPermission>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.SectionKey }).IsUnique();
            entity.Property(x => x.UserId).HasMaxLength(450).IsRequired();
            entity.Property(x => x.SectionKey).HasMaxLength(50).IsRequired();
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<BreakTimeAdjustment>(entity =>
        {
            entity.HasIndex(x => new { x.EmployeeId, x.BreakDate, x.BreakType }).IsUnique();
            entity.Property(x => x.BreakType).HasMaxLength(20).IsRequired();
            entity.Property(x => x.UpdatedByUserId).HasMaxLength(450);
            entity.HasOne(x => x.Employee)
                .WithMany()
                .HasForeignKey(x => x.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
