import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import type { AuthUser } from '../auth';
import { ALLOWED_EMAILS } from '../auth';

interface JwtPayload {
  email: string;
  name: string;
  picture: string;
}

interface Props {
  onLogin: (user: AuthUser) => void;
}

export default function Login({ onLogin }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-1">Budget Tracker</h1>
        <p className="text-gray-400 dark:text-slate-500 text-sm mb-8">Sign in to continue</p>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={response => {
              if (!response.credential) return;
              const payload = jwtDecode<JwtPayload>(response.credential);
              if (!ALLOWED_EMAILS.includes(payload.email)) {
                alert(`Access denied for ${payload.email}`);
                return;
              }
              onLogin({ email: payload.email, name: payload.name, picture: payload.picture, token: response.credential });
            }}
            onError={() => alert('Login failed. Please try again.')}
            useOneTap
          />
        </div>

        <p className="text-xs text-gray-300 dark:text-slate-600 mt-6">Restricted access</p>
      </div>
    </div>
  );
}
