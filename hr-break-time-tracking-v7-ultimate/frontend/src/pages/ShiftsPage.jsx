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

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/shifts/${editingId}`, form);
        toast.success('Shift updated.');
      } else {
        await api.post('/shifts', form);
        toast.success('Shift created.');
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
    }
  };

  const startEdit = (shift) => {
    setEditingId(shift.id);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      isActive: shift.isActive,
    });
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
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Deactivate failed.');
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

      <div className="split-forms">
        <form className="card-form" onSubmit={onSubmit}>
          <h2>{editingId ? 'Edit shift' : 'Add shift'}</h2>
          <label>
            Shift name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Night Shift" />
          </label>
          <label>
            Start time (military)
            <select required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
              {HALF_HOUR_OPTIONS.map((t) => <option key={`s-${t}`} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            End time (military)
            <select required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>
              {HALF_HOUR_OPTIONS.map((t) => <option key={`e-${t}`} value={t}>{t}</option>)}
            </select>
          </label>
          {editingId && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
          )}
          <p className="hint">Preview: <strong>{previewLabel}</strong></p>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">{editingId ? 'Update' : 'Create'}</button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <section className="list-panel">
          <header className="list-panel__head">
            <div>
              <h2>{listView === 'inactive' ? 'Inactive shifts' : 'Active shifts'}</h2>
              <p className="list-panel__hint">
                {listView === 'inactive'
                  ? 'Kept on existing employees, but cannot be newly selected.'
                  : 'Available for employee assignment and live tracking.'}
              </p>
            </div>
            <span className="header-stat-tile">
              <span>{listView === 'inactive' ? 'Inactive' : 'Active'}</span>
              <strong>{visibleItems.length}</strong>
            </span>
          </header>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start</th>
                <th>End</th>
                <th>Overnight</th>
                <th>Employees</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.startTime}</td>
                  <td>{s.spansNextDay ? `${s.endTime} (+1)` : s.endTime}</td>
                  <td>{s.spansNextDay ? 'Yes' : 'No'}</td>
                  <td>{s.employeeCount}</td>
                  <td>{s.isActive ? 'Yes' : 'No'}</td>
                  <td className="row-actions">
                    <button type="button" className="btn link-btn" onClick={() => startEdit(s)}>Edit</button>
                    {s.isActive && (
                      <button type="button" className="btn link-btn danger" onClick={() => deactivate(s.id)}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
              {!visibleItems.length && (
                <tr>
                  <td colSpan={7} className="empty">
                    {listView === 'inactive' ? 'No inactive shifts.' : 'No shifts yet. Create the first shift.'}
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
