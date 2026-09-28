import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FeedbackContext = createContext(null);
const TOAST_MS = 5000;
const MAX_TOASTS = 4;

function ToastIcon({ type }) {
  if (type === 'success') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M9.2 16.2 5.8 12.8l-1.4 1.4 4.8 4.8 10-10-1.4-1.4z" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const idRef = useRef(0);
  const timersRef = useRef(new Map());
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const confirmBtnRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((type, message) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = ++idRef.current;
    setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, type, message: text }]);
    const timer = setTimeout(() => dismissToast(id), TOAST_MS);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  const toast = useMemo(() => ({
    success: (message) => pushToast('success', message),
    error: (message) => pushToast('error', message),
    info: (message) => pushToast('info', message),
  }), [pushToast]);

  const finishDialog = useCallback((result) => {
    const current = dialogRef.current;
    dialogRef.current = null;
    setDialog(null);
    setPromptValue('');
    current?.resolve(result);
  }, []);

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      const next = {
        mode: 'confirm',
        title: opts.title || 'Please confirm',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        tone: opts.tone || 'primary',
        resolve,
      };
      dialogRef.current = next;
      setDialog(next);
    });
  }, []);

  const prompt = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      const next = {
        mode: 'prompt',
        title: opts.title || 'Enter a value',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Continue',
        cancelLabel: opts.cancelLabel || 'Cancel',
        tone: opts.tone || 'primary',
        inputType: opts.inputType || 'text',
        placeholder: opts.placeholder || '',
        resolve,
      };
      dialogRef.current = next;
      setPromptValue('');
      setDialog(next);
    });
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishDialog(dialog.mode === 'prompt' ? null : false);
      }
    };
    window.addEventListener('keydown', onKey);
    const focusTimer = window.setTimeout(() => {
      if (dialog.mode === 'prompt') inputRef.current?.focus();
      else confirmBtnRef.current?.focus();
    }, 20);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
    };
  }, [dialog, finishDialog]);

  const onDialogConfirm = (event) => {
    event?.preventDefault?.();
    if (!dialog) return;
    if (dialog.mode === 'prompt') {
      const value = promptValue.trim();
      if (!value) return;
      finishDialog(value);
      return;
    }
    finishDialog(true);
  };

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="feedback-root" aria-live="polite">
          <div className="toast-stack">
            {toasts.map((item) => (
              <div key={item.id} className={`toast toast--${item.type}`} role="status">
                <span className="toast__icon"><ToastIcon type={item.type} /></span>
                <p className="toast__message">{item.message}</p>
                <button
                  type="button"
                  className="toast__close"
                  onClick={() => dismissToast(item.id)}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
                <span className="toast__progress" />
              </div>
            ))}
          </div>

          {dialog && (
            <div className="confirm-overlay" onClick={() => finishDialog(dialog.mode === 'prompt' ? null : false)}>
              <form
                className={`confirm-dialog confirm-dialog--${dialog.tone}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                onClick={(event) => event.stopPropagation()}
                onSubmit={onDialogConfirm}
              >
                <h2 id="confirm-dialog-title">{dialog.title}</h2>
                {dialog.message && <p>{dialog.message}</p>}
                {dialog.mode === 'prompt' && (
                  <label className="confirm-dialog__field">
                    <span className="sr-only">{dialog.title}</span>
                    <input
                      ref={inputRef}
                      type={dialog.inputType}
                      value={promptValue}
                      placeholder={dialog.placeholder}
                      onChange={(event) => setPromptValue(event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                )}
                <div className="confirm-dialog__actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => finishDialog(dialog.mode === 'prompt' ? null : false)}
                  >
                    {dialog.cancelLabel}
                  </button>
                  <button
                    ref={confirmBtnRef}
                    type="submit"
                    className={`btn ${dialog.tone === 'danger' ? 'btn-danger' : dialog.tone === 'success' ? 'btn-success' : 'btn-primary'}`}
                    disabled={dialog.mode === 'prompt' && !promptValue.trim()}
                  >
                    {dialog.confirmLabel}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>,
        document.body,
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}
