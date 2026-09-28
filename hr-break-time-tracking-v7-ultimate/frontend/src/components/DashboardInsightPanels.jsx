import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
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

function rate(within, exceeded) {
  const scored = Number(within || 0) + Number(exceeded || 0);
  if (scored <= 0) return 100;
  return Math.round((Number(within || 0) * 1000) / scored) / 10;
}

function occupancy(onBreak, active) {
  const total = Number(active || 0);
  if (total <= 0) return 0;
  return Math.round((Number(onBreak || 0) * 1000) / total) / 10;
}

function InsightTooltip({ active, payload, labelKey, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="headlines-tooltip">
      <strong>{formatTrendDate(point.date)}</strong>
      <p>{formatNumber(point[labelKey])} {unit}</p>
    </div>
  );
}

function MiniSpark({ data, dataKey, color, unit }) {
  return (
    <div className="insight-chart">
      <ResponsiveContainer width="100%" height={96}>
        <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`insightFill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <Tooltip
            cursor={{ stroke: color, strokeOpacity: 0.25 }}
            content={<InsightTooltip labelKey={dataKey} unit={unit} />}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#insightFill-${dataKey})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({ label, value, note, tone, accent }) {
  return (
    <article className={`headlines-metric${accent ? ` dash-metric--${accent}` : ''}`}>
      <span className="headlines-metric__label">{label}</span>
      <div className="headlines-metric__row">
        <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
      </div>
      {note && <p className="headlines-metric__note">{note}</p>}
    </article>
  );
}

export default function DashboardInsightPanels({ data }) {
  const { isDark } = useTheme();
  const trend = useMemo(() => data?.trend || [], [data?.trend]);
  const mealColor = isDark ? '#fb923c' : '#ea580c';
  const comfortColor = isDark ? '#2dd4bf' : '#0d9488';
  const mealLimit = data.mealLimitMinutes ?? 60;
  const comfortLimit = data.comfortLimitMinutes ?? 20;
  const mealRate = rate(data.mealWellSatisfiedToday, data.mealExceededToday);
  const comfortRate = rate(data.comfortWellSatisfiedToday, data.comfortExceededToday);
  const awayShare = occupancy(data.onBreakNow, data.activeEmployees);
  const workingNow = Math.max(0, Number(data.activeEmployees || 0) - Number(data.onBreakNow || 0));

  return (
    <>
      <section aria-label="Workforce overview">
        <SectionTitle
          compact
          tone="sky"
          title="Workforce snapshot."
          description="Who is on the roster right now, and how many people are away from the floor."
        />
        <div className="headlines-card portal-widget-3d dash-panel--sky">
          <div className="headlines-metrics headlines-metrics--3">
            <Metric
              label="Active employees"
              value={formatNumber(data.activeEmployees)}
              note="On the live roster and visible in tracking."
              accent="indigo"
            />
            <Metric
              label="Departments"
              value={formatNumber(data.activeDepartments)}
              note="Active teams used for assignments and reports."
              accent="violet"
            />
            <Metric
              label="On break now"
              value={formatNumber(data.onBreakNow)}
              note={`${formatNumber(workingNow)} working · ${formatPercent(awayShare)} away`}
              accent="amber"
            />
          </div>
          <div className="insight-occupancy" aria-hidden="true">
            <div className="insight-occupancy__track">
              <span
                className="insight-occupancy__away"
                style={{ width: `${Math.min(awayShare, 100)}%` }}
              />
            </div>
            <p>Green is people in office. Orange-red from the right is people currently on break.</p>
          </div>
        </div>
      </section>

      <div className="break-type-stack">
        <section aria-label="Meal break insights">
          <SectionTitle
            compact
            tone="amber"
            title="Meal breaks."
            description={`Meal limit is ${mealLimit} minutes. Counts cover each employee's current shift.`}
          />
          <div className="headlines-card portal-widget-3d dash-panel--amber">
            <div className="headlines-metrics headlines-metrics--3">
              <Metric
                label="On meal now"
                value={formatNumber(data.mealOnBreakNow)}
                note="People currently away on a meal break."
                accent="amber"
              />
              <Metric
                label="Within limit"
                value={formatNumber(data.mealWellSatisfiedToday)}
                tone={Number(data.mealExceededToday) === 0 ? 'good' : undefined}
                note={`${formatPercent(mealRate)} stayed inside the ${mealLimit}-minute meal limit.`}
                accent="lime"
              />
              <Metric
                label="Over limit"
                value={formatNumber(data.mealExceededToday)}
                tone={Number(data.mealExceededToday) > 0 ? 'bad' : 'good'}
                note="Went past the meal limit this shift."
                accent="rose"
              />
            </div>
            <MiniSpark data={trend} dataKey="mealBreaks" color={mealColor} unit="meal breaks" />
          </div>
        </section>

        <section aria-label="Comfort break insights">
          <SectionTitle
            compact
            tone="teal"
            title="Comfort breaks."
            description={`Comfort limit is ${comfortLimit} minutes. Counts cover each employee's current shift.`}
          />
          <div className="headlines-card portal-widget-3d dash-panel--teal">
            <div className="headlines-metrics headlines-metrics--3">
              <Metric
                label="On comfort now"
                value={formatNumber(data.comfortOnBreakNow)}
                note="People currently away on a comfort break."
                accent="teal"
              />
              <Metric
                label="Within limit"
                value={formatNumber(data.comfortWellSatisfiedToday)}
                tone={Number(data.comfortExceededToday) === 0 ? 'good' : undefined}
                note={`${formatPercent(comfortRate)} stayed inside the ${comfortLimit}-minute comfort limit.`}
                accent="lime"
              />
              <Metric
                label="Over limit"
                value={formatNumber(data.comfortExceededToday)}
                tone={Number(data.comfortExceededToday) > 0 ? 'bad' : 'good'}
                note="Went past the comfort limit this shift."
                accent="rose"
              />
            </div>
            <MiniSpark data={trend} dataKey="comfortBreaks" color={comfortColor} unit="comfort breaks" />
          </div>
        </section>
      </div>
    </>
  );
}
