using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using StackExchange.Redis;

namespace HRTimeTracking.Api.Services;

public interface IAttendanceAnalyticsCache
{
    /// <summary>redis when the last completed read or write used Redis; otherwise memory.</summary>
    string ProviderName { get; }

    Task<long> GetGenerationAsync(CancellationToken cancellationToken = default);
    Task BumpGenerationAsync(CancellationToken cancellationToken = default);
    Task<(T? Value, string Provider)?> GetAsync<T>(string key, CancellationToken cancellationToken = default);
    Task<string> SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken cancellationToken = default);
}

/// <summary>
/// Shared analytics cache. Redis is used when it is reachable. If it is down,
/// the same keys are served from memory so attendance screens keep working.
/// </summary>
public sealed class AttendanceAnalyticsCache : IAttendanceAnalyticsCache, IDisposable
{
    private const string Prefix = "hrbreak:attendance-analytics:";
    private const string GenerationKey = Prefix + "generation";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters =
        {
            new LocalDateTimeJsonConverter(),
            new NullableLocalDateTimeJsonConverter(),
        },
    };

    private readonly IMemoryCache _memory;
    private readonly ILogger<AttendanceAnalyticsCache> _logger;
    private readonly bool _enabled;
    private readonly ConfigurationOptions? _options;
    private readonly SemaphoreSlim _connectGate = new(1, 1);
    private IConnectionMultiplexer? _redis;
    private long _generation = 1;
    private int _redisFailures;
    private string _provider = "memory";

    public AttendanceAnalyticsCache(
        IConfiguration configuration,
        IMemoryCache memory,
        ILogger<AttendanceAnalyticsCache> logger)
    {
        _memory = memory;
        _logger = logger;
        _enabled = configuration.GetValue("Redis:Enabled", true);
        var connection = configuration["Redis:Configuration"];
        if (_enabled && !string.IsNullOrWhiteSpace(connection))
        {
            _options = ConfigurationOptions.Parse(connection);
            _options.AbortOnConnectFail = false;
            if (_options.ConnectRetry < 1)
                _options.ConnectRetry = 1;
            if (_options.ConnectTimeout <= 0 || _options.ConnectTimeout > 2000)
                _options.ConnectTimeout = 800;
            if (_options.SyncTimeout <= 0 || _options.SyncTimeout > 2000)
                _options.SyncTimeout = 800;
            if (_options.AsyncTimeout <= 0 || _options.AsyncTimeout > 2000)
                _options.AsyncTimeout = 800;
        }
        else
        {
            _enabled = false;
        }
    }

    public string ProviderName => _provider;

    public async Task<long> GetGenerationAsync(CancellationToken cancellationToken = default)
    {
        var local = Volatile.Read(ref _generation);
        var redis = await TryRedisAsync(cancellationToken);
        if (redis is null) return local;

        try
        {
            var raw = await redis.GetDatabase().StringGetAsync(GenerationKey);
            if (raw.HasValue && long.TryParse(raw.ToString(), out var remote))
            {
                if (remote > local)
                {
                    Interlocked.Exchange(ref _generation, remote);
                    return remote;
                }

                if (remote < local)
                    await redis.GetDatabase().StringSetAsync(GenerationKey, local.ToString());

                return Math.Max(local, remote);
            }

            await redis.GetDatabase().StringSetAsync(GenerationKey, local.ToString(), when: When.NotExists);
            return local;
        }
        catch (Exception ex)
        {
            LogRedisFailure(ex, "generation read");
            return local;
        }
    }

    public async Task BumpGenerationAsync(CancellationToken cancellationToken = default)
    {
        var next = Interlocked.Increment(ref _generation);
        var redis = await TryRedisAsync(cancellationToken);
        if (redis is null) return;

        try
        {
            await redis.GetDatabase().StringSetAsync(GenerationKey, next.ToString());
        }
        catch (Exception ex)
        {
            LogRedisFailure(ex, "generation bump");
        }
    }

    public async Task<(T? Value, string Provider)?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        var redis = await TryRedisAsync(cancellationToken);
        if (redis is not null)
        {
            try
            {
                var raw = await redis.GetDatabase().StringGetAsync(Prefix + key);
                if (raw.HasValue)
                {
                    var fromRedis = JsonSerializer.Deserialize<T>(raw.ToString(), JsonOptions);
                    _provider = "redis";
                    return (fromRedis, "redis");
                }
            }
            catch (Exception ex)
            {
                LogRedisFailure(ex, "read");
            }
        }

        if (_memory.TryGetValue(key, out T? cached))
        {
            _provider = "memory";
            return (cached, "memory");
        }

        return null;
    }

    public async Task<string> SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        _memory.Set(key, value, ttl);
        var provider = "memory";
        var redis = await TryRedisAsync(cancellationToken);
        if (redis is not null)
        {
            try
            {
                var payload = JsonSerializer.Serialize(value, JsonOptions);
                await redis.GetDatabase().StringSetAsync(Prefix + key, payload, ttl);
                provider = "redis";
            }
            catch (Exception ex)
            {
                LogRedisFailure(ex, "write");
            }
        }

        _provider = provider;
        return provider;
    }

    public void Dispose()
    {
        _connectGate.Dispose();
        _redis?.Dispose();
    }

    private async Task<IConnectionMultiplexer?> TryRedisAsync(CancellationToken cancellationToken)
    {
        if (!_enabled || _options is null) return null;
        if (_redis is { IsConnected: true }) return _redis;
        if (_redis is not null) return null;

        await _connectGate.WaitAsync(cancellationToken);
        try
        {
            if (_redis is { IsConnected: true }) return _redis;
            if (_redis is not null) return null;

            _redis = await ConnectionMultiplexer.ConnectAsync(_options);
            if (_redis.IsConnected)
            {
                _logger.LogInformation("Attendance analytics cache connected to Redis.");
                return _redis;
            }

            _logger.LogWarning("Redis is not reachable. Attendance analytics will use the in-memory cache.");
            return null;
        }
        catch (Exception ex)
        {
            LogRedisFailure(ex, "connect");
            return _redis is { IsConnected: true } ? _redis : null;
        }
        finally
        {
            _connectGate.Release();
        }
    }

    private void LogRedisFailure(Exception ex, string action)
    {
        if (Interlocked.Increment(ref _redisFailures) <= 3)
            _logger.LogWarning(ex, "Redis {Action} failed. Attendance analytics is using the in-memory cache.", action);
    }
}
