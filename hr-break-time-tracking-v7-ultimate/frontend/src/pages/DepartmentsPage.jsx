import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../feedback/FeedbackContext';

const emptyForm = { name: '', description: '' };

export default function DepartmentsPage() {
  const { can } = useAuth();
  const { toast, confirm } = useFeedback();
  const canEdit = can('departments');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listView, setListView] = useState('active');
  const activeItems = useMemo(() => items.filter((d) => !d.isDeleted), [items]);
  const deletedItems = useMemo(() => items.filter((d) => d.isDeleted), [items]);
  const visibleItems = listView === 'deleted' ? deletedItems : activeItems;

  const load = async () => {
    const { data } = await api.get('/departments', {
      params: { includeDeleted: canEdit || undefined },
    });
    setItems(data);
  };

  useEffect(() => {
    load().catch((err) => {
      toast.error(err.response?.data?.message || 'Failed to load departments.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setEditorOpen(true);
  };

  const openUpdate = (department) => {
    setEditingId(department.id);
    setForm({ name: department.name, description: department.description || '' });
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
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/departments/${editingId}`, form);
        toast.success('Department updated.');
      } else {
        await api.post('/departments', form);
        toast.success('Department created.');
      }
      closeEditor();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({
      title: 'Delete department',
      message: 'Delete this department? It will be hidden from HR Manager and HR Assistant views.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Department deleted.');
      if (editingId === id) closeEditor();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed.');
    }
  };

  const recover = async (id) => {
    const ok = await confirm({
      title: 'Recover department',
      message: 'Recover this deleted department?',
      confirmLabel: 'Recover',
      tone: 'success',
    });
    if (!ok) return;
    try {
      await api.post(`/departments/${id}/recover`);
      toast.success('Department recovered.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Recover failed.');
    }
  };

  return (
    <div className="page staff-console-page departments-page">
      <header className="page-header">
        <div>
          <h1>Departments</h1>
          <p>Organize employees by department for tracking and reports.</p>
        </div>
        <div className="header-stat-tiles">
          <div className="header-stat-tiles__row">
            <article className="header-stat-tile">
              <span>Active</span>
              <strong>{activeItems.length}</strong>
            </article>
            {canEdit && (
              <article className="header-stat-tile">
                <span>Deleted</span>
                <strong>{deletedItems.length}</strong>
              </article>
            )}
          </div>
        </div>
      </header>

      <section className="users-directory">
        <div className="users-directory__head">
          <div>
            <h2>{listView === 'deleted' ? 'Deleted departments' : 'Departments'}</h2>
            <p className="muted">
              {visibleItems.length === 1 ? '1 department' : `${visibleItems.length} departments`}
            </p>
          </div>
          {canEdit && listView !== 'deleted' && (
            <button type="button" className="btn btn-primary users-directory__create" onClick={openCreate}>
              Create New Department
            </button>
          )}
        </div>

        {canEdit && (
          <div className="list-switch" role="tablist" aria-label="Department lists">
            <button
              type="button"
              role="tab"
              aria-selected={listView === 'active'}
              className={`list-switch__btn${listView === 'active' ? ' is-active' : ''}`}
              onClick={() => setListView('active')}
            >
              Active
              <span className="list-switch__count">{activeItems.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listView === 'deleted'}
              className={`list-switch__btn${listView === 'deleted' ? ' is-active' : ''}`}
              onClick={() => setListView('deleted')}
            >
              Deleted
              <span className="list-switch__count">{deletedItems.length}</span>
            </button>
          </div>
        )}

        <div className="table-wrap users-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Employees</th>
                <th>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((d) => (
                <tr key={d.id}>
                  <td data-label="Name">
                    <strong className="users-table__name">{d.name}</strong>
                    <div className="muted">{d.description || '—'}</div>
                  </td>
                  <td data-label="Employees"><span className="users-table__handle">{d.employeeCount}</span></td>
                  <td data-label="Status">
                    <span className={`users-table__status ${d.isDeleted ? 'is-inactive' : 'is-active'}`}>
                      {d.isDeleted ? 'Deleted' : 'Active'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="row-actions users-table__actions" data-label="Actions">
                      {!d.isDeleted && (
                        <>
                          <button type="button" className="btn link-btn users-table__update" onClick={() => openUpdate(d)}>Update</button>
                          <button type="button" className="btn link-btn danger users-table__deactivate" onClick={() => remove(d.id)}>Delete</button>
                        </>
                      )}
                      {d.isDeleted && (
                        <button type="button" className="btn link-btn users-table__activate" onClick={() => recover(d.id)}>Recover</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!visibleItems.length && (
                <tr>
                  <td className="users-table__empty" colSpan={canEdit ? 4 : 3}>
                    {listView === 'deleted' ? 'No deleted departments.' : 'No departments yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editorOpen && (
        <div className="confirm-overlay" onClick={() => { if (!saving) closeEditor(); }}>
          <form
            className="confirm-dialog users-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-editor-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={onSubmit}
          >
            <h2 id="department-editor-title">{editingId ? 'Update department' : 'Create department'}</h2>
            <p>
              {editingId
                ? 'Name and description changes apply to this department.'
                : 'New departments can be assigned to employees and used in reports.'}
            </p>
            <label>
              Name
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </label>
            <div className="confirm-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
