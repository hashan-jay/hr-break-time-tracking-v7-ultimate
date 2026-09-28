import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle({ compact = false }) {
  const { toggleTheme, isDark } = useTheme();
  const label = isDark ? 'DARK' : 'LIGHT';

  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? 'is-dark' : 'is-light'} ${compact ? 'theme-toggle--compact' : ''}`}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'DARK theme. Switch to LIGHT' : 'LIGHT theme. Switch to DARK'}
      title={isDark ? 'Switch to LIGHT' : 'Switch to DARK'}
      onClick={toggleTheme}
    >
      <span className="theme-toggle__word">{label}</span>
    </button>
  );
}
