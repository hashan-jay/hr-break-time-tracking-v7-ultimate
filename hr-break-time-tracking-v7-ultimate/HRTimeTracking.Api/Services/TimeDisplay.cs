using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace HRTimeTracking.Api.Services;

/// <summary>
/// Break timing utilities. All operational times use the PC's local clock,
/// and durations are measured in whole seconds.
/// </summary>
public static class TimeDisplay
{
    public const string LocalDateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss";

    public static DateTime NowLocal() => DateTime.SpecifyKind(DateTime.Now, DateTimeKind.Local);

    public static DateOnly TodayLocal() => DateOnly.FromDateTime(NowLocal());

    /// <summary>
    /// Treat Unspecified values from SQL as local wall-clock times.
    /// Convert UTC values to local. Never leave Kind ambiguous for calculations.
    /// </summary>
    public static DateTime AsLocal(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value.ToLocalTime(),
        DateTimeKind.Local => value,
        _ => DateTime.SpecifyKind(value, DateTimeKind.Local)
    };

    public static DateTime? AsLocal(DateTime? value) => value.HasValue ? AsLocal(value.Value) : null;

    /// <summary>
    /// Audit / Identity timestamps are written with <see cref="DateTime.UtcNow"/>.
    /// SQL Server returns them as Unspecified, so convert explicitly UTC → local.
    /// </summary>
    public static DateTime FromStoredUtc(DateTime value)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
        return DateTime.SpecifyKind(utc.ToLocalTime(), DateTimeKind.Local);
    }

    /// <summary>
    /// Exact whole seconds between two local timestamps (floor of elapsed ticks).
    /// Includes every completed second in the total.
    /// </summary>
    public static int ElapsedSeconds(DateTime from, DateTime? to = null)
    {
        var start = AsLocal(from);
        var end = AsLocal(to ?? NowLocal());
        var ticks = end.Ticks - start.Ticks;
        if (ticks <= 0) return 0;
        return (int)(ticks / TimeSpan.TicksPerSecond);
    }

    /// <summary>
    /// Break total in seconds for one Meal or Comfort type in a shift window:
    ///   closed = Σ (InTime − OutTime)
    ///   open   = (Now − OutTime) when a session has no InTime
    ///   total  = closed + open
    /// Out/in timestamps in the database are the source of truth.
    /// </summary>
    public static int ComputeShiftTotalSeconds(IEnumerable<Models.BreakSession> sessions, DateTime? now = null)
        => ComputeDailyTotalSeconds(sessions, now);

    /// <inheritdoc cref="ComputeShiftTotalSeconds"/>
    public static int ComputeDailyTotalSeconds(IEnumerable<Models.BreakSession> sessions, DateTime? now = null)
    {
        var reference = AsLocal(now ?? NowLocal());
        var total = 0;
        foreach (var session in sessions)
        {
            var outTime = AsLocal(session.OutTime);
            if (session.InTime.HasValue)
            {
                // Source of truth is out/in timestamps (second-accurate).
                total += ElapsedSeconds(outTime, AsLocal(session.InTime.Value));
            }
            else
            {
                total += ElapsedSeconds(outTime, reference);
            }
        }

        return total;
    }

    public static string FormatSeconds(int totalSeconds)
    {
        if (totalSeconds < 0) totalSeconds = 0;
        var ts = TimeSpan.FromSeconds(totalSeconds);
        return $"{(int)ts.TotalHours:D2}:{ts.Minutes:D2}:{ts.Seconds:D2}";
    }

    public static string FormatLocalDateTime(DateTime value)
        => AsLocal(value).ToString(LocalDateTimeFormat, CultureInfo.InvariantCulture);

    public static string FormatLocalClock(DateTime value)
        => AsLocal(value).ToString("HH:mm:ss", CultureInfo.InvariantCulture);

    public static string FormatLocalDateClock(DateTime value)
        => AsLocal(value).ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
}

public sealed class LocalDateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Expected string DateTime.");

        var text = reader.GetString();
        if (string.IsNullOrWhiteSpace(text))
            throw new JsonException("Empty DateTime.");

        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            return TimeDisplay.AsLocal(parsed);

        throw new JsonException($"Invalid DateTime: {text}");
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(TimeDisplay.FormatLocalDateTime(value));
}

public sealed class NullableLocalDateTimeJsonConverter : JsonConverter<DateTime?>
{
    private static readonly LocalDateTimeJsonConverter Inner = new();

    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        return Inner.Read(ref reader, typeof(DateTime), options);
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (!value.HasValue)
        {
            writer.WriteNullValue();
            return;
        }

        Inner.Write(writer, value.Value, options);
    }
}
