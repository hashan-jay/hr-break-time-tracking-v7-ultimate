import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client';
import { useLiveUpdates } from '../api/liveUpdates';
import { useAuth } from '../auth/AuthContext';
import { LoadingBlock } from '../components/UiBits';
import DashboardGlance from '../components/DashboardGlance';
import DashboardHeadlines from '../components/DashboardHeadlines';
import DashboardInsightPanels from '../components/DashboardInsightPanels';
import DashboardWorkforceAnalytics from '../components/DashboardWorkforceAnalytics';
import SectionTitle from '../components/SectionTitle';
import { useFeedback } from '../feedback/FeedbackContext';
import { roleGreeting } from '../lib/roles';

function QuickLink({ title, description, to, cta, tone }) {
  return (
    <Link to={to} className={`portal-quick portal-quick--${tone} portal-widget-3d`}>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="portal-quick__cta">{cta}</span>
    </Link>
  );
}

function welcomeCopy(auth) {
  if (auth.isDeveloper) {
    return {
      eyebrow: 'Dashboard',
      title: 'Developer overview',
      subtitle: 'Monitor break compliance, manage master data, and review system settings.',
    };
  }
  if (auth.isSystemAdministration) {
    return {
      eyebrow: 'Dashboard',
      title: 'System Administration overview',
      subtitle: 'Review system sections, deactivate or activate employees, and keep existing records intact.',
    };
  }
  if (auth.isHRManager) {
    return {
      eyebrow: 'Dashboard',
      title: 'HR Manager overview',
      subtitle: 'Track live breaks, manage employees and departments, and generate compliance reports.',
    };
  }
  return {
    eyebrow: 'Dashboard',
    title: 'HR Assistant overview',
    subtitle: 'Follow live break activity and produce daily compliance reports for the team.',
  };
}

export default function DashboardPage() {
  const auth = useAuth();
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const copy = useMemo(
    () => welcomeCopy(auth),
    [auth.isDeveloper, auth.isSystemAdministration, auth.isHRManager, auth.isHRAssistant],
  );

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastError = '';
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const dashRes = await api.get('/reports/dashboard');
        if (cancelled) return;
        setData(dashRes.data);
        lastError = '';
      } catch (err) {
        if (cancelled) return;
        const msg = apiErrorMessage(err, 'Failed to load dashboard.');
        if (lastError !== msg) {
          lastError = msg;
          toast.error(msg);
        }
      } finally {
        inFlight = false;
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [toast]);

  useLiveUpdates(() => {
    api.get('/reports/dashboard')
      .then((dashRes) => setData(dashRes.data))
      .catch(() => {});
  });

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  if (!data) return <LoadingBlock label="Loading dashboard…" />;

  const greeting = roleGreeting(auth.user?.roles, now);

  return (
    <div className="page portal-dashboard">
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <header className="dashboard-title-box">
            <div>
              <p className="portal-eyebrow">{copy.eyebrow}</p>
              <h1>{greeting}</h1>
              <p>{copy.subtitle}</p>
            </div>
            {auth.canTrackBreaks && (
              <Link className="btn btn-soft-green" to="/app/tracking">
                Open live tracking
              </Link>
            )}
          </header>

          <DashboardHeadlines data={data} />
          <DashboardInsightPanels data={data} />
          <DashboardWorkforceAnalytics data={data} />

          <section className="portal-quick-section">
            <SectionTitle
              compact
              tone="rose"
              title="Quick actions"
              description="Jump into the workflows you use most for today’s break tracking."
            />
            <div className="portal-quick-grid">
              {auth.can('tracking') && (
                <QuickLink
                  title="Live Tracking"
                  description="Watch who is out on break and toggle sessions in real time."
                  to="/app/tracking"
                  cta="Open tracking"
                  tone="amber"
                />
              )}
              {auth.can('employees') && (
                <QuickLink
                  title="Employees"
                  description="Maintain employee codes, departments, and active status."
                  to="/app/employees"
                  cta="Manage employees"
                  tone="sky"
                />
              )}
              {auth.can('departments') && (
                <QuickLink
                  title="Departments"
                  description="Organize teams and keep department master data current."
                  to="/app/departments"
                  cta="Manage departments"
                  tone="violet"
                />
              )}
              {auth.can('shifts') && (
                <QuickLink
                  title="Shifts"
                  description="Create and edit work shifts for employee assignment and reports."
                  to="/app/shifts"
                  cta="Manage shifts"
                  tone="sky"
                />
              )}
              {auth.can('reports') && (
                <QuickLink
                  title="Reports"
                  description="Generate A4 print-ready compliance reports and export CSV."
                  to="/app/reports"
                  cta="Open reports"
                  tone="emerald"
                />
              )}
              {auth.can('users') && (
                <QuickLink
                  title="Users & settings"
                  description="Control staff accounts, daily limits, and audit history."
                  to="/app/users"
                  cta="Open admin"
                  tone="slate"
                />
              )}
            </div>
          </section>
        </div>

        <DashboardGlance data={data} />
      </div>
    </div>
  );
}
