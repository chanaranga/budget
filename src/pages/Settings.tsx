import { useState } from 'react';
import type { DropdownSettings } from '../types';

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

export default function Settings({ settings, onChange }: Props) {
  function update(key: SettingKey, items: string[]) {
    onChange({ ...settings, [key]: items });
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4">Settings — Dropdown Values</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
    </div>
  );
}
