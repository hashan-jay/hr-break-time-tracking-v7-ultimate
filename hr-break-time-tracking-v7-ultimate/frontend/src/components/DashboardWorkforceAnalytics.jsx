import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../theme/ThemeContext';
import SectionTitle from './SectionTitle';

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${n % 1 === 0 ? n : n.toFixed(1)}%`;
}

function formatTrendDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toneClass(tone) {
  if (tone === 'alert') return 'is-alert';
  if (tone === 'watch') return 'is-watch';
  return 'is-good';
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="headlines-tooltip">
      <strong>{formatTrendDate(point.date)}</strong>
      <p>{formatPercent(point.efficiencyPercent)} workforce efficiency · {point.isFinal ? 'recorded' : 'in progress'}</p>
      <span>
        {formatNumber(point.employeeCount)} people · {formatNumber(point.usedBreakPeopleMinutes)} / {formatNumber(point.shiftPeopleMinutes)} people-min
      </span>
      {point.movingAverage7 != null && (
        <span>7-day average {formatPercent(point.movingAverage7)}</span>
      )}
      {point.trendLine != null && (
        <span>Regression {formatPercent(point.trendLine)}</span>
      )}
    </div>
  );
}

export default function DashboardWorkforceAnalytics({ data }) {
  const { isDark } = useTheme();
  const snapshot = data?.workforceEfficiency;
  const daily = useMemo(() => snapshot?.daily || [], [snapshot?.daily]);
  const shifts = snapshot?.shifts || [];
  const regression = snapshot?.regression;
  const line = isDark ? '#4ade80' : '#15803d';
  const average = isDark ? '#38bdf8' : '#0284c7';
  const trend = isDark ? '#c084fc' : '#7c3aed';
  const yMin = useMemo(() => {
    const values = daily.flatMap((day) => [day.efficiencyPercent, day.movingAverage7, day.trendLine])
      .filter((value) => value != null)
      .map(Number);
    if (values.length === 0) return 70;
    return Math.max(0, Math.min(70, Math.floor(Math.min(...values) / 5) * 5 - 5));
  }, [daily]);

  if (!snapshot) return null;

  return (
    <section className="workforce-analytics" aria-label="Workforce efficiency analytics">
      <SectionTitle
        compact
        tone="lime"
        title="Workforce efficiency."
        description="The live figure uses only shifts that are clocking now. All shifts for a date are recorded when that day’s last shift ends."
      />

      <div className="headlines-card portal-widget-3d dash-panel--lime workforce-analytics__panel">
        <div className="headlines-metrics headlines-metrics--5">
          <article className="headlines-metric">
            <span className="headlines-metric__label">Live shifts</span>
            <div className="headlines-metric__row">
              <strong className={snapshot.hasLiveShift ? toneClass(snapshot.tone) : undefined}>
                {snapshot.hasLiveShift ? formatPercent(snapshot.efficiencyPercent) : '—'}
              </strong>
            </div>
            <p className="headlines-metric__note">{snapshot.hasLiveShift ? (snapshot.highlightedShiftLabel || 'Live shifts') : 'No live shift'}</p>
          </article>
          <article className="headlines-metric">
            <span className="headlines-metric__label">Today (all shifts)</span>
            <div className="headlines-metric__row">
              <strong>{formatPercent(snapshot.dayEfficiencyPercent)}</strong>
            </div>
            <p className="headlines-metric__note">
              {snapshot.dayIsFinal ? 'Recorded for the day.' : 'In progress until the last shift ends.'}
            </p>
          </article>
          <article className="headlines-metric">
            <span className="headlines-metric__label">Break allowance</span>
            <div className="headlines-metric__row">
              <strong>{snapshot.breakAllowanceMinutes} min</strong>
            </div>
            <p className="headlines-metric__note">Given break time inside every shift.</p>
          </article>
          <article className="headlines-metric">
            <span className="headlines-metric__label">7-day average</span>
            <div className="headlines-metric__row">
              <strong>{formatPercent(daily[daily.length - 1]?.movingAverage7)}</strong>
            </div>
            <p className="headlines-metric__note">Rolling mean of daily efficiency.</p>
          </article>
          <article className="headlines-metric">
            <span className="headlines-metric__label">Regression trend</span>
            <div className="headlines-metric__row">
              <strong>{regression?.trendLabel || '—'}</strong>
            </div>
            <p className="headlines-metric__note">
              {regression
                ? `Slope ${regression.slopePerDay > 0 ? '+' : ''}${regression.slopePerDay} / day · R² ${regression.rSquared}`
                : 'Need more daily points.'}
            </p>
          </article>
        </div>

        {regression?.insight && (
          <p className={`workforce-analytics__insight is-${snapshot.tone || 'good'}`}>{regression.insight}</p>
        )}

        <div className="workforce-analytics__chart" aria-hidden={daily.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="workforceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={line} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'} />
              <XAxis
                dataKey="date"
                tickFormatter={formatTrendDate}
                tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                domain={[yMin, 100]}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="efficiencyPercent"
                stroke={line}
                strokeWidth={2}
                fill="url(#workforceFill)"
                dot={false}
                isAnimationActive={false}
                name="Efficiency"
              />
              <Line
                type="monotone"
                dataKey="movingAverage7"
                stroke={average}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="7-day average"
              />
              <Line
                type="monotone"
                dataKey="trendLine"
                stroke={trend}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                name="Regression"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {shifts.length > 0 && (
        <div className="workforce-shift-grid">
          {shifts.map((shift) => (
            <article
              key={shift.shiftId}
              className={`workforce-shift-card ${toneClass(shift.tone)}${shift.isLive ? ' is-live' : ''}`}
            >
              <header>
                <div>
                  <h3>{shift.shiftName}</h3>
                  <p>{shift.shiftLabel}</p>
                </div>
                {shift.isLive && <span className="glance-live-badge">Tracking now</span>}
              </header>
              <strong className={toneClass(shift.tone)}>{formatPercent(shift.efficiencyPercent)}</strong>
              <dl>
                <div>
                  <dt>People</dt>
                  <dd>{formatNumber(shift.employeeCount)}</dd>
                </div>
                <div>
                  <dt>Shift</dt>
                  <dd>{formatNumber(shift.shiftMinutes)} min</dd>
                </div>
                <div>
                  <dt>Work</dt>
                  <dd>{formatNumber(shift.workMinutes)} min</dd>
                </div>
                <div>
                  <dt>Break used</dt>
                  <dd>{formatNumber(shift.usedBreakPeopleMinutes)} / {formatNumber(shift.shiftPeopleMinutes)}</dd>
                </div>
              </dl>
              <p>{shift.comment}</p>
            </article>
          ))}
        </div>
      )}

      <div className="headlines-card portal-widget-3d workforce-day-card">
        <div className="workforce-day-card__head">
          <h3>Day-by-day people-minutes</h3>
          <p>Each row is the all-shifts total for that date. A day is recorded when its last shift has ended. Live shifts are shown on the glance card instead.</p>
        </div>
        <div className="workforce-day-table-wrap">
          <table className="workforce-day-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>People</th>
                <th>Shift people-min</th>
                <th>Break people-min</th>
                <th>Break share</th>
                <th>Efficiency</th>
                <th>7-day avg</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((day) => (
                <tr key={day.date}>
                  <td>{formatTrendDate(day.date)}</td>
                  <td>{formatNumber(day.employeeCount)}</td>
                  <td>{formatNumber(day.shiftPeopleMinutes)}</td>
                  <td>{formatNumber(day.usedBreakPeopleMinutes)}</td>
                  <td>{formatPercent(day.breakSharePercent)}</td>
                  <td>{formatPercent(day.efficiencyPercent)}</td>
                  <td>{formatPercent(day.movingAverage7)}</td>
                  <td>{day.isFinal ? 'Recorded' : 'In progress'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
