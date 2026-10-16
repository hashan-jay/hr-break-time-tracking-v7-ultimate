import { useTheme } from '../theme/ThemeContext';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.2v2.3M12 19.5v2.3M4.1 4.1l1.6 1.6M18.3 18.3l1.6 1.6M2.2 12h2.3M19.5 12h2.3M4.1 19.9l1.6-1.6M18.3 5.7l1.6-1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M15.1 2.3a8.8 8.8 0 1 0 6.6 14.8A7.7 7.7 0 0 1 15.1 2.3z" />
    </svg>
  );
}

export default function ThemeToggle({ compact = false, variant = 'pill' }) {
  const { setTheme, toggleTheme, isDark } = useTheme();

  if (variant === 'circle') {
    return (
      <button
        type="button"
        className={`theme-toggle theme-toggle--circle ${isDark ? 'is-dark' : 'is-light'}`}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-pressed={isDark}
        title={isDark ? 'Dark theme' : 'Light theme'}
        onClick={toggleTheme}
      >
        <span className="theme-toggle__glyph theme-toggle__glyph--sun">
          <SunIcon />
        </span>
        <span className="theme-toggle__glyph theme-toggle__glyph--moon">
          <MoonIcon />
        </span>
      </button>
    );
  }

  return (
    <div
      className={`theme-toggle ${isDark ? 'is-dark' : 'is-light'} ${compact ? 'theme-toggle--compact' : ''}`}
      role="group"
      aria-label="Theme"
    >
      <span className="theme-toggle__thumb" aria-hidden="true" />
      <button
        type="button"
        className="theme-toggle__word theme-toggle__word--light"
        aria-pressed={!isDark}
        onClick={() => setTheme('light')}
      >
        LIGHT
      </button>
      <button
        type="button"
        className="theme-toggle__word theme-toggle__word--dark"
        aria-pressed={isDark}
        onClick={() => setTheme('dark')}
      >
        DARK
      </button>
    </div>
  );
}
