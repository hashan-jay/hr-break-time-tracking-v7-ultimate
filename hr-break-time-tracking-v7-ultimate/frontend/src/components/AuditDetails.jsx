function toneFor(label) {
  const text = String(label || '').toLowerCase();
  if (text.includes('meal')) return 'meal';
  if (text.includes('comfort')) return 'comfort';
  if (text.includes('passcode') || text.includes('delete') || text.includes('deactivat')) return 'danger';
  if (text.includes('login') || text.includes('user') || text.includes('account') || text.includes('section') || text.includes('access')) return 'user';
  if (text.includes('duration') || text.includes('time') || text.includes('attempt')) return 'time';
  return 'neutral';
}

function prettyLabel(label) {
  const text = String(label || '').trim().replace(/'/g, '');
  if (/^meal$/i.test(text)) return 'Meal minutes';
  if (/^comfort$/i.test(text)) return 'Comfort minutes';
  return text;
}

function makeChange(label, from, to) {
  const name = prettyLabel(label);
  const hasFrom = from != null && String(from).trim() !== '';
  const fromText = hasFrom ? String(from).trim() : null;
  const toText = String(to ?? '').trim();
  const same = fromText != null && fromText === toText;
  return {
    label: name,
    from: fromText,
    to: toText,
    tone: toneFor(name),
    changed: fromText != null && !same,
    same,
  };
}

function parseSegment(segment) {
  const text = String(segment || '').trim().replace(/\.$/, '');
  if (!text) return null;

  let match = text.match(/^(.*?)\s+(\d+)\s*min\s*→\s*(\d+)\s*min$/i);
  if (match) return makeChange(match[1], `${match[2]} min`, `${match[3]} min`);

  match = text.match(/^(.*?)\s+(\d+)\s*→\s*(\d+)$/);
  if (match) return makeChange(match[1], match[2], match[3]);

  match = text.match(/^(.*?)\s+(.+?)\s*→\s*(.+)$/);
  if (match && match[1].length <= 42) return makeChange(match[1], match[2], match[3]);

  match = text.match(/^(.*?)\s+(\d+)\s*min$/i);
  if (match) return makeChange(match[1], null, `${match[2]} min`);

  match = text.match(/^(.*?)\s+(\d+)$/);
  if (match && match[1]) return makeChange(match[1], null, match[2]);

  if (!/\d|→/.test(text)) return makeChange('Included', null, text);
  return makeChange('Detail', null, text);
}

function cleanSummary(prefix) {
  return String(prefix || '')
    .replace(/^Updated limits for\s+/i, '')
    .replace(/^Updated start limits for\s+/i, '')
    .replace(/\s+on shift\s+/i, ' · ')
    .replace(/'/g, '')
    .replace(/\.$/, '')
    .trim();
}

function parseClause(clause) {
  const text = clause.trim().replace(/\.$/, '');
  if (!text) return null;
  const attempt = text.match(/^Attempt\s+(\d+)\s*\/\s*(\d+)$/i);
  if (attempt) return makeChange('Attempt', null, `${attempt[1]} of ${attempt[2]}`);
  const splitAt = text.indexOf(': ');
  if (splitAt > 0 && splitAt <= 48) {
    const label = text.slice(0, splitAt).trim();
    const value = text.slice(splitAt + 2).trim();
    const arrow = value.match(/^(.+?)\s*→\s*(.+)$/);
    if (arrow) return makeChange(label, arrow[1], arrow[2]);
    return makeChange(label, null, value);
  }
  return parseSegment(text);
}

export function parseAuditDetails(raw) {
  const text = String(raw || '').trim();
  if (!text) return { summary: '', changes: [] };

  const login = text.match(/^User '([^']+)' logged in\.?$/i);
  if (login) {
    return { summary: 'Signed in', changes: [makeChange('Account', null, login[1])] };
  }

  const setting = text.match(/^Updated setting '([^']+)' from '([^']*)' to '([^']*)'\.?$/i);
  if (setting) {
    return { summary: 'System setting', changes: [makeChange(setting[1], setting[2], setting[3])] };
  }

  const settingLegacy = text.match(/^Updated setting '([^']+)' to '([^']*)'\.?$/i);
  if (settingLegacy) {
    return { summary: 'System setting', changes: [makeChange(settingLegacy[1], null, settingLegacy[2])] };
  }

  const access = text.match(/^Updated (?:default )?section access for '?([^':]+?)'?:\s*(.*)$/i);
  if (access) {
    const names = access[2].replace(/\.$/, '').split(/,\s+/).map((name) => name.trim()).filter(Boolean);
    return {
      summary: access[1].trim(),
      changes: names.length
        ? names.map((name) => makeChange('Section', null, name))
        : [makeChange('Sections', null, 'None')],
    };
  }

  const listAt = text.lastIndexOf(': ');
  if (listAt > 0) {
    const tail = text.slice(listAt + 2).replace(/\.$/, '');
    const parts = tail.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
    const looksLikeList = parts.length >= 2 && parts.every((part) => part.length <= 80 && !part.includes(': '));
    if (looksLikeList) {
      return {
        summary: cleanSummary(text.slice(0, listAt)),
        changes: parts.map(parseSegment).filter(Boolean),
      };
    }
  }

  const clauses = text.replace(/\.$/, '').split(/\.\s+/).map((clause) => clause.trim()).filter(Boolean);
  if (clauses.length > 1 || clauses.some((clause) => clause.includes(': '))) {
    const changes = clauses.map(parseClause).filter(Boolean);
    if (changes.length) return { summary: '', changes };
  }

  const quoted = [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (quoted.length) {
    const summary = text
      .replace(/'[^']+'/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,])/g, '$1')
      .replace(/\.$/, '')
      .trim();
    return {
      summary,
      changes: quoted.map((name) => makeChange('Record', null, name)),
    };
  }

  return { summary: text.replace(/\.$/, ''), changes: [] };
}

export default function AuditDetails({ details }) {
  const parsed = parseAuditDetails(details);
  if (!parsed.summary && parsed.changes.length === 0) {
    return <span className="audit-details__empty">No extra detail</span>;
  }

  return (
    <div className="audit-details" title={details || undefined}>
      {parsed.summary && <p className="audit-details__summary">{parsed.summary}</p>}
      {parsed.changes.length > 0 && (
        <ul className="audit-details__changes">
          {parsed.changes.map((change, index) => (
            <li
              key={`${change.label}-${change.to}-${index}`}
              className={[
                'audit-change',
                `audit-change--${change.tone}`,
                change.changed ? 'is-changed' : '',
                change.same ? 'is-same' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="audit-change__label">{change.label}</span>
              <span className="audit-change__values">
                {change.changed && (
                  <>
                    <span className="audit-change__from">{change.from}</span>
                    <span className="audit-change__arrow" aria-hidden="true">→</span>
                  </>
                )}
                <span className="audit-change__to">{change.to || '—'}</span>
              </span>
              {change.changed && <span className="audit-change__flag">Changed</span>}
              {change.same && <span className="audit-change__flag">Unchanged</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
