import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { apiErrorMessage } from '../api/client';
import { useLiveUpdates } from '../api/liveUpdates';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../feedback/FeedbackContext';

const emptyForm = {
  employeeCode: '',
  fullName: '',
  departmentId: '',
  shiftId: '',
};

const POLL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 350;
const CODE_CHECK_MS = 280;
const CODE_TAKEN_MESSAGE = 'This code is used by another user.';

function normalizeCode(value) {
  return String(value || '').trim().toLowerCase();
}

function findLocalCodeOwner(employees, code, excludeId) {
  const key = normalizeCode(code);
  if (!key) return null;
  return employees.find((emp) => normalizeCode(emp.employeeCode) === key && emp.id !== excludeId) || null;
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function EmployeeTable({
  rows,
  emptyLabel,
  showDeactivatedMeta,
  canEdit,
  canDeactivate,
  canPurge,
  onEdit,
  onDeactivate,
  onActivate,
  onPurge,
  busyId,
}) {
  const showActions = canEdit || canDeactivate || canPurge;
  const colCount = 5 + (showDeactivatedMeta ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className="table-wrap users-table">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Department</th>
            <th>Shift</th>
            <th>Passcode</th>
            {showDeactivatedMeta && <th>Deactivated</th>}
            {showActions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="users-table__empty" colSpan={colCount}>{emptyLabel}</td>
            </tr>
          )}
          {rows.map((e) => (
            <tr key={e.id}>
              <td data-label="Name"><strong className="users-table__name">{e.fullName}</strong></td>
              <td data-label="Code"><span className="users-table__handle">{e.employeeCode}</span></td>
              <td data-label="Department"><span className="users-table__role">{e.departmentName || '—'}</span></td>
              <td data-label="Shift"><span className="users-table__role">{e.shiftDisplay || e.shiftName || 'No shift'}</span></td>
              <td data-label="Passcode">
                <span className={`users-table__status ${e.hasPasscode ? 'is-active' : 'is-inactive'}`}>
                  {e.hasPasscode ? 'Set' : 'Not set'}
                </span>
              </td>
              {showDeactivatedMeta && <td className="muted" data-label="Deactivated">{formatWhen(e.deactivatedAt)}</td>}
              {showActions && (
                <td className="row-actions users-table__actions" data-label="Actions">
                  {canEdit && !e.isDeactivated && (
                    <button type="button" className="btn link-btn users-table__update" onClick={() => onEdit(e)} disabled={busyId === e.id}>
                      Update
                    </button>
                  )}
                  {canDeactivate && !e.isDeactivated && (
                    <button type="button" className="btn link-btn danger users-table__deactivate" onClick={() => onDeactivate(e)} disabled={busyId === e.id}>
                      Deactivate
                    </button>
                  )}
                  {canDeactivate && e.isDeactivated && (
                    <button type="button" className="btn link-btn users-table__activate" onClick={() => onActivate(e)} disabled={busyId === e.id}>
                      Activate
                    </button>
                  )}
                  {canPurge && e.isDeactivated && (
                    <button type="button" className="btn link-btn danger users-table__deactivate" onClick={() => onPurge(e)} disabled={busyId === e.id}>
                      Delete
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EmployeesPage() {
  const { can, canDeactivateEmployees, canPurgeEmployees } = useAuth();
  const { toast, confirm } = useFeedback();
  const canEdit = can('employees');
  const canDeactivate = canDeactivateEmployees && canEdit;
  const canPurge = canPurgeEmployees && canEdit;
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [listView, setListView] = useState('active');
  const [busyId, setBusyId] = useState(null);
  const loadSeq = useRef(0);
  const searchTimer = useRef(null);
  const lastLoadError = useRef('');
  const [codeTaken, setCodeTaken] = useState(false);
  const codeCheckSeq = useRef(0);

  const load = useCallback(async (searchTerm = appliedSearch) => {
    const seq = ++loadSeq.current;
    const [empRes, deptRes, shiftRes] = await Promise.all([
      api.get('/employees', {
        params: {
          search: searchTerm || undefined,
          includeDeactivated: canDeactivate || undefined,
        },
      }),
      api.get('/departments'),
      api.get('/shifts'),
    ]);
    if (seq !== loadSeq.current) return;
    setEmployees(empRes.data || []);
    setDepartments(deptRes.data || []);
    setShifts(shiftRes.data || []);
  }, [appliedSearch, canDeactivate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await load();
        lastLoadError.current = '';
      } catch (err) {
        if (!cancelled) {
          const msg = apiErrorMessage(err, 'Failed to load employees.');
          if (lastLoadError.current !== msg) {
            lastLoadError.current = msg;
            toast.error(msg);
          }
        }
      }
    };
    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, toast]);

  useLiveUpdates(() => {
    load().catch(() => {});
  });

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  useEffect(() => {
    if (!editingId) return;
    const stillActive = employees.some((e) => e.id === editingId && !e.isDeactivated);
    if (!stillActive) {
      setEditingId(null);
      setForm(emptyForm);
      setEditorOpen(false);
    }
  }, [employees, editingId]);

  useEffect(() => {
    const excludeId = editingId;
    const current = employees.find((emp) => emp.id === excludeId);
    const ownCode = Boolean(current && normalizeCode(current.employeeCode) === normalizeCode(form.employeeCode));
    if (findLocalCodeOwner(employees, form.employeeCode, excludeId)) {
      setCodeTaken(true);
      return undefined;
    }
    if (!form.employeeCode.trim() || ownCode) {
      setCodeTaken(false);
      return undefined;
    }

    const seq = ++codeCheckSeq.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/code-status', {
          params: {
            code: form.employeeCode.trim(),
            excludeId: excludeId || undefined,
          },
        });
        if (seq === codeCheckSeq.current) setCodeTaken(data?.available === false);
      } catch {
        if (seq === codeCheckSeq.current) {
          setCodeTaken(Boolean(findLocalCodeOwner(employees, form.employeeCode, excludeId)));
        }
      }
    }, CODE_CHECK_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [form.employeeCode, editingId, employees]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => !e.isDeactivated),
    [employees],
  );
  const deactivatedEmployees = useMemo(
    () => employees.filter((e) => e.isDeactivated),
    [employees],
  );

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setCodeTaken(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCodeTaken(false);
    setEditorOpen(true);
  };

  useEffect(() => {
    if (!editorOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) closeEditor();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen, saving]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    if (findLocalCodeOwner(employees, form.employeeCode, editingId) || codeTaken) {
      setCodeTaken(true);
      return;
    }
    setSaving(true);
    try {
      const shiftId = form.shiftId ? Number(form.shiftId) : null;
      const payload = {
        ...form,
        employeeCode: form.employeeCode.trim(),
        departmentId: Number(form.departmentId),
        shiftId,
      };
      if (editingId) {
        await api.put(`/employees/${editingId}`, {
          employeeCode: payload.employeeCode,
          fullName: payload.fullName,
          departmentId: payload.departmentId,
          shiftId: payload.shiftId,
          hireDate: new Date().toISOString(),
        });
        toast.success('Employee updated.');
      } else {
        await api.post('/employees', payload);
        toast.success('Employee created.');
      }
      setForm(emptyForm);
      setEditingId(null);
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (emp) => {
    if (!canEdit || emp.isDeactivated) return;
    setEditingId(emp.id);
    setForm({
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      departmentId: String(emp.departmentId),
      shiftId: emp.shiftId ? String(emp.shiftId) : '',
    });
    setCodeTaken(false);
    setEditorOpen(true);
  };

  const deactivate = async (emp) => {
    const ok = await confirm({
      title: 'Deactivate employee',
      message: `Deactivate ${emp.fullName}? They will leave live tracking. Existing break records will be kept.`,
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(emp.id);
    try {
      await api.post(`/employees/${emp.id}/deactivate`);
      toast.success(`${emp.fullName} deactivated.`);
      if (editingId === emp.id) closeEditor();
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Deactivate failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const activate = async (emp) => {
    const ok = await confirm({
      title: 'Activate employee',
      message: `Activate ${emp.fullName}? They will appear on live tracking again.`,
      confirmLabel: 'Activate',
      tone: 'success',
    });
    if (!ok) return;
    setBusyId(emp.id);
    try {
      await api.post(`/employees/${emp.id}/activate`);
      toast.success(`${emp.fullName} activated.`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Activate failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (emp) => {
    const ok = await confirm({
      title: 'Permanently delete employee',
      message: `Permanently delete ${emp.fullName} and all of their break records? This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(emp.id);
    try {
      await api.delete(`/employees/${emp.id}`);
      toast.success(`${emp.fullName} and related records permanently deleted.`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Delete failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const shiftOptions = shifts.filter((s) => s.isActive || String(s.id) === String(form.shiftId));

  return (
    <div className="page staff-console-page employees-page">
      <header className="page-header">
        <div>
          <h1>Employees</h1>
          <p>
            Maintain employee master data and assign work shifts. Deactivated employees stay in the
            system with their records until a Developer permanently deletes them.
          </p>
        </div>
        <div className="header-stat-tiles">
          <div className="header-stat-tiles__row">
            <article className="header-stat-tile">
              <span>Active</span>
              <strong>{activeEmployees.length}</strong>
            </article>
            {canDeactivate && (
              <article className="header-stat-tile">
                <span>Deactivated</span>
                <strong>{deactivatedEmployees.length}</strong>
              </article>
            )}
          </div>
        </div>
      </header>

      <section className="users-directory">
        <div className="users-directory__head">
          <div>
            <h2>{listView === 'deactivated' ? 'Deactivated employees' : 'Employees'}</h2>
            <p className="muted">
              {listView === 'deactivated'
                ? (deactivatedEmployees.length === 1 ? '1 deactivated employee' : `${deactivatedEmployees.length} deactivated employees`)
                : (activeEmployees.length === 1 ? '1 employee' : `${activeEmployees.length} employees`)}
            </p>
          </div>
          {canEdit && listView !== 'deactivated' && (
            <button type="button" className="btn btn-primary users-directory__create" onClick={openCreate}>
              Create New Employee
            </button>
          )}
        </div>

        <div className="users-directory__tools">
          <input
            className="search"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setAppliedSearch(search.trim())}
            aria-label="Search employees"
          />
          <button type="button" className="btn btn-ghost" onClick={() => setAppliedSearch(search.trim())}>Search</button>
        </div>

        {canDeactivate && (
          <div className="list-switch" role="tablist" aria-label="Employee lists">
            <button
              type="button"
              role="tab"
              aria-selected={listView === 'active'}
              className={`list-switch__btn${listView === 'active' ? ' is-active' : ''}`}
              onClick={() => setListView('active')}
            >
              Active
              <span className="list-switch__count">{activeEmployees.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listView === 'deactivated'}
              className={`list-switch__btn${listView === 'deactivated' ? ' is-active' : ''}`}
              onClick={() => setListView('deactivated')}
            >
              Deactivated
              <span className="list-switch__count">{deactivatedEmployees.length}</span>
            </button>
          </div>
        )}

        {listView === 'active' && (
          <EmployeeTable
            rows={activeEmployees}
            emptyLabel="No active employees found."
            canEdit={canEdit}
            canDeactivate={canDeactivate}
            canPurge={false}
            onEdit={startEdit}
            onDeactivate={deactivate}
            onActivate={activate}
            onPurge={purge}
            busyId={busyId}
          />
        )}

        {canDeactivate && listView === 'deactivated' && (
          <EmployeeTable
            rows={deactivatedEmployees}
            emptyLabel="No deactivated employees."
            showDeactivatedMeta
            canEdit={false}
            canDeactivate={canDeactivate}
            canPurge={canPurge}
            onEdit={startEdit}
            onDeactivate={deactivate}
            onActivate={activate}
            onPurge={purge}
            busyId={busyId}
          />
        )}
      </section>

      {editorOpen && canEdit && (
        <div className="confirm-overlay" onClick={() => { if (!saving) closeEditor(); }}>
          <form
            className="confirm-dialog users-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-editor-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={onSubmit}
          >
            <h2 id="employee-editor-title">{editingId ? 'Update employee' : 'Create employee'}</h2>
            <p>
              {editingId
                ? 'Name, code, department, and shift changes apply to this employee.'
                : 'The new employee can be assigned a department and shift immediately.'}
            </p>
            <label>
              Full name
              <input required autoFocus value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </label>
            <label>
              Code
              <input
                required
                maxLength={50}
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                aria-invalid={codeTaken}
              />
              {codeTaken && (
                <span className="field-warning" role="alert">{CODE_TAKEN_MESSAGE}</span>
              )}
            </label>
            <label>
              Department
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select…</option>
                {departments.filter((d) => !d.isDeleted).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label>
              Shift
              <select value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                <option value="">No shift assigned</option>
                {shiftOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayLabel}</option>
                ))}
              </select>
            </label>
            <div className="confirm-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={codeTaken || saving}>
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
