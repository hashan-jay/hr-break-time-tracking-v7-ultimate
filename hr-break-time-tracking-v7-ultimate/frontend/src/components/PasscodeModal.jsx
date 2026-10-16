import { useEffect, useRef, useState } from 'react';
import { PASSCODE_LENGTH, PASSCODE_MAX_ATTEMPTS, filterPasscodeInput, validatePasscode } from '../lib/passcode';

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

function PasscodeEntry({
  id,
  label,
  value,
  onChange,
  onError,
  autoFocus,
  revealed,
  onToggleReveal,
  tone,
  invalid,
  busy,
}) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

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

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' || value.length === PASSCODE_LENGTH) return;
    event.preventDefault();
    onError(`Passcode must be exactly ${PASSCODE_LENGTH} characters.`);
  };

  const activeIndex = Math.min(value.length, PASSCODE_LENGTH - 1);
  const complete = value.length === PASSCODE_LENGTH;

  return (
    <div className={`passcode-entry passcode-entry--${tone}${invalid ? ' is-invalid' : ''}${complete ? ' is-complete' : ''}`}>
      <div className="passcode-entry__head">
        <label htmlFor={id}>{label}</label>
        <div className="passcode-entry__tools">
          <span className="passcode-entry__count">{value.length} / {PASSCODE_LENGTH}</span>
          {onToggleReveal && (
            <button
              type="button"
              className="passcode-reveal"
              onClick={onToggleReveal}
              aria-pressed={revealed}
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
      </div>
      <div
        className="passcode-slots"
        onMouseDown={(event) => {
          if (event.target === inputRef.current) return;
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {Array.from({ length: PASSCODE_LENGTH }, (_, index) => {
          const filled = index < value.length;
          const active = focused && !complete && index === activeIndex;
          const showChar = filled && revealed;
          return (
            <span
              key={index}
              className={[
                'passcode-slot',
                filled ? 'is-filled' : '',
                active ? 'is-active' : '',
              ].filter(Boolean).join(' ')}
              aria-hidden="true"
            >
              {showChar ? value[index] : filled ? '•' : ''}
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          className="passcode-slots__input"
          type="password"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          maxLength={PASSCODE_LENGTH}
          value={value}
          disabled={busy}
          aria-invalid={invalid || undefined}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
    </div>
  );
}

export default function PasscodeModal({
  mode,
  employee,
  breakType,
  action,
  timeLeftDisplay,
  attemptsLeft,
  serverError,
  busy,
  onSave,
  onVerify,
  onCancel,
}) {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [localError, setLocalError] = useState('');
  const [dismissedServerError, setDismissedServerError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hoverReady, setHoverReady] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const announcedError = useRef('');

  useEffect(() => {
    setPasscode('');
    setConfirmPasscode('');
    setLocalError('');
    setDismissedServerError(false);
    setRevealed(false);
    setHoverReady(false);
    const timer = window.setTimeout(() => setHoverReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [mode, employee?.employeeId]);

  useEffect(() => {
    if (!serverError) return undefined;
    setPasscode('');
    setConfirmPasscode('');
    setLocalError('');
    setDismissedServerError(false);
    const focusTimer = window.setTimeout(() => {
      document.getElementById('employee-passcode')?.focus();
    }, 30);
    return () => window.clearTimeout(focusTimer);
  }, [serverError]);

  useEffect(() => {
    if (!shakeKey) return undefined;
    setShaking(true);
    const timer = window.setTimeout(() => setShaking(false), 460);
    return () => window.clearTimeout(timer);
  }, [shakeKey]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const error = localError || (dismissedServerError ? '' : serverError) || '';

  useEffect(() => {
    if (!error) {
      announcedError.current = '';
      return undefined;
    }
    if (error === announcedError.current) return undefined;
    announcedError.current = error;
    setShakeKey((key) => key + 1);
    return undefined;
  }, [error]);

  const isCreate = mode === 'create';
  const isEnd = action === 'end';
  const tone = isEnd ? 'end' : 'start';
  const title = isCreate
    ? 'Create your passcode'
    : `Enter passcode to ${isEnd ? 'end' : 'start'} ${breakType} break`;
  const passcodeReady = passcode.length === PASSCODE_LENGTH;
  const confirmReady = !isCreate || (confirmPasscode.length === PASSCODE_LENGTH && confirmPasscode === passcode);
  const canSubmit = passcodeReady && confirmReady && !busy;
  const attempts = Number.isFinite(Number(attemptsLeft)) ? Number(attemptsLeft) : null;
  const breakTone = String(breakType || '').toLowerCase() === 'comfort' ? 'comfort' : 'meal';

  const note = (() => {
    if (busy) return 'Checking passcode…';
    if (!passcode.length) return 'Type your 3-character passcode. Each circle fills as you go.';
    if (!passcodeReady) {
      const left = PASSCODE_LENGTH - passcode.length;
      return `${left} more ${left === 1 ? 'character' : 'characters'}.`;
    }
    if (isCreate && confirmPasscode.length < PASSCODE_LENGTH) return 'Now type the same passcode again to confirm.';
    if (isCreate && confirmPasscode !== passcode) return 'Those two passcodes do not match yet.';
    if (isCreate) return 'Passcodes match. Press Enter or Save passcode.';
    return isEnd ? 'Press Enter or End break.' : 'Press Enter or Start break.';
  })();

  const submitLabel = busy
    ? 'Please wait…'
    : isCreate
      ? 'Save passcode'
      : isEnd
        ? 'End break'
        : 'Start break';

  const submit = (event) => {
    event.preventDefault();
    const message = validatePasscode(passcode, {
      confirmValue: confirmPasscode,
      requireConfirm: isCreate,
    });
    if (message) {
      setLocalError(message);
      setShakeKey((key) => key + 1);
      return;
    }
    if (isCreate) onSave(passcode, confirmPasscode);
    else onVerify(passcode);
  };

  const editPasscode = (value) => {
    setPasscode(value);
    if (serverError) setDismissedServerError(true);
  };

  return (
    <div className="confirm-overlay passcode-overlay" role="presentation">
      <form
        className={`confirm-dialog passcode-dialog passcode-dialog--${tone}${hoverReady ? ' confirm-dialog--interactive' : ''}${shaking ? ' is-shaking' : ''}`}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="passcode-title"
      >
        <h2 id="passcode-title">{title}</h2>
        <dl className="passcode-meta">
          <div className="passcode-meta__item">
            <dt>Employee</dt>
            <dd>{employee?.fullName || '—'}</dd>
          </div>
          <div className="passcode-meta__item">
            <dt>Employee code</dt>
            <dd>{employee?.employeeCode || '—'}</dd>
          </div>
          <div className="passcode-meta__item">
            <dt>Break type</dt>
            <dd>
              <span className={`passcode-type passcode-type--${breakTone}`}>{breakType}</span>
            </dd>
          </div>
          <div className="passcode-meta__item">
            <dt>Time left</dt>
            <dd className={`passcode-time${isEnd ? ' is-live' : ''}`}>{timeLeftDisplay || '—'}</dd>
          </div>
        </dl>

        <PasscodeEntry
          id="employee-passcode"
          label="Passcode"
          value={passcode}
          onChange={editPasscode}
          onError={setLocalError}
          autoFocus
          revealed={revealed}
          onToggleReveal={() => setRevealed((current) => !current)}
          tone={tone}
          invalid={Boolean(error)}
          busy={busy}
        />
        {isCreate && (
          <PasscodeEntry
            id="employee-passcode-confirm"
            label="Confirm passcode"
            value={confirmPasscode}
            onChange={setConfirmPasscode}
            onError={setLocalError}
            revealed={revealed}
            tone={tone}
            invalid={confirmPasscode.length === PASSCODE_LENGTH && confirmPasscode !== passcode}
            busy={busy}
          />
        )}

        <p className="passcode-note" aria-live="polite">{note}</p>
        {error && <p className="passcode-error" role="alert">{error}</p>}
        {!isCreate && attempts != null && (
          <p className={`passcode-attempts${attempts <= 1 ? ' is-low' : ''}`}>
            <span className="passcode-attempts__dots" aria-hidden="true">
              {Array.from({ length: PASSCODE_MAX_ATTEMPTS }, (_, index) => (
                <span key={index} className={index < attempts ? 'is-left' : 'is-used'} />
              ))}
            </span>
            <span>{attempts} {attempts === 1 ? 'attempt' : 'attempts'} left</span>
          </p>
        )}
        {isCreate && <PasscodeGuide />}

        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className={`btn ${
              isEnd
                ? 'btn-end-break'
                : isCreate
                  ? 'btn-primary'
                  : 'btn-start-break'
            }${canSubmit ? ' is-ready' : ''}`}
            disabled={!canSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
