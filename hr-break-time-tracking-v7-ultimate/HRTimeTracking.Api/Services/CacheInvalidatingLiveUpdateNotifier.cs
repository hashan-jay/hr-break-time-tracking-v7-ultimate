namespace HRTimeTracking.Api.Services;

/// <summary>
/// Drops cached attendance analytics when break, roster, or settings data changes,
/// then forwards the existing live-update broadcast.
/// </summary>
public sealed class CacheInvalidatingLiveUpdateNotifier : ILiveUpdateNotifier
{
    private static readonly HashSet<string> Reasons = new(StringComparer.OrdinalIgnoreCase)
    {
        "breaks",
        "employees",
        "shifts",
        "departments",
        "settings",
    };

    private readonly LiveUpdateNotifier _inner;
    private readonly IAttendanceAnalyticsCache _cache;
    private readonly ILogger<CacheInvalidatingLiveUpdateNotifier> _logger;

    public CacheInvalidatingLiveUpdateNotifier(
        LiveUpdateNotifier inner,
        IAttendanceAnalyticsCache cache,
        ILogger<CacheInvalidatingLiveUpdateNotifier> logger)
    {
        _inner = inner;
        _cache = cache;
        _logger = logger;
    }

    public async Task NotifyAsync(string reason, CancellationToken cancellationToken = default)
    {
        if (Reasons.Contains(reason))
        {
            try
            {
                await _cache.BumpGenerationAsync(cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Attendance analytics cache was not invalidated for {Reason}.", reason);
            }
        }

        await _inner.NotifyAsync(reason, cancellationToken);
    }
}
