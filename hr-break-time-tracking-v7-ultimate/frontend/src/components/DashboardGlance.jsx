function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${n % 1 === 0 ? n : n.toFixed(1)}%`;
}

function formatChange(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  const abs = Math.abs(n);
  return {
    value: n,
    label: `${n > 0 ? '+' : n < 0 ? '−' : ''}${abs % 1 === 0 ? abs : abs.toFixed(1)}%`,
  };
}

function Change({ value, invert }) {
  const parsed = formatChange(value);
  if (!parsed) return null;
  const up = parsed.value > 0;
  const down = parsed.value < 0;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  const tone = good ? 'up' : bad ? 'down' : 'flat';
  return <span className={`glance-card__change is-${tone}`}>{parsed.label}</span>;
}

function GlanceCard({ label, value, change, invert, tone }) {
  return (
    <article className="glance-card">
      <span className="glance-card__label">{label}</span>
      <div className="glance-card__row">
        <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
        <Change value={change} invert={invert} />
      </div>
    </article>
  );
}

function latestNote(data) {
  const breaches = Number(data.limitBreachesToday || 0);
  const onBreak = Number(data.onBreakNow || 0);
  if (breaches > 0) {
    return {
      title: 'Needs attention',
      body: `${breaches} ${breaches === 1 ? 'person is' : 'people are'} over a break limit this shift. Open live tracking to review them.`,
      status: 'alert',
    };
  }
  if (onBreak > 0) {
    return {
      title: 'Floor is active',
      body: `${onBreak} ${onBreak === 1 ? 'person is' : 'people are'} on break right now. Everyone else is still within today’s limits.`,
      status: 'info',
    };
  }
  return {
    title: 'All clear',
    body: 'Nobody is on break, and no one has gone past a meal or comfort limit this shift.',
    status: 'ok',
  };
}

function efficiencyTone(tone) {
  if (tone === 'alert') return 'bad';
  if (tone === 'watch') return 'watch';
  if (tone === 'good') return 'good';
  return undefined;
}

function EfficiencyGlanceCard({ data }) {
  if (!data) return null;
  const live = Boolean(data.hasLiveShift);
  const tone = live ? efficiencyTone(data.tone) : undefined;
  return (
    <article className={`glance-card glance-card--efficiency ${live ? `is-${data.tone || 'good'}` : 'is-idle'}`}>
      <span className="glance-card__label">Workforce efficiency</span>
      <div className="glance-card__row">
        <strong className={tone ? `is-${tone}` : undefined}>
          {live ? formatPercent(data.efficiencyPercent) : '—'}
        </strong>
        {live && <Change value={data.changePercent} />}
      </div>
      <div className="glance-card__meta">
        <span>{live ? (data.highlightedShiftLabel || 'Live shifts') : 'No live shift'}</span>
        {live && <span className="glance-live-badge">Tracking now</span>}
      </div>
      {data.comment && <p className="glance-card__comment">{data.comment}</p>}
    </article>
  );
}

export default function DashboardGlance({ data }) {
  const note = latestNote(data);

  return (
    <aside className="glance-rail" aria-label="At a glance">
      <header className="section-title-box section-title-box--compact">
        <div>
          <h2>At a glance</h2>
          <p>Last 30 days</p>
        </div>
      </header>

      <GlanceCard
        label="On break now"
        value={formatNumber(data.onBreakNow)}
      />
      <GlanceCard
        label="Breaks today"
        value={formatNumber(data.breaksToday)}
        change={data.breaksChangePercent}
      />
      <GlanceCard
        label="Within-limit rate"
        value={formatPercent(data.compliancePercent)}
        change={data.complianceChangePercent}
        tone={Number(data.compliancePercent) >= 90 ? 'good' : undefined}
      />
      <EfficiencyGlanceCard data={data.workforceEfficiency} />
      <GlanceCard
        label="Limit breaches"
        value={formatNumber(data.limitBreachesToday)}
        change={data.limitBreachesChangePercent}
        invert
        tone={Number(data.limitBreachesToday) > 0 ? 'bad' : 'good'}
      />
      <GlanceCard
        label="Active employees"
        value={formatNumber(data.activeEmployees)}
      />

      <article className={`glance-card glance-card--note is-${note.status}`}>
        <span className="glance-card__label">{note.title}</span>
        <p>{note.body}</p>
      </article>
    </aside>
  );
}
