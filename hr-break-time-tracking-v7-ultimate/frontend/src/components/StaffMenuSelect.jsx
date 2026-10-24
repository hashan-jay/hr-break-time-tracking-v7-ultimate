import { useEffect, useRef, useState } from 'react';

export default function StaffMenuSelect({ value, onChange, label, options, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="staff-menu-select" ref={rootRef}>
      <button
        type="button"
        className="staff-menu-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.label || ''}
      </button>
      {open && (
        <ul className="portal-menu staff-menu-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <li key={option.value || 'all'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={isSelected ? 'is-active' : undefined}
                  onClick={() => {
                    if (option.disabled) return;
                    setOpen(false);
                    if (!isSelected) onChange(option.value);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
