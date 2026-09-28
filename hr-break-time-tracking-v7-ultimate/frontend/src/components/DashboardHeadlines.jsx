import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useTheme } from '../theme/ThemeContext';
import SectionTitle from './SectionTitle';

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

function formatTrendDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function HeadlinesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="headlines-tooltip">
      <strong>{formatTrendDate(point.date)}</strong>
      <p>{formatNumber(point.breaks)} breaks</p>
      <span>{formatNumber(point.mealBreaks)} meal · {formatNumber(point.comfortBreaks)} comfort</span>
    </div>
  );
}

export default function DashboardHeadlines({ data }) {
  const { isDark } = useTheme();
  const trend = useMemo(
    () => (data?.trend || []).map((point) => ({
      ...point,
      date: point.date,
    })),
    [data?.trend],
  );
  const line = isDark ? '#e879f9' : '#7c3aed';
  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long' });

  return (
    <section aria-label="Break headlines">
      <SectionTitle
        compact
        tone="violet"
        title="This period."
        description={`Break volume across the last 30 days — ${monthLabel} meal and comfort activity.`}
      />
      <div className="headlines-card portal-widget-3d dash-panel--violet">
      <div className="headlines-chart" aria-hidden={trend.length === 0}>
        <ResponsiveContainer width="100%" height={128}>
          <AreaChart data={trend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="headlinesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={line} stopOpacity={0.2} />
                <stop offset="100%" stopColor={line} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <Tooltip
              cursor={{ stroke: line, strokeOpacity: 0.25 }}
              content={<HeadlinesTooltip />}
            />
            <Area
              type="monotone"
              dataKey="breaks"
              stroke={line}
              strokeWidth={2}
              fill="url(#headlinesFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      </div>
    </section>
  );
}
