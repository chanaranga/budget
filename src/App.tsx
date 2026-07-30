import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Nav from './components/Nav';
import Transactions from './pages/Transactions';
import Analytics from './pages/Analytics';
import Summary from './pages/Summary';
import Settings from './pages/Settings';
import Login from './pages/Login';
import type { AppData } from './types';
import type { AuthUser } from './auth';
import { DEFAULT_SETTINGS } from './types';
import { recalcAllMonths } from './store';
import { getStoredUser, storeUser, clearUser } from './auth';
import { api } from './api';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

const EMPTY: AppData = { transactions: [], settings: DEFAULT_SETTINGS };

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [data, setData] = useState<AppData>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Load data from API whenever user logs in
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([api.getTransactions(), api.getSettings()])
      .then(([transactions, settings]) => {
        setData({ transactions: recalcAllMonths(transactions), settings });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.email]);

  function handleLogin(u: AuthUser) {
    storeUser(u);
    setUser(u);
  }

  function handleLogout() {
    clearUser();
    setUser(null);
    setData(EMPTY);
  }

  // Diff old vs new transactions and sync only what changed
  const handleTransactionsChange = useCallback(async (next: ReturnType<typeof recalcAllMonths>) => {
    const prev = data.transactions;
    const prevMap = new Map(prev.map(t => [t.id, t]));
    const nextMap = new Map(next.map(t => [t.id, t]));

    const added   = next.filter(t => !prevMap.has(t.id));
    const deleted = prev.filter(t => !nextMap.has(t.id));
    const updated = next.filter(t => {
      const old = prevMap.get(t.id);
      return old && JSON.stringify(old) !== JSON.stringify(t);
    });

    // Optimistic update
    setData(d => ({ ...d, transactions: next }));

    await Promise.all([
      ...added.map(t => api.createTransaction(t)),
      ...deleted.map(t => api.deleteTransaction(t.id)),
      ...updated.map(t => api.updateTransaction(t)),
    ]);
  }, [data.transactions]);

  const handleSettingsChange = useCallback(async (settings: AppData['settings']) => {
    setData(d => ({ ...d, settings }));
    await api.updateSettings(settings);
  }, []);

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      {!user ? (
        <Login onLogin={handleLogin} />
      ) : loading ? (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
          Loading…
        </div>
      ) : (
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50">
            <Nav user={user} onLogout={handleLogout} />
            <Routes>
              <Route path="/" element={
                <Transactions
                  transactions={data.transactions}
                  settings={data.settings}
                  onChange={handleTransactionsChange}
                />
              } />
              <Route path="/summary" element={
                <Summary transactions={data.transactions} />
              } />
              <Route path="/analytics" element={
                <Analytics transactions={data.transactions} />
              } />
              <Route path="/settings" element={
                <Settings
                  settings={data.settings}
                  onChange={handleSettingsChange}
                />
              } />
            </Routes>
          </div>
        </BrowserRouter>
      )}
    </GoogleOAuthProvider>
  );
}
