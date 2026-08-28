import { NavLink } from 'react-router-dom';
import type { AuthUser } from '../auth';
import type { Theme } from '../App';

interface Props {
  user: AuthUser;
  onLogout: () => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
  if (theme === 'dark') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
  // system
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export default function Nav({ user, onLogout, theme, onThemeChange }: Props) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
    }`;

  return (
    <nav className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-3 flex items-center gap-2">
      <span className="font-bold text-gray-800 dark:text-slate-100 mr-4">Budget Tracker</span>
      <NavLink to="/summary" className={linkClass}>Summary</NavLink>
      <NavLink to="/day-to-day" className={linkClass}>Day-to-Day Costs</NavLink>
      <NavLink to="/recurring" className={linkClass}>Recurring Costs</NavLink>
      <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>
      <NavLink to="/settings" className={linkClass}>Settings</NavLink>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => onThemeChange(NEXT_THEME[theme])}
          title={`Theme: ${THEME_LABEL[theme]} (click to change)`}
          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ThemeIcon theme={theme} />
        </button>
        {user.picture && (
          <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
        )}
        <span className="text-sm text-gray-600 dark:text-slate-300">{user.name}</span>
        <button
          onClick={onLogout}
          className="text-sm text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
