namespace HRTimeTracking.Api.Services;

/// <summary>
/// Periodically closes forgotten open breaks at each employee's shift end
/// so live timers and reports cannot run past that boundary.
/// </summary>
public sealed class BreakAutoCloseHostedService : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BreakAutoCloseHostedService> _logger;

    public BreakAutoCloseHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<BreakAutoCloseHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var closer = scope.ServiceProvider.GetRequiredService<IBreakAutoCloseService>();
                await closer.CloseExpiredAsync(cancellationToken: stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to auto-close forgotten breaks at shift end.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
