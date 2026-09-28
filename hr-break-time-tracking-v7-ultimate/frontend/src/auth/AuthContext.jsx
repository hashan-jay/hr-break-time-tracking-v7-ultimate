import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'tracking', label: 'Live Tracking' },
  { key: 'employees', label: 'Employees' },
  { key: 'departments', label: 'Departments' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'user-passcodes', label: 'User Passcodes' },
];

export const RBAC_CATEGORIES = [
  { value: 'Developer', label: 'Developer' },
  { value: 'SystemAdministration', label: 'System Administration' },
  { value: 'HRManager', label: 'HR Manager' },
  { value: 'HRAssistant', label: 'HR Assistant' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('hr_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('hr_token'));
  const [loading, setLoading] = useState(() => !!localStorage.getItem('hr_token'));

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        if (!cancelled) {
          setUser(data);
          localStorage.setItem('hr_user', JSON.stringify(data));
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setToken(null);
          localStorage.removeItem('hr_token');
          localStorage.removeItem('hr_user');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = async (userName, password) => {
    const { data } = await api.post('/auth/login', { userName, password });
    localStorage.setItem('hr_token', data.token);
    localStorage.setItem('hr_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('hr_token');
    localStorage.removeItem('hr_user');
    setToken(null);
    setUser(null);
  };

  const roles = user?.roles || [];
  const permissions = user?.permissions || [];
  const isDeveloper = roles.includes('Developer');

  const can = (section) => {
    if (section === 'users') return isDeveloper;
    if (isDeveloper) return true;
    return permissions.includes(section);
  };

  const firstAllowedPath = () => {
    const order = [
      ['dashboard', '/app'],
      ['tracking', '/app/tracking'],
      ['employees', '/app/employees'],
      ['departments', '/app/departments'],
      ['shifts', '/app/shifts'],
      ['reports', '/app/reports'],
      ['settings', '/app/settings'],
      ['audit', '/app/audit'],
      ['user-passcodes', '/app/user-passcodes'],
      ['users', '/app/users'],
    ];
    const hit = order.find(([key]) => can(key));
    return hit ? hit[1] : '/';
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      roles,
      permissions,
      can,
      firstAllowedPath,
      isAuthenticated: !!token && !!user,
      isDeveloper,
      isSystemAdministration: roles.includes('SystemAdministration'),
      isHRManager: roles.includes('HRManager'),
      isHRAssistant: roles.includes('HRAssistant'),
      canManageMasterData: can('employees') || can('departments') || can('shifts'),
      canTrackBreaks: can('tracking'),
      canDeactivateEmployees: isDeveloper || roles.includes('HRManager') || roles.includes('SystemAdministration'),
      canPurgeEmployees: isDeveloper,
    }),
    [user, token, loading, roles, permissions, isDeveloper],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
