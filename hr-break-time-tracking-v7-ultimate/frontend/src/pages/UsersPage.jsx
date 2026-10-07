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

function roleLabel(value) {
  return RBAC_CATEGORIES.find((role) => role.value === value)?.label || value || '—';
}

export default function UsersPage() {
  const { toast, confirm, prompt } = useFeedback();
  const [users, setUsers] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState([]);
  const [editor, setEditor] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
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

  useEffect(() => {
    if (!editor) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !savingUser) setEditor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, savingUser]);

  const openCreate = () => setEditor({ mode: 'create', ...emptyForm });

  const openUpdate = (user) => setEditor({
    mode: 'update',
    id: user.id,
    userName: user.userName,
    fullName: user.fullName,
    role: user.roles?.[0] || 'HRAssistant',
    isActive: user.isActive,
  });

  const saveEditor = async (event) => {
    event.preventDefault();
    if (!editor) return;
    setSavingUser(true);
    try {
      if (editor.mode === 'create') {
        await api.post('/users', {
          userName: editor.userName,
          fullName: editor.fullName,
          password: editor.password,
          role: editor.role,
        });
        toast.success('User created. Section access follows the assigned RBAC category.');
      } else {
        await api.put(`/users/${editor.id}`, {
          fullName: editor.fullName,
          role: editor.role,
          isActive: editor.isActive,
        });
        toast.success('User updated. Section access follows the assigned RBAC category.');
      }
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || (editor.mode === 'create' ? 'Create failed.' : 'Update failed.'));
    } finally {
      setSavingUser(false);
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

  const activate = async (user) => {
    const ok = await confirm({
      title: 'Activate user',
      message: `Activate ${user.fullName}? They will be able to sign in again.`,
      confirmLabel: 'Activate',
      tone: 'success',
    });
    if (!ok) return;
    try {
      await api.put(`/users/${user.id}`, {
        fullName: user.fullName,
        role: user.roles?.[0] || 'HRAssistant',
        isActive: true,
      });
      toast.success('User activated.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Activate failed.');
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
          <div className={`perm-role-row${row.locked ? ' is-locked' : ''}`} key={row.role}>
            <div className="perm-role-row__head">
              <div>
                <strong>{row.roleLabel}</strong>
                <div className="muted">{row.locked ? 'Full access cannot be reduced' : 'Tick the sections this role should receive by default'}</div>
              </div>
              {row.locked ? (
                <span className="perm-role-row__lock">Full access</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary perm-role-row__save"
                  disabled={savingRole === row.role}
                  onClick={() => saveRole(row)}
                >
                  {savingRole === row.role ? 'Saving…' : 'Save defaults'}
                </button>
              )}
            </div>
            <SectionChecks
              values={row.sections || []}
              disabled={row.locked}
              onToggle={(key) => updateRoleLocal(row.role, key)}
            />
          </div>
        ))}
      </section>

      <section className="users-directory">
        <div className="users-directory__head">
          <div>
            <h2>Users</h2>
            <p className="muted">{users.length === 1 ? '1 account' : `${users.length} accounts`}</p>
          </div>
          <button type="button" className="btn btn-primary users-directory__create" onClick={openCreate}>
            Create New User
          </button>
        </div>
        <div className="table-wrap users-table">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>RBAC category</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td className="users-table__empty" colSpan={5}>No user accounts yet.</td>
                </tr>
              ) : users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong className="users-table__name">{u.fullName}</strong>
                  </td>
                  <td><span className="users-table__handle">{u.userName}</span></td>
                  <td><span className="users-table__role">{roleLabel(u.roles?.[0])}</span></td>
                  <td>
                    <span className={`users-table__status ${u.isActive ? 'is-active' : 'is-inactive'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="row-actions users-table__actions">
                    <button type="button" className="btn link-btn users-table__update" onClick={() => openUpdate(u)}>Update</button>
                    <button type="button" className="btn link-btn users-table__password" onClick={() => resetPassword(u.id)}>Password</button>
                    {u.isActive ? (
                      <button type="button" className="btn link-btn danger users-table__deactivate" onClick={() => deactivate(u.id)}>Deactivate</button>
                    ) : (
                      <button type="button" className="btn link-btn users-table__activate" onClick={() => activate(u)}>Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editor && (
        <div className="confirm-overlay" onClick={() => { if (!savingUser) setEditor(null); }}>
          <form
            className="confirm-dialog users-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="users-editor-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveEditor}
          >
            <h2 id="users-editor-title">{editor.mode === 'create' ? 'Create user' : 'Update user'}</h2>
            <p>
              {editor.mode === 'create'
                ? 'The new account receives the default sections for the category you choose.'
                : 'Name and category changes apply to this account. Password resets stay on the Password action.'}
            </p>
            <label>
              Username
              <input
                required={editor.mode === 'create'}
                autoFocus={editor.mode === 'create'}
                disabled={editor.mode === 'update'}
                value={editor.userName}
                onChange={(event) => setEditor({ ...editor, userName: event.target.value })}
              />
            </label>
            <label>
              Full name
              <input
                required
                autoFocus={editor.mode === 'update'}
                value={editor.fullName}
                onChange={(event) => setEditor({ ...editor, fullName: event.target.value })}
              />
            </label>
            {editor.mode === 'create' && (
              <label>
                Password
                <input
                  required
                  type="password"
                  value={editor.password}
                  onChange={(event) => setEditor({ ...editor, password: event.target.value })}
                />
              </label>
            )}
            <label>
              RBAC category
              <select value={editor.role} onChange={(event) => setEditor({ ...editor, role: event.target.value })}>
                {RBAC_CATEGORIES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </label>
            <div className="confirm-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)} disabled={savingUser}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={savingUser}>
                {savingUser ? 'Saving…' : editor.mode === 'create' ? 'Create' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
