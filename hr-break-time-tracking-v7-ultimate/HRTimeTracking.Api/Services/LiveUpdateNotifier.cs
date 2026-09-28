using HRTimeTracking.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace HRTimeTracking.Api.Services;

public interface ILiveUpdateNotifier
{
    Task NotifyAsync(string reason, CancellationToken cancellationToken = default);
}

/// <summary>
/// Broadcasts a lightweight refresh ping. Failures are swallowed so SignalR
/// can never block break capture or other existing writes.
/// </summary>
public sealed class LiveUpdateNotifier : ILiveUpdateNotifier
{
    private readonly IHubContext<LiveUpdatesHub> _hub;
    private readonly ILogger<LiveUpdateNotifier> _logger;

    public LiveUpdateNotifier(IHubContext<LiveUpdatesHub> hub, ILogger<LiveUpdateNotifier> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public async Task NotifyAsync(string reason, CancellationToken cancellationToken = default)
    {
        try
        {
            await _hub.Clients.All.SendAsync(
                LiveUpdatesHub.EventName,
                new { reason },
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Live update broadcast failed for {Reason}.", reason);
        }
    }
}
