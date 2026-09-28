import { useEffect, useRef, useState } from 'react';
import { PASSCODE_LENGTH, filterPasscodeInput, validatePasscode } from '../lib/passcode';

const SYMBOLS = ['!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '`', '{', '|', '}', '~'];

function PasscodeGuide() {
  return (
    <div className="passcode-guide">
      <div className="passcode-guide__head">
        <span className="passcode-guide__badge">{PASSCODE_LENGTH} characters</span>
        <span>Use any mix of the keys below</span>
      </div>
      <div className="passcode-guide__groups">
        <div className="passcode-guide__group">
          <span className="passcode-guide__label">Letters</span>
          <div className="passcode-guide__keys">
            <span className="passcode-key">A–Z</span>
            <span className="passcode-key">a–z</span>
          </div>
        </div>
        <div className="passcode-guide__group">
          <span className="passcode-guide__label">Numbers</span>
          <div className="passcode-guide__keys">
            <span className="passcode-key">0–9</span>
          </div>
        </div>
        <div className="passcode-guide__group passcode-guide__group--symbols">
          <span className="passcode-guide__label">Symbols</span>
          <div className="passcode-guide__keys passcode-guide__keys--symbols">
            {SYMBOLS.map((symbol) => (
              <span key={symbol} className="passcode-key passcode-key--symbol">{symbol}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaskedPasscodeField({ id, label, value, onChange, onError, autoFocus }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleChange = (event) => {
    const filtered = filterPasscodeInput(event.target.value);
    onChange(filtered.value);
    if (filtered.rejected.length) {
      const shown = [...new Set(filtered.rejected)].map((ch) => `'${ch}'`).join(', ');
      onError(`This character cannot be used: ${shown}. Use a letter, number, or keyboard symbol instead.`);
      return;
    }
    if (filtered.tooLong) {
      onError(`Passcode must be exactly ${PASSCODE_LENGTH} characters.`);
      return;
    }
    onError('');
  };

  return (
    <label className="passcode-field" htmlFor={id}>
      {label}
      <input
        ref={inputRef}
        id={id}
        type="password"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
        maxLength={PASSCODE_LENGTH}
        value={value}
        onChange={handleChange}
        placeholder="***"
      />
    </label>
  );
}

export default function PasscodeModal({
  mode,
  employee,
  breakType,
  action,
  timeLeftDisplay,
  serverError,
  busy,
  onSave,
  onVerify,
  onCancel,
}) {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [localError, setLocalError] = useState('');
  const [hoverReady, setHoverReady] = useState(false);

  useEffect(() => {
    setPasscode('');
    setConfirmPasscode('');
    setLocalError('');
    setHoverReady(false);
    const timer = window.setTimeout(() => setHoverReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [mode, employee?.employeeId]);

  const error = localError || serverError || '';
  const isCreate = mode === 'create';
  const title = isCreate
    ? 'Create your passcode'
    : `Enter passcode to ${action === 'end' ? 'end' : 'start'} ${breakType} break`;

  const submit = (event) => {
    event.preventDefault();
    const message = validatePasscode(passcode, {
      confirmValue: confirmPasscode,
      requireConfirm: isCreate,
    });
    if (message) {
      setLocalError(message);
      return;
    }
    if (isCreate) onSave(passcode, confirmPasscode);
    else onVerify(passcode);
  };

  return (
    <div className="confirm-overlay passcode-overlay" role="presentation">
      <form
        className={`confirm-dialog passcode-dialog${hoverReady ? ' confirm-dialog--interactive' : ''}`}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="passcode-title"
      >
        <h2 id="passcode-title">{title}</h2>
        <dl className="passcode-meta">
          <div>
            <dt>Employee</dt>
            <dd>{employee?.fullName || '—'}</dd>
          </div>
          <div>
            <dt>Employee code</dt>
            <dd>{employee?.employeeCode || '—'}</dd>
          </div>
          <div>
            <dt>Break type</dt>
            <dd>{breakType}</dd>
          </div>
          <div>
            <dt>Time left</dt>
            <dd>{timeLeftDisplay || '—'}</dd>
          </div>
        </dl>

        <MaskedPasscodeField
          id="employee-passcode"
          label="Passcode"
          value={passcode}
          onChange={setPasscode}
          onError={setLocalError}
          autoFocus
        />
        {isCreate && (
          <MaskedPasscodeField
            id="employee-passcode-confirm"
            label="Confirm passcode"
            value={confirmPasscode}
            onChange={setConfirmPasscode}
            onError={setLocalError}
          />
        )}

        {error && <p className="passcode-error" role="alert">{error}</p>}
        {isCreate && <PasscodeGuide />}

        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className={`btn ${
              action === 'end'
                ? 'btn-end-break'
                : isCreate
                  ? 'btn-primary'
                  : 'btn-start-break'
            }`}
            disabled={busy}
          >
            {busy ? 'Please wait…' : isCreate ? 'Save passcode' : action === 'end' ? 'End break' : 'Start break'}
          </button>
        </div>
      </form>
    </div>
  );
}
