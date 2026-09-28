import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle({ compact = false }) {
  const { setTheme, isDark } = useTheme();

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
