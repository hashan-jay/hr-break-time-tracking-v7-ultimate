using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace HRTimeTracking.Api.Hubs;

/// <summary>
/// Push channel for live UI refresh. Clients keep using existing REST endpoints
/// for filtered data; this hub only signals that something changed.
/// </summary>
[AllowAnonymous]
public sealed class LiveUpdatesHub : Hub
{
    public const string Path = "/hubs/live";
    public const string EventName = "liveUpdated";
}
