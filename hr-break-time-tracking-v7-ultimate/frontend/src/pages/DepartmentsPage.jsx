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

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    try {
      if (editingId) {
        await api.put(`/departments/${editingId}`, form);
        toast.success('Department updated.');
      } else {
        await api.post('/departments', form);
        toast.success('Department created.');
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
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
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
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
    <div className="page staff-console-page">
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

      <div className={canEdit ? 'split-forms' : undefined}>
        {canEdit && (
          <form className="card-form" onSubmit={onSubmit}>
            <h2>{editingId ? 'Edit department' : 'Add department'}</h2>
            <label>
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">{editingId ? 'Update' : 'Create'}</button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        <section className="list-panel">
          <header className="list-panel__head">
            <div>
              <h2>{listView === 'deleted' ? 'Deleted departments' : 'Active departments'}</h2>
              <p className="list-panel__hint">
                {listView === 'deleted'
                  ? 'Hidden from HR Manager and HR Assistant views until recovered.'
                  : 'Used for employee assignment, tracking, and reports.'}
              </p>
            </div>
            <span className="header-stat-tile">
              <span>{listView === 'deleted' ? 'Deleted' : 'Active'}</span>
              <strong>{visibleItems.length}</strong>
            </span>
          </header>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Employees</th>
                {canEdit && <th>Status</th>}
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((d) => (
                <tr key={d.id} className={d.isDeleted ? 'is-deleted' : undefined}>
                  <td>
                    <strong>{d.name}</strong>
                    <div className="muted">{d.description || '—'}</div>
                  </td>
                  <td>{d.employeeCount}</td>
                  {canEdit && (
                    <td>
                      {d.isDeleted
                        ? <span className="status-badge status-red">Deleted</span>
                        : <span className="status-badge status-green">Active</span>}
                    </td>
                  )}
                  {canEdit && (
                    <td className="row-actions">
                      {!d.isDeleted && (
                        <>
                          <button
                            type="button"
                            className="btn link-btn"
                            onClick={() => {
                              setEditingId(d.id);
                              setForm({ name: d.name, description: d.description || '' });
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="btn link-btn danger" onClick={() => remove(d.id)}>Delete</button>
                        </>
                      )}
                      {d.isDeleted && (
                        <button type="button" className="btn link-btn recover" onClick={() => recover(d.id)}>Recover</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!visibleItems.length && (
                <tr>
                  <td className="empty" colSpan={canEdit ? 4 : 2}>
                    {listView === 'deleted' ? 'No deleted departments.' : 'No departments yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </div>
  );
}
