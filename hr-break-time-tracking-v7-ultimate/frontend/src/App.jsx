import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AppLayout from './components/AppLayout';
import PortalPage from './pages/PortalPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TrackingPage from './pages/TrackingPage';
import EmployeesPage from './pages/EmployeesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import ReportsPage from './pages/ReportsPage';
import ShiftsPage from './pages/ShiftsPage';
import UsersPage from './pages/UsersPage';
import UserPasscodesPage from './pages/UserPasscodesPage';
import SettingsPage from './pages/SettingsPage';
import AuditPage from './pages/AuditPage';
import { LoadingBlock } from './components/UiBits';
import { FeedbackProvider } from './feedback/FeedbackContext';
import { ThemeProvider } from './theme/ThemeContext';
import './App.css';

function ProtectedRoute({ allow, allowSections }) {
  const { isAuthenticated, loading, roles, can, firstAllowedPath } = useAuth();
  if (loading) return <LoadingBlock label="Checking session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allow && !allow.some((role) => roles.includes(role))) {
    return <Navigate to={firstAllowedPath()} replace />;
  }
  if (allowSections && !allowSections.some((section) => can(section))) {
    return <Navigate to={firstAllowedPath()} replace />;
  }
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PortalPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route element={<ProtectedRoute allowSections={['dashboard']} />}>
            <Route index element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['tracking']} />}>
            <Route path="tracking" element={<TrackingPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['reports']} />}>
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['employees']} />}>
            <Route path="employees" element={<EmployeesPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['departments']} />}>
            <Route path="departments" element={<DepartmentsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['shifts']} />}>
            <Route path="shifts" element={<ShiftsPage />} />
          </Route>
          <Route element={<ProtectedRoute allow={['Developer']} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['user-passcodes']} />}>
            <Route path="user-passcodes" element={<UserPasscodesPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['settings']} />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowSections={['audit']} />}>
            <Route path="audit" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}
