import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useFeedback } from '../feedback/FeedbackContext';

const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

const emptyForm = {
  name: '',
  startTime: '08:00',
  endTime: '17:00',
  isActive: true,
};

export default function ShiftsPage() {
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listView, setListView] = useState('active');
  const activeItems = useMemo(() => items.filter((s) => s.isActive), [items]);
  const inactiveItems = useMemo(() => items.filter((s) => !s.isActive), [items]);
  const visibleItems = listView === 'inactive' ? inactiveItems : activeItems;

  const previewLabel = useMemo(() => {
    if (!form.startTime || !form.endTime) return '';
    const overnight = form.endTime <= form.startTime;
    const end = overnight ? `${form.endTime} (+1)` : form.endTime;
    return `${form.name || 'Shift'} (${form.startTime} – ${end})`;
  }, [form]);

  const load = async () => {
    const { data } = await api.get('/shifts', { params: { includeInactive: true } });
    setItems(data);
  };

  useEffect(() => {
    load().catch((err) => {
      toast.error(err.response?.data?.message || 'Failed to load shifts.');
    });
  }, []);

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

  const startEdit = (shift) => {
    setEditingId(shift.id);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isActive: shift.isActive,
    });
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
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/shifts/${editingId}`, form);
        toast.success('Shift updated.');
      } else {
        await api.post('/shifts', form);
        toast.success('Shift created.');
      }
      closeEditor();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    const ok = await confirm({
      title: 'Deactivate shift',
      message: 'Deactivate this shift? Employees keep their assignment; inactive shifts cannot be newly selected.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.post(`/shifts/${id}/deactivate`);
      toast.success('Shift deactivated.');
      if (editingId === id) closeEditor();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Deactivate failed.');
    }
  };

  const activate = async (shift) => {
    const ok = await confirm({
      title: 'Activate shift',
      message: `Activate ${shift.name}? It can be assigned to employees again.`,
      confirmLabel: 'Activate',
      tone: 'success',
    });
    if (!ok) return;
    try {
      await api.put(`/shifts/${shift.id}`, {
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isActive: true,
      });
      toast.success('Shift activated.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Activate failed.');
    }
  };

  return (
    <div className="page staff-console-page">
      <header className="page-header">
        <div>
          <h1>Shifts</h1>
          <p>Define military-time work shifts (30-minute steps). Overnight shifts are supported (e.g. 19:30 – 07:30).</p>
        </div>
        <div className="header-stat-tiles">
          <div className="header-stat-tiles__row">
            <article className="header-stat-tile">
              <span>Active</span>
              <strong>{activeItems.length}</strong>
            </article>
            <article className="header-stat-tile">
              <span>Inactive</span>
              <strong>{inactiveItems.length}</strong>
            </article>
          </div>
        </div>
      </header>

      <section className="users-directory">
        <div className="users-directory__head">
          <div>
            <h2>{listView === 'inactive' ? 'Inactive shifts' : 'Shifts'}</h2>
            <p className="muted">{visibleItems.length === 1 ? '1 shift' : `${visibleItems.length} shifts`}</p>
          </div>
          {listView !== 'inactive' && (
            <button type="button" className="btn btn-primary users-directory__create" onClick={openCreate}>
              Create New Shift
            </button>
          )}
        </div>

        <div className="list-switch" role="tablist" aria-label="Shift lists">
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
            aria-selected={listView === 'inactive'}
            className={`list-switch__btn${listView === 'inactive' ? ' is-active' : ''}`}
            onClick={() => setListView('inactive')}
          >
            Inactive
            <span className="list-switch__count">{inactiveItems.length}</span>
          </button>
        </div>

        <div className="table-wrap users-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Hours</th>
                <th>Overnight</th>
                <th>Employees</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((s) => (
                <tr key={s.id}>
                  <td><strong className="users-table__name">{s.name}</strong></td>
                  <td><span className="users-table__handle">{s.startTime} – {s.spansNextDay ? `${s.endTime} (+1)` : s.endTime}</span></td>
                  <td><span className="users-table__role">{s.spansNextDay ? 'Overnight' : 'Same day'}</span></td>
                  <td><span className="users-table__handle">{s.employeeCount}</span></td>
                  <td>
                    <span className={`users-table__status ${s.isActive ? 'is-active' : 'is-inactive'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="row-actions users-table__actions">
                    <button type="button" className="btn link-btn users-table__update" onClick={() => startEdit(s)}>Update</button>
                    {s.isActive ? (
                      <button type="button" className="btn link-btn danger users-table__deactivate" onClick={() => deactivate(s.id)}>Deactivate</button>
                    ) : (
                      <button type="button" className="btn link-btn users-table__activate" onClick={() => activate(s)}>Activate</button>
                    )}
                  </td>
                </tr>
              ))}
              {!visibleItems.length && (
                <tr>
                  <td className="users-table__empty" colSpan={6}>
                    {listView === 'inactive' ? 'No inactive shifts.' : 'No shifts yet.'}
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
            aria-labelledby="shift-editor-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={onSubmit}
          >
            <h2 id="shift-editor-title">{editingId ? 'Update shift' : 'Create shift'}</h2>
            <p>Times use 30-minute steps. An end time at or before the start time runs overnight.</p>
            <label>
              Shift name
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Night Shift" />
            </label>
            <label>
              Start time
              <select required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
                {HALF_HOUR_OPTIONS.map((t) => <option key={`s-${t}`} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              End time
              <select required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>
                {HALF_HOUR_OPTIONS.map((t) => <option key={`e-${t}`} value={t}>{t}</option>)}
              </select>
            </label>
            {editingId && (
              <label className="users-editor__check">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            )}
            <p className="hint">Preview: <strong>{previewLabel}</strong></p>
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
