import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FeedbackContext = createContext(null);
const TOAST_MS = 5000;
const MAX_TOASTS = 4;

const DISMISS_DRAG = 56;
const RING = 2 * Math.PI * 15;

const TOAST_LABEL = {
  success: 'Success',
  error: 'Alert',
  info: 'Notice',
};

function ToastIcon({ type }) {
  if (type === 'success') {
    return (
      <svg className="toast__glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 12.5 10.2 16.5 18 8" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg className="toast__glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 4.5 20.5 19.5h-17L12 4.5z" />
        <path d="M12 10v4.2" />
        <path d="M12 16.8h.01" />
      </svg>
    );
  }
  return (
    <svg className="toast__glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function ToastCard({ item, onPause, onResume, onDismiss }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const pointerId = useRef(null);
  const hovering = useRef(false);
  const dragRef = useRef(0);
  const remaining = useRef(TOAST_MS);
  const [held, setHeld] = useState(false);
  const [ratio, setRatio] = useState(1);
  const readyToDismiss = dragY > DISMISS_DRAG;
  const paused = held || dragging || item.leaving;

  useEffect(() => {
    if (paused) return undefined;
    const start = performance.now();
    const from = remaining.current;
    const timer = window.setInterval(() => {
      const next = Math.max(0, from - (performance.now() - start));
      setRatio(next / TOAST_MS);
    }, 80);
    return () => {
      remaining.current = Math.max(0, from - (performance.now() - start));
      window.clearInterval(timer);
    };
  }, [paused]);

  const onPointerDown = (event) => {
    if (item.leaving || event.target.closest('.toast__close')) return;
    pointerId.current = event.pointerId;
    startY.current = event.clientY;
    setDragging(true);
    onPause();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragging || event.pointerId !== pointerId.current) return;
    const next = Math.max(0, event.clientY - startY.current);
    dragRef.current = next;
    setDragY(next);
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId.current) return;
    const dropped = dragRef.current > DISMISS_DRAG;
    setDragging(false);
    pointerId.current = null;
    dragRef.current = 0;
    if (dropped) {
      onDismiss();
      return;
    }
    setDragY(0);
    if (!(event.pointerType === 'mouse' && hovering.current)) onResume();
  };

  const seconds = Math.max(0, Math.ceil((ratio * TOAST_MS) / 1000));
  const hint = dragging
    ? (readyToDismiss ? 'Release to close' : 'Drag down to close')
    : `Holding · ${seconds}s`;

  return (
    <div
      className={[
        'toast',
        `toast--${item.type}`,
        dragging ? 'is-dragging' : '',
        readyToDismiss ? 'is-dismissing' : '',
        item.leaving ? 'is-leaving' : '',
      ].filter(Boolean).join(' ')}
      role="status"
      style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={() => {
        hovering.current = true;
        setHeld(true);
        onPause();
      }}
      onMouseLeave={() => {
        hovering.current = false;
        setHeld(false);
        if (!dragging) onResume();
      }}
      onFocus={() => onPause()}
      onBlur={() => {
        if (!dragging) onResume();
      }}
    >
      <span className="toast__grip" aria-hidden="true" />
      <span className="toast__icon">
        <svg className="toast__ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle className="toast__ring-track" cx="18" cy="18" r="15" />
          <circle
            className="toast__ring-value"
            cx="18"
            cy="18"
            r="15"
            style={{ strokeDasharray: RING, strokeDashoffset: (1 - ratio) * RING }}
          />
        </svg>
        <ToastIcon type={item.type} />
      </span>
      <div className="toast__copy">
        <p className="toast__kicker">{TOAST_LABEL[item.type] || 'Notice'}</p>
        <p className="toast__message">{item.message}</p>
        <p className="toast__hint">{hint}</p>
      </div>
      <button
        type="button"
        className="toast__close"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const idRef = useRef(0);
  const timersRef = useRef(new Map());
  const leavingRef = useRef(new Set());
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const confirmBtnRef = useRef(null);

  const dismissToast = useCallback((id) => {
    if (leavingRef.current.has(id)) return;
    leavingRef.current.add(id);
    setToasts((list) => list.map((item) => (
      item.id === id ? { ...item, leaving: true } : item
    )));
    const entry = timersRef.current.get(id);
    if (entry?.timeout) clearTimeout(entry.timeout);
    timersRef.current.delete(id);
    window.setTimeout(() => {
      leavingRef.current.delete(id);
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 220);
  }, []);

  const armToast = useCallback((id, delay) => {
    const timeout = setTimeout(() => dismissToast(id), delay);
    timersRef.current.set(id, { timeout, remaining: delay, startedAt: Date.now() });
  }, [dismissToast]);

  const pauseToast = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (!entry?.timeout) return;
    clearTimeout(entry.timeout);
    const elapsed = Date.now() - entry.startedAt;
    timersRef.current.set(id, {
      timeout: null,
      remaining: Math.max(0, entry.remaining - elapsed),
      startedAt: Date.now(),
    });
  }, []);

  const resumeToast = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (!entry || entry.timeout) return;
    armToast(id, entry.remaining);
  }, [armToast]);

  const pushToast = useCallback((type, message) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = ++idRef.current;
    setToasts((list) => {
      const next = [{ id, type, message: text, leaving: false }, ...list].slice(0, MAX_TOASTS);
      const kept = new Set(next.map((item) => item.id));
      list.forEach((item) => {
        if (kept.has(item.id)) return;
        const entry = timersRef.current.get(item.id);
        if (entry?.timeout) clearTimeout(entry.timeout);
        timersRef.current.delete(item.id);
      });
      return next;
    });
    armToast(id, TOAST_MS);
  }, [armToast]);

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
              <ToastCard
                key={item.id}
                item={item}
                onPause={() => pauseToast(item.id)}
                onResume={() => resumeToast(item.id)}
                onDismiss={() => dismissToast(item.id)}
              />
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
