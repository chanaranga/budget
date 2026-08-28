import { useState, useEffect } from 'react';
import type { DropdownSettings } from '../types';
import { api } from '../api';

interface Props {
  settings: DropdownSettings;
  onChange: (settings: DropdownSettings) => void;
}

type SettingKey = 'types' | 'categories' | 'subCategories';

function ListEditor({
  title,
  items,
  onUpdate,
}: {
  title: string;
  items: string[];
  onUpdate: (items: string[]) => void;
}) {
  const [newValue, setNewValue] = useState('');

  function add() {
    const v = newValue.trim();
    if (!v || items.includes(v)) return;
    onUpdate([...items, v].sort());
    setNewValue('');
  }

  function remove(item: string) {
    onUpdate(items.filter(i => i !== item));
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') add();
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 text-sm font-semibold">{title}</div>
      <div className="p-4">
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 border border-gray-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Add ${title.toLowerCase()}...`}
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            onClick={add}
            className="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded text-sm hover:bg-slate-300 dark:hover:bg-slate-500"
          >
            Add
          </button>
        </div>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {items.map(item => (
            <div key={item} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700 group">
              <span className="text-sm text-gray-700 dark:text-slate-200">{item}</span>
              <button
                onClick={() => remove(item)}
                className="text-gray-300 dark:text-slate-600 group-hover:text-red-500 text-xs px-1 transition-colors"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-slate-500 py-2 text-center">No items</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BunqSyncCard() {
  const [status, setStatus] = useState<{ connected: boolean; lastSync: string | null; accountId: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const s = await api.bunqStatus();
        if (!cancelled) setStatus(s);
      } catch {}
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function handleSetup() {
    setSettingUp(true);
    setMessage(null);
    try {
      const result = await api.bunqSetup();
      setMessage(`Connected. Account ID: ${result.accountId}`);
      const s = await api.bunqStatus();
      setStatus(s);
    } catch (err: unknown) {
      setMessage(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSettingUp(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await api.bunqSync();
      setMessage(`Synced: ${result.imported} new, ${result.updated} updated`);
      const s = await api.bunqStatus();
      setStatus(s);
    } catch (err: unknown) {
      setMessage(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  function formatLastSync(iso: string | null) {
    if (!iso) return 'Never';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)}h ago`;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        Bunq Sync
        {status?.connected && (
          <span className="ml-auto text-xs font-normal text-green-600 dark:text-green-400">● Connected</span>
        )}
        {status && !status.connected && (
          <span className="ml-auto text-xs font-normal text-slate-400">Not connected</span>
        )}
      </div>
      <div className="p-4 space-y-3">
        {status?.connected && (
          <div className="text-xs text-gray-500 dark:text-slate-400 space-y-0.5">
            <div>Last sync: {formatLastSync(status.lastSync)}</div>
            {status.accountId && <div>Account ID: {status.accountId}</div>}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {!status?.connected && (
            <button
              onClick={handleSetup}
              disabled={settingUp}
              className="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded text-sm hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50"
            >
              {settingUp ? 'Connecting…' : 'Setup Bunq'}
            </button>
          )}
          {status?.connected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded text-sm hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          )}
        </div>

        {message && (
          <p className="text-xs text-gray-600 dark:text-slate-300">{message}</p>
        )}

        {!status?.connected && (
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Requires <code className="font-mono">BUNQ_API_KEY</code> and <code className="font-mono">BUNQ_WEBHOOK_URL</code> set in Docker env.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Settings({ settings, onChange }: Props) {
  function update(key: SettingKey, items: string[]) {
    onChange({ ...settings, [key]: items });
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4">Settings — Dropdown Values</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <ListEditor
          title="Types"
          items={settings.types}
          onUpdate={items => update('types', items)}
        />
        <ListEditor
          title="Categories"
          items={settings.categories}
          onUpdate={items => update('categories', items)}
        />
        <ListEditor
          title="Sub Categories"
          items={settings.subCategories}
          onUpdate={items => update('subCategories', items)}
        />
      </div>
      <div className="max-w-sm">
        <BunqSyncCard />
      </div>
    </div>
  );
}
