import { NavLink } from 'react-router-dom';
import type { AuthUser } from '../auth';

interface Props {
  user: AuthUser;
  onLogout: () => void;
}

export default function Nav({ user, onLogout }: Props) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2">
      <span className="font-bold text-gray-800 mr-4">Finance Tracker</span>
      <NavLink to="/" end className={linkClass}>Transactions</NavLink>
      <NavLink to="/summary" className={linkClass}>Summary</NavLink>
      <NavLink to="/analytics" className={linkClass}>Analytics</NavLink>
      <NavLink to="/settings" className={linkClass}>Settings</NavLink>

      <div className="ml-auto flex items-center gap-3">
        {user.picture && (
          <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
        )}
        <span className="text-sm text-gray-600">{user.name}</span>
        <button
          onClick={onLogout}
          className="text-sm text-gray-400 hover:text-red-500 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
