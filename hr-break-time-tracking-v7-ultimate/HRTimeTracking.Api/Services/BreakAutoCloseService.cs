using HRTimeTracking.Api.Data;
using HRTimeTracking.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HRTimeTracking.Api.Services;

public interface IBreakAutoCloseService
{
    /// <summary>
    /// Closes forgotten open breaks at the employee's shift end time.
    /// Existing closed sessions are left unchanged. Returns employee ids that were closed.
    /// </summary>
    Task<IReadOnlyList<int>> CloseExpiredAsync(int? employeeId = null, CancellationToken cancellationToken = default);
}

public class BreakAutoCloseService : IBreakAutoCloseService
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private readonly ILogger<BreakAutoCloseService> _logger;
    private readonly ILiveUpdateNotifier _liveUpdates;

    public BreakAutoCloseService(AppDbContext db, IAuditService audit, ILogger<BreakAutoCloseService> logger, ILiveUpdateNotifier liveUpdates)
    {
        _db = db;
        _audit = audit;
        _logger = logger;
        _liveUpdates = liveUpdates;
    }

    public async Task<IReadOnlyList<int>> CloseExpiredAsync(int? employeeId = null, CancellationToken cancellationToken = default)
    {
        var now = TimeDisplay.NowLocal();
        var query = _db.BreakSessions
            .Include(b => b.Employee).ThenInclude(e => e.Shift)
            .Where(b => b.InTime == null);
        if (employeeId.HasValue)
            query = query.Where(b => b.EmployeeId == employeeId.Value);

        var open = await query.ToListAsync(cancellationToken);
        if (open.Count == 0)
            return [];

        var closedEmployeeIds = new List<int>();
        var closedSessions = new List<BreakSession>();
        foreach (var session in open)
        {
            if (session.Employee is null)
                continue;

            session.OutTime = TimeDisplay.AsLocal(session.OutTime);
            var closeAt = ShiftWindow.AutoCloseAt(session.Employee.Shift, session.BreakDate, session.OutTime);
            if (!closeAt.HasValue || now < closeAt.Value || session.OutTime >= closeAt.Value)
                continue;

            var type = string.IsNullOrWhiteSpace(session.BreakType)
                ? BreakTypes.Comfort
                : BreakTypes.Normalize(session.BreakType);
            session.BreakType = type;
            session.InTime = closeAt.Value;
            session.DurationSeconds = TimeDisplay.ElapsedSeconds(session.OutTime, closeAt.Value);
            session.ClosedByUserId = null;
            session.IsAutoClosed = true;
            closedSessions.Add(session);
            closedEmployeeIds.Add(session.EmployeeId);
        }

        if (closedSessions.Count == 0)
            return [];

        await _db.SaveChangesAsync(cancellationToken);

        foreach (var session in closedSessions)
        {
            var employee = session.Employee;
            var type = session.BreakType;
            await _audit.LogAsync(null, "BreakAutoClose", "BreakSession", session.Id.ToString(),
                $"Employee: {employee.FullName} ({employee.EmployeeCode}). {type} out: {TimeDisplay.FormatLocalDateClock(session.OutTime)}. In (shift end): {TimeDisplay.FormatLocalDateClock(session.InTime!.Value)}. Duration {TimeDisplay.FormatSeconds(session.DurationSeconds ?? 0)}. Forgotten open break closed at shift end.");
        }

        _logger.LogInformation("Auto-closed {Count} forgotten break session(s) at shift end.", closedSessions.Count);
        await _liveUpdates.NotifyAsync("breaks", cancellationToken);
        return closedEmployeeIds.Distinct().ToList();
    }
}
