import { useEffect, useState } from 'react';
import api from '../api/client';
import { RBAC_CATEGORIES, SECTIONS } from '../auth/AuthContext';
import { useFeedback } from '../feedback/FeedbackContext';

const emptyForm = {
  userName: '',
  fullName: '',
  password: '',
  role: 'HRAssistant',
};

function SectionChecks({ values, onToggle, disabled }) {
  return (
    <div className="perm-checks">
      {SECTIONS.map((section) => (
        <label key={section.key}>
          <input
            type="checkbox"
            checked={values.includes(section.key)}
            disabled={disabled}
            onChange={() => onToggle(section.key)}
          />
          {section.label}
        </label>
      ))}
    </div>
  );
}

function toggleValue(list, key) {
  return list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
}

export default function UsersPage() {
  const { toast, confirm, prompt } = useFeedback();
  const [users, setUsers] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [savingRole, setSavingRole] = useState('');

  const load = async () => {
    const [usersRes, rolesRes] = await Promise.all([
      api.get('/users'),
      api.get('/permissions/roles'),
    ]);
    setUsers(usersRes.data);
    setRoleDefaults(rolesRes.data);
  };

  useEffect(() => {
    load().catch((err) => {
      toast.error(err.response?.data?.message || 'Failed to load users.');
    });
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', form);
      toast.success('User created. Section access follows the assigned RBAC category.');
      setForm(emptyForm);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed.');
    }
  };

  const changeRole = async (user, role) => {
    try {
      await api.put(`/users/${user.id}`, {
        fullName: user.fullName,
        role,
        isActive: user.isActive,
      });
      toast.success('RBAC category updated. Section access now follows that category.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed.');
    }
  };

  const resetPassword = async (id) => {
    const newPassword = await prompt({
      title: 'Reset password',
      message: 'Enter a new password (min 8 characters, mixed case, digit, and symbol).',
      confirmLabel: 'Update password',
      inputType: 'password',
      placeholder: 'New password',
    });
    if (!newPassword) return;
    try {
      await api.post(`/users/${id}/password`, { newPassword });
      toast.success('Password updated.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password change failed.');
    }
  };

  const deactivate = async (id) => {
    const ok = await confirm({
      title: 'Deactivate user',
      message: 'Deactivate this user? They will no longer be able to sign in.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deactivated.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Deactivate failed.');
    }
  };

  const updateRoleLocal = (role, key) => {
    setRoleDefaults((prev) => prev.map((row) => (
      row.role === role && !row.locked
        ? { ...row, sections: toggleValue(row.sections, key) }
        : row
    )));
  };

  const saveRole = async (row) => {
    setSavingRole(row.role);
    try {
      const { data } = await api.put(`/permissions/roles/${encodeURIComponent(row.role)}`, {
        sections: row.sections,
      });
      setRoleDefaults((prev) => prev.map((x) => (x.role === data.role ? data : x)));
      toast.success(`Access saved for ${data.roleLabel}. All accounts in this category use these sections.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save role access.');
    } finally {
      setSavingRole('');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Users &amp; RBAC</h1>
          <p>
            Create accounts and assign an RBAC category. Section access is decided only by that
            category — including User Passcodes for employee break passcode resets. Developer accounts
            always keep full access. Users administration and login password resets stay Developer-only.
          </p>
        </div>
      </header>

      <section className="settings-list perm-panel">
        <h2 className="settings-section-title">Default access by role</h2>
        <p className="hint">
          These defaults apply to every account in that RBAC category. Changing a category updates
          access for all of its users. Tick different sections for each category (for example User
          Passcodes), then save. Login password reset for staff accounts remains Developer-only on this page.
        </p>
        {roleDefaults.map((row) => (
          <div className="perm-role-row" key={row.role}>
            <div>
              <strong>{row.roleLabel}</strong>
              <div className="muted">{row.locked ? 'Full access (cannot be reduced)' : 'Tick the sections this role should receive by default'}</div>
            </div>
            <SectionChecks
              values={row.sections || []}
              disabled={row.locked}
              onToggle={(key) => updateRoleLocal(row.role, key)}
            />
            {!row.locked && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingRole === row.role}
                onClick={() => saveRole(row)}
              >
                {savingRole === row.role ? 'Saving…' : 'Save defaults'}
              </button>
            )}
          </div>
        ))}
      </section>

      <div className="split-forms">
        <form className="card-form" onSubmit={onSubmit}>
          <h2>Create user</h2>
          <label>Username<input required value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} /></label>
          <label>Full name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label>Password<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>
            RBAC category
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {RBAC_CATEGORIES.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="submit">Create</button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>RBAC category</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName}</strong>
                  </td>
                  <td>{u.userName}</td>
                  <td>
                    <select
                      value={u.roles?.[0] || 'HRAssistant'}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      {RBAC_CATEGORIES.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>{u.isActive ? 'Yes' : 'No'}</td>
                  <td className="row-actions">
                    <button type="button" className="btn link-btn" onClick={() => resetPassword(u.id)}>Password</button>
                    {u.isActive && (
                      <button type="button" className="btn link-btn danger" onClick={() => deactivate(u.id)}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
