import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../feedback/FeedbackContext';

const SEARCH_DEBOUNCE_MS = 350;

function StaffCredentialsModal({ employeeName, busy, error, onCancel, onConfirm }) {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    onConfirm({ userName: userName.trim(), password });
  };

  return (
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <form
        className="confirm-dialog confirm-dialog--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passcode-reset-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="passcode-reset-title">Confirm passcode reset</h2>
        <p>
          Reset the break passcode for <strong>{employeeName}</strong>? Enter your staff username and
          password to confirm. After reset, that employee will create a new passcode the next time
          they start or end a break.
        </p>
        <label className="confirm-dialog__field">
          Your username
          <input
            ref={userRef}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="confirm-dialog__field">
          Your password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="passcode-error" role="alert">{error}</p>}
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset passcode'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UserPasscodesPage() {
  const { can } = useAuth();
  const { toast } = useFeedback();
  const canResetEmployeePasscodes = can('user-passcodes');

  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetError, setResetError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const searchTimer = useRef(null);
  const loadSeq = useRef(0);

  const loadEmployees = useCallback(async (term = appliedSearch) => {
    if (!canResetEmployeePasscodes) return;
    const seq = ++loadSeq.current;
    const { data } = await api.get('/employees/passcode-directory', {
      params: { search: term || undefined },
    });
    if (seq !== loadSeq.current) return;
    setEmployees(data || []);
  }, [appliedSearch, canResetEmployeePasscodes]);

  useEffect(() => {
    loadEmployees().catch((err) => toast.error(apiErrorMessage(err, 'Failed to load employees.')));
  }, [loadEmployees, toast]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''))),
    [employees],
  );

  const openEmployeeReset = (employee) => {
    setResetError('');
    setResetTarget(employee);
  };

  const confirmEmployeeReset = async ({ userName, password }) => {
    if (!resetTarget) return;
    setResetBusy(true);
    setResetError('');
    try {
      await api.post(`/employees/${resetTarget.id}/passcode/reset`, { userName, password });
      toast.success(`Passcode reset for ${resetTarget.fullName}. They can create a new one on the next break.`);
      setResetTarget(null);
      await loadEmployees();
    } catch (err) {
      setResetError(apiErrorMessage(err, 'Passcode reset failed.'));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>User Passcodes</h1>
          <p>
            Reset employee break passcodes. Employee passcode access is controlled from Users &amp; RBAC.
          </p>
        </div>
      </header>

      {canResetEmployeePasscodes && (
        <section className="list-panel passcodes-panel">
          <div className="list-panel__head">
            <h2>Reset employee passcodes</h2>
            <span className="list-panel__count">{sortedEmployees.length}</span>
          </div>
          <p className="list-panel__hint">
            Search an employee and reset their break passcode. You must confirm with your own staff
            username and password. After reset, the employee creates a new passcode on the next start
            or end break.
          </p>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search by name or employee code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setAppliedSearch(search.trim())}
            />
            <button type="button" className="btn btn-ghost" onClick={() => setAppliedSearch(search.trim())}>
              Search
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Shift</th>
                  <th>Passcode</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={6}>No employees found.</td>
                  </tr>
                )}
                {sortedEmployees.map((e) => (
                  <tr key={e.id}>
                    <td>{e.employeeCode}</td>
                    <td>{e.fullName}</td>
                    <td>{e.departmentName}</td>
                    <td>{e.shiftDisplay || e.shiftName || '—'}</td>
                    <td>{e.hasPasscode ? 'Set' : 'Not set'}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn link-btn danger"
                        onClick={() => openEmployeeReset(e)}
                      >
                        Reset passcode
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!canResetEmployeePasscodes && (
        <p className="hint">You do not have access to User Passcodes. Ask a Developer to grant this section.</p>
      )}

      {resetTarget && (
        <StaffCredentialsModal
          employeeName={resetTarget.fullName}
          busy={resetBusy}
          error={resetError}
          onCancel={() => {
            if (!resetBusy) {
              setResetTarget(null);
              setResetError('');
            }
          }}
          onConfirm={confirmEmployeeReset}
        />
      )}
    </div>
  );
}
