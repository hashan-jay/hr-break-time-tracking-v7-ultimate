import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../feedback/FeedbackContext';
import { settingLabel } from '../lib/breakHelpers';
import AdjustTimeSection from '../components/AdjustTimeSection';

const DURATION_KEYS = ['MealBreakLimitMinutes', 'ComfortBreakLimitMinutes'];
const START_KEYS = ['MealBreakStartLimit', 'ComfortBreakStartLimit'];
const PORTAL_WEATHER_KEY = 'PortalWeatherEffect';
const WEATHER_OPTIONS = [
  { value: 'none', label: 'Nothing' },
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
  { value: 'ducks', label: 'Yellow ducks' },
  { value: 'birds', label: 'Birds' },
  { value: 'watermelon', label: 'Watermelon slices' },
  { value: 'orange', label: 'Orange slices' },
  { value: 'clowns', label: 'Clown faces' },
  { value: 'bananas', label: 'Bananas' },
  { value: 'stars', label: 'Stars' },
  { value: 'weedpaper', label: 'Weed paper' },
  { value: 'joker', label: 'Joker masquerade' },
];

function SettingRow({ setting, min, max, onChange, onSave }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{settingLabel(setting.key)}</strong>
        <div className="muted">{setting.description || '—'}</div>
        <div className="muted mono">{setting.key}</div>
      </div>
      <div className="setting-edit">
        <input
          type="number"
          min={min}
          max={max}
          value={setting.value}
          onChange={(e) => onChange(setting.id, e.target.value)}
        />
        <button type="button" className="btn btn-primary" onClick={() => onSave(setting.key, setting.value)}>
          Save
        </button>
      </div>
    </div>
  );
}

function rowKey(shiftId, departmentId) {
  return `${shiftId}:${departmentId}`;
}

export default function SettingsPage() {
  const { toast } = useFeedback();
  const { isDeveloper } = useAuth();
  const [settings, setSettings] = useState([]);
  const [shiftGroups, setShiftGroups] = useState([]);
  const [savingKey, setSavingKey] = useState(null);
  const [savingShiftId, setSavingShiftId] = useState(null);
  const [listView, setListView] = useState('shifts');

  const load = async () => {
    const [settingsRes, shiftRes] = await Promise.all([
      api.get('/settings'),
      api.get('/settings/shift-department-break-limits'),
    ]);
    setSettings(settingsRes.data);
    setShiftGroups(shiftRes.data);
  };

  useEffect(() => {
    load().catch((err) => {
      toast.error(err.response?.data?.message || 'Failed to load settings.');
    });
  }, []);

  const save = async (key, value) => {
    try {
      await api.put(`/settings/${encodeURIComponent(key)}`, { value });
      toast.success('Setting saved.');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
    }
  };

  const updateLocal = (id, value) => {
    setSettings((prev) => prev.map((x) => (x.id === id ? { ...x, value } : x)));
  };

  const updateShiftDeptLocal = (shiftId, departmentId, field, value) => {
    setShiftGroups((prev) => prev.map((group) => {
      if (group.shiftId !== shiftId) return group;
      return {
        ...group,
        departments: group.departments.map((row) => (
          row.departmentId === departmentId ? { ...row, [field]: value } : row
        )),
      };
    }));
  };

  const saveShiftDept = async (row) => {
    const key = rowKey(row.shiftId, row.departmentId);
    setSavingKey(key);
    try {
      const { data } = await api.put(
        `/settings/shift-department-break-limits/${row.shiftId}/${row.departmentId}`,
        {
          mealStartLimit: Number(row.mealStartLimit),
          comfortStartLimit: Number(row.comfortStartLimit),
          mealLimitMinutes: Number(row.mealLimitMinutes),
          comfortLimitMinutes: Number(row.comfortLimitMinutes),
        },
      );
      setShiftGroups((prev) => prev.map((group) => {
        if (group.shiftId !== row.shiftId) return group;
        return {
          ...group,
          departments: group.departments.map((item) => (
            item.departmentId === row.departmentId ? data : item
          )),
        };
      }));
      toast.success(`Limits saved for ${data.departmentName} on ${data.shiftDisplay}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save shift/department limits.');
    } finally {
      setSavingKey(null);
    }
  };

  const saveShiftGroup = async (group) => {
    if (!group.departments?.length) return;
    setSavingShiftId(group.shiftId);
    try {
      const updated = [];
      for (const row of group.departments) {
        const { data } = await api.put(
          `/settings/shift-department-break-limits/${row.shiftId}/${row.departmentId}`,
          {
            mealStartLimit: Number(row.mealStartLimit),
            comfortStartLimit: Number(row.comfortStartLimit),
            mealLimitMinutes: Number(row.mealLimitMinutes),
            comfortLimitMinutes: Number(row.comfortLimitMinutes),
          },
        );
        updated.push(data);
      }
      setShiftGroups((prev) => prev.map((item) => (
        item.shiftId === group.shiftId
          ? { ...item, departments: updated }
          : item
      )));
      toast.success(`Limits saved for all departments on ${group.shiftDisplay}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save all limits for this shift.');
      await load();
    } finally {
      setSavingShiftId(null);
    }
  };

  const duration = settings.filter((s) => DURATION_KEYS.includes(s.key));
  const starts = settings.filter((s) => START_KEYS.includes(s.key));
  const otherAliasOrder = ['DailyBreakLimitMinutes', 'DailyMealBreakLimitMinutes'];
  const weatherSetting = settings.find((s) => s.key === PORTAL_WEATHER_KEY);
  const other = settings
    .filter((s) => !DURATION_KEYS.includes(s.key) && !START_KEYS.includes(s.key) && s.key !== PORTAL_WEATHER_KEY)
    .slice()
    .sort((a, b) => {
      const ai = otherAliasOrder.indexOf(a.key);
      const bi = otherAliasOrder.indexOf(b.key);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  return (
    <div className="page staff-console-page">
      <header className="page-header">
        <div>
          <h1>System Settings</h1>
          <p>Configure Meal and Comfort break limits by shift and department.</p>
        </div>
        <div className="header-stat-tiles">
          <div className="header-stat-tiles__row">
            <article className="header-stat-tile">
              <span>Shifts</span>
              <strong>{shiftGroups.length}</strong>
            </article>
          </div>
        </div>
      </header>

      <div className="list-switch" role="tablist" aria-label="Settings sections">
        <button
          type="button"
          role="tab"
          aria-selected={listView === 'shifts'}
          className={`list-switch__btn${listView === 'shifts' ? ' is-active' : ''}`}
          onClick={() => setListView('shifts')}
        >
          By shift
          <span className="list-switch__count">{shiftGroups.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listView === 'defaults'}
          className={`list-switch__btn${listView === 'defaults' ? ' is-active' : ''}`}
          onClick={() => setListView('defaults')}
        >
          Defaults
          <span className="list-switch__count">{duration.length + starts.length}</span>
        </button>
        {other.length > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={listView === 'other'}
            className={`list-switch__btn${listView === 'other' ? ' is-active' : ''}`}
            onClick={() => setListView('other')}
          >
            Other
            <span className="list-switch__count">{other.length}</span>
          </button>
        )}
        {isDeveloper && (
          <button
            type="button"
            role="tab"
            aria-selected={listView === 'adjust-time'}
            className={`list-switch__btn${listView === 'adjust-time' ? ' is-active' : ''}`}
            onClick={() => setListView('adjust-time')}
          >
            Adjust Time
          </button>
        )}
        {isDeveloper && (
          <button
            type="button"
            role="tab"
            aria-selected={listView === 'portal-weather'}
            className={`list-switch__btn${listView === 'portal-weather' ? ' is-active' : ''}`}
            onClick={() => setListView('portal-weather')}
          >
            Portal weather
          </button>
        )}
      </div>

      {listView === 'defaults' && (
        <>
          <section className="settings-list">
            <h2 className="settings-section-title">Default duration limits</h2>
            <p className="hint">
              Used when seeding new shift–department combinations. Existing configured rows keep their
              values until you change them below.
            </p>
            {duration.map((s) => (
              <SettingRow key={s.id} setting={s} min={1} max={240} onChange={updateLocal} onSave={save} />
            ))}
          </section>
          <section className="settings-list">
            <h2 className="settings-section-title">Default start limits for new departments</h2>
            <p className="hint">
              Used when a new department or shift–department row is created. Existing configured rows
              keep their values until you change them on the By shift tab.
            </p>
            {starts.map((s) => (
              <SettingRow key={s.id} setting={s} min={1} max={20} onChange={updateLocal} onSave={save} />
            ))}
          </section>
        </>
      )}

      {listView === 'shifts' && shiftGroups.map((group) => (
        <section className="settings-list" key={group.shiftId}>
          <div className="settings-shift-head">
            <div>
              <h2 className="settings-section-title">{group.shiftDisplay}</h2>
              <p className="hint">
                {group.isActive ? 'Active shift' : 'Inactive shift'} · {group.startTime} – {group.endTime}
                {group.spansNextDay ? ' (+1)' : ''}. Set Meal/Comfort start counts and duration limits
                for each department on this shift. Example: Data Team Meal starts 2 on Day shift and
                5 on Night shift.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={savingShiftId === group.shiftId || group.departments.length === 0}
              onClick={() => saveShiftGroup(group)}
            >
              {savingShiftId === group.shiftId ? 'Saving…' : 'Save all for this shift'}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Employees</th>
                  <th>Meal starts / shift</th>
                  <th>Comfort starts / shift</th>
                  <th>Meal limit (min)</th>
                  <th>Comfort limit (min)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.departments.map((row) => {
                  const key = rowKey(row.shiftId, row.departmentId);
                  return (
                    <tr key={key} className={row.departmentIsDeleted ? 'is-muted' : ''}>
                      <td className="col-name">
                        {row.departmentName}
                        {row.departmentIsDeleted ? ' (deleted)' : ''}
                      </td>
                      <td>{row.employeeCount}</td>
                      <td>
                        <input
                          className="dept-limit-input"
                          type="number"
                          min={1}
                          max={20}
                          value={row.mealStartLimit}
                          onChange={(e) => updateShiftDeptLocal(row.shiftId, row.departmentId, 'mealStartLimit', e.target.value)}
                          aria-label={`${row.departmentName} meal start limit on ${group.shiftName}`}
                        />
                      </td>
                      <td>
                        <input
                          className="dept-limit-input"
                          type="number"
                          min={1}
                          max={20}
                          value={row.comfortStartLimit}
                          onChange={(e) => updateShiftDeptLocal(row.shiftId, row.departmentId, 'comfortStartLimit', e.target.value)}
                          aria-label={`${row.departmentName} comfort start limit on ${group.shiftName}`}
                        />
                      </td>
                      <td>
                        <input
                          className="dept-limit-input"
                          type="number"
                          min={1}
                          max={240}
                          value={row.mealLimitMinutes}
                          onChange={(e) => updateShiftDeptLocal(row.shiftId, row.departmentId, 'mealLimitMinutes', e.target.value)}
                          aria-label={`${row.departmentName} meal duration on ${group.shiftName}`}
                        />
                      </td>
                      <td>
                        <input
                          className="dept-limit-input"
                          type="number"
                          min={1}
                          max={240}
                          value={row.comfortLimitMinutes}
                          onChange={(e) => updateShiftDeptLocal(row.shiftId, row.departmentId, 'comfortLimitMinutes', e.target.value)}
                          aria-label={`${row.departmentName} comfort duration on ${group.shiftName}`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={savingKey === key || savingShiftId === group.shiftId}
                          onClick={() => saveShiftDept(row)}
                        >
                          {savingKey === key ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {group.departments.length === 0 && (
                  <tr>
                    <td colSpan={7}>No departments found. Create departments first.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {listView === 'shifts' && shiftGroups.length === 0 && (
        <section className="settings-list">
          <p className="hint">No shifts found. Create shifts and departments first, then configure limits here.</p>
        </section>
      )}

      {listView === 'adjust-time' && isDeveloper && (
        <AdjustTimeSection />
      )}

      {listView === 'portal-weather' && isDeveloper && (
        <section className="settings-list">
          <h2 className="settings-section-title">Employee details weather</h2>
          <p className="hint">
            Developer only. Choose the effect in the employee details window on the break portal.
          </p>
          <div className="setting-row">
            <div>
              <strong>Portal weather</strong>
              <div className="muted">Nothing, rain, snow, ducks, birds, or falling watermelon, orange, clowns, bananas, stars, weed paper, and a masquerade joker. Applies only to the employee details window.</div>
              <div className="muted mono">{PORTAL_WEATHER_KEY}</div>
            </div>
            <div className="setting-edit">
              <select
                value={weatherSetting?.value || 'rain'}
                onChange={(e) => weatherSetting && updateLocal(weatherSetting.id, e.target.value)}
                aria-label="Portal weather"
              >
                {WEATHER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!weatherSetting}
                onClick={() => save(PORTAL_WEATHER_KEY, weatherSetting?.value || 'rain')}
              >
                Save
              </button>
            </div>
          </div>
        </section>
      )}

      {listView === 'other' && other.length > 0 && (
        <section className="settings-list">
          <h2 className="settings-section-title">Other settings</h2>
          {other.map((s) => (
            <div className="setting-row" key={s.id}>
              <div>
                <strong>{settingLabel(s.key)}</strong>
                <div className="muted">{s.description || '—'}</div>
                <div className="muted mono">{s.key}</div>
              </div>
              <div className="setting-edit">
                <input
                  value={s.value}
                  onChange={(e) => updateLocal(s.id, e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={() => save(s.key, s.value)}>Save</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
