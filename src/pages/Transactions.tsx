import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { Transaction, DropdownSettings } from '../types';
import { generateId, recalcAllMonths } from '../store';

interface Props {
  transactions: Transaction[];
  settings: DropdownSettings;
  onChange: (transactions: Transaction[]) => void;
  typeFilter?: string[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERABLE = new Set(['type', 'category', 'subCategory', 'budgeted', 'paidTo', 'bankText']);

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Allows typing a negative sign before the digits without losing it
function NumericInput({ value, onChange, className, inputRef }: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <input
      className={className}
      value={raw !== null ? raw : fmt(value)}
      onChange={e => {
        setRaw(e.target.value);
        const v = parseNum(e.target.value);
        if (v !== null) onChange(v);
      }}
      onBlur={e => {
        onChange(parseNum(e.target.value));
        setRaw(null);
      }}
      ref={inputRef}
    />
  );
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return n.toFixed(2);
}

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(',', '.'));
  return isNaN(v) ? null : v;
}

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string {
  const parts = display.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d.length <= 2 && m.length <= 2 && y.length === 4) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return '';
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [raw, setRaw] = useState(() => isoToDisplay(value));

  useEffect(() => { setRaw(isoToDisplay(value)); }, [value]);

  function handleChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0,2)}/${digits.slice(2)}`;
    setRaw(formatted);
  }

  function commit() {
    const iso = displayToIso(raw);
    if (iso) onChange(iso);
    else setRaw(isoToDisplay(value));
  }

  return (
    <input
      className="table-cell-input"
      value={raw}
      placeholder="DD/MM/YYYY"
      onChange={e => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') commit(); }}
    />
  );
}

function recalcInMonth(all: Transaction[], year: number, month: number, anchorId?: string, types?: string[]): Transaction[] {
  const inMonth = all
    .filter(t => {
      if (!t.date) return false;
      if (types && !types.includes(t.type)) return false;
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const anchorIdx = anchorId ? inMonth.findIndex(t => t.id === anchorId) : 0;

  const recalced = inMonth.reduce<Transaction[]>((acc, t, i) => {
    if (i < anchorIdx) return [...acc, t]; // leave rows before anchor untouched
    if (i === anchorIdx) {
      // Anchor row: keep its startBalance, recalculate endBalance only
      const end = t.startBalance !== null && t.amount !== null
        ? r2(t.startBalance + t.amount)
        : null;
      return [...acc, { ...t, endBalance: end }];
    }
    const prev = acc[i - 1];
    const start = prev.endBalance;
    const end = start !== null && t.amount !== null ? r2(start + t.amount) : null;
    return [...acc, { ...t, startBalance: start, endBalance: end }];
  }, []);

  const map = new Map(recalced.map(t => [t.id, t]));
  return all.map(t => map.get(t.id) ?? t);
}

const DEFAULT_WIDTHS: Record<string, number> = {
  date: 120, startBalance: 90, endBalance: 90, amount: 90,
  type: 125, category: 140, subCategory: 140,
  paidTo: 140, comment: 140, bankText: 260, budgeted: 90, excludeFromAnalytics: 60,
};

export default function Transactions({ transactions, settings, onChange, typeFilter }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const focusRowId = useRef<string | null>(null);

  // Column filters: col -> selected values (undefined = no filter / all shown)
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<{ top: number; left: number } | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Close filter panel on outside click
  useEffect(() => {
    if (!openFilter) return;
    function onDown(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openFilter]);

  function onResizeStart(key: string, e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[key];
    function onMove(ev: MouseEvent) {
      setColWidths(w => ({ ...w, [key]: Math.max(50, startW + ev.clientX - startX) }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const years = Array.from(
    new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1,
      ...transactions.map(t => t.date ? new Date(t.date).getFullYear() : now.getFullYear())])
  ).sort();

  // Month-filtered rows (before column filters)
  const monthFiltered = transactions
    .filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return false;
      if (typeFilter && !typeFilter.includes(t.type)) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Display rows: month filter + column filters
  const displayRows = monthFiltered.filter(t => {
    for (const [col, selected] of Object.entries(columnFilters)) {
      if (!selected || selected.length === 0) continue;
      const val = String(t[col as keyof Transaction] ?? '');
      if (!selected.includes(val)) return false;
    }
    return true;
  });

  const hasActiveFilters = Object.values(columnFilters).some(v => v && v.length > 0);

  // Unique values for a column, derived from the month-filtered set
  function getUniqueVals(col: string): string[] {
    const vals = new Set(monthFiltered.map(t => String(t[col as keyof Transaction] ?? '')));
    return Array.from(vals).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
  }

  function openColumnFilter(col: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (openFilter === col) { setOpenFilter(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFilterAnchor({ top: rect.bottom + 2, left: rect.left });
    setFilterSearch('');
    setOpenFilter(col);
  }

  function isValueChecked(col: string, val: string): boolean {
    const sel = columnFilters[col];
    if (!sel) return true;
    return sel.includes(val);
  }

  function toggleValue(col: string, val: string) {
    setColumnFilters(prev => {
      const allVals = getUniqueVals(col);
      const sel = prev[col] ?? allVals;
      const next = sel.includes(val) ? sel.filter(v => v !== val) : [...sel, val];
      if (next.length === allVals.length) {
        const { [col]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [col]: next };
    });
  }

  function toggleSelectAll(col: string) {
    setColumnFilters(prev => {
      const allVals = getUniqueVals(col);
      const sel = prev[col];
      const allChecked = !sel || sel.length === allVals.length;
      if (allChecked) {
        return { ...prev, [col]: [] };
      }
      const { [col]: _, ...rest } = prev;
      return rest;
    });
  }

  function clearFilter(col: string) {
    setColumnFilters(prev => {
      const { [col]: _, ...rest } = prev;
      return rest;
    });
  }

  function clearAllFilters() {
    setColumnFilters({});
  }

  function updateField(id: string, field: keyof Transaction, value: string | number | boolean | null) {
    let updated = transactions.map(t =>
      t.id !== id ? t : { ...t, [field]: value } as Transaction
    );
    if (field === 'amount' || field === 'date') {
      updated = recalcInMonth(updated, year, month, undefined, typeFilter);
    } else if (field === 'startBalance') {
      // Recalc forward from the edited row so the user's value isn't overwritten
      updated = recalcInMonth(updated, year, month, id, typeFilter);
    }
    onChange(updated);
  }

  function addRow() {
    const lastInMonth = monthFiltered[monthFiltered.length - 1];
    const dateStr = lastInMonth?.date ?? `${year}-${String(month).padStart(2, '0')}-01`;
    const newRow: Transaction = {
      id: generateId(),
      date: dateStr,
      startBalance: lastInMonth?.endBalance ?? null,
      endBalance: null,
      amount: null,
      type: typeFilter?.[0] ?? '',
      category: '',
      subCategory: '',
      paidTo: '',
      comment: '',
      bankText: '',
      budgeted: '',
      excludeFromAnalytics: false,
    };
    focusRowId.current = newRow.id;
    const updated = recalcInMonth([...transactions, newRow], year, month, undefined, typeFilter);
    onChange(updated);
  }

  function deleteRow(id: string) {
    const updated = recalcInMonth(transactions.filter(t => t.id !== id), year, month, undefined, typeFilter);
    onChange(updated);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    function parseDutchAmount(val: unknown): number | null {
      if (typeof val === 'number') return val;
      const str = String(val ?? '').trim();
      if (!str) return null;
      const n = parseFloat(str.replace(/\./g, '').replace(',', '.'));
      return isNaN(n) ? null : n;
    }

    function parseCSV(text: string): Record<string, string>[] {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) return [];
      function parseLine(line: string): string[] {
        const fields: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === ',' && !inQ) {
            fields.push(cur); cur = '';
          } else {
            cur += ch;
          }
        }
        fields.push(cur);
        return fields;
      }
      const headers = parseLine(lines[0]);
      return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = parseLine(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
        return obj;
      });
    }

    function extractRevolutPaidTo(desc: string): string {
      const fromMatch = desc.match(/^(?:Payment|Transfer) from (.+)$/i);
      if (fromMatch) return fromMatch[1];
      const toMatch = desc.match(/^To (.+?)(?:\s+via\s+.+)?$/i);
      if (toMatch) return toMatch[1];
      return desc;
    }

    function processRows(rows: Record<string, unknown>[]) {
      if (rows.length === 0) { setImportStatus('No rows found in file.'); return; }
      const cols = Object.keys(rows[0]);
      const isBunq = cols.includes('Date') && cols.includes('Amount') && cols.includes('Name') && cols.includes('Description');
      const isRevolut = cols.includes('Type') && cols.includes('Started Date') && cols.includes('Completed Date') && cols.includes('Balance');
      const isExisting = cols.includes('transactiondate') && cols.includes('amount') && cols.includes('description');
      if (!isBunq && !isRevolut && !isExisting) {
        setImportStatus(`Unrecognised file format. Columns found: ${cols.join(', ')}`);
        return;
      }

      const imported: Transaction[] = rows.map(row => {
        if (isBunq) {
          return {
            id: generateId(),
            date: String(row['Date'] ?? '').slice(0, 10),
            startBalance: null,
            endBalance: null,
            amount: parseDutchAmount(row['Amount']),
            type: typeFilter?.[0] ?? 'One off',
            category: '',
            subCategory: '',
            paidTo: String(row['Name'] ?? ''),
            comment: '',
            bankText: String(row['Description'] ?? ''),
            budgeted: '',
            excludeFromAnalytics: false,
          };
        } else if (isRevolut) {
          const desc = String(row['Description'] ?? '');
          const endBalRaw = parseFloat(String(row['Balance'] ?? ''));
          const endBal = isNaN(endBalRaw) ? null : endBalRaw;
          const amtRaw = parseFloat(String(row['Amount'] ?? ''));
          const amt = isNaN(amtRaw) ? null : amtRaw;
          const startBal = endBal !== null && amt !== null ? Math.round((endBal - amt) * 100) / 100 : null;
          return {
            id: generateId(),
            date: String(row['Started Date'] ?? '').slice(0, 10),
            startBalance: startBal,
            endBalance: endBal,
            amount: amt,
            type: typeFilter?.[0] ?? 'One off',
            category: '',
            subCategory: '',
            paidTo: extractRevolutPaidTo(desc),
            comment: '',
            bankText: desc,
            budgeted: '',
            excludeFromAnalytics: false,
          };
        } else {
          const ds = String(row['transactiondate'] ?? '');
          const dateStr = `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`;
          return {
            id: generateId(),
            date: dateStr,
            startBalance: parseDutchAmount(row['startsaldo']),
            endBalance: null,
            amount: parseDutchAmount(row['amount']),
            type: typeFilter?.[0] ?? 'One off',
            category: '',
            subCategory: '',
            paidTo: '',
            comment: '',
            bankText: String(row['description'] ?? ''),
            budgeted: 'Yes',
            excludeFromAnalytics: false,
          };
        }
      });

      const existingKeys = new Set(
        transactions.filter(t => t.bankText).map(t => `${t.date}|${t.amount}|${t.bankText}`)
      );
      const newRows = imported.filter(t => !existingKeys.has(`${t.date}|${t.amount}|${t.bankText}`));
      if (newRows.length === 0) { setImportStatus('All rows already imported.'); return; }

      const merged = recalcAllMonths([...transactions, ...newRows]);
      onChange(merged);
      const fmt = isBunq ? 'Bunq CSV' : isRevolut ? 'Revolut CSV' : 'bank export';
      setImportStatus(`Imported ${newRows.length} new row${newRows.length === 1 ? '' : 's'} from ${fmt}.`);
    }

    const reader = new FileReader();
    const isCsvFile = file.name.toLowerCase().endsWith('.csv');

    if (isCsvFile) {
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const rows = parseCSV(text) as Record<string, unknown>[];
        processRows(rows);
      };
      reader.readAsText(file, 'utf-8');
    } else {
      reader.onload = (ev) => {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true });
        processRows(rows);
      };
      reader.readAsBinaryString(file);
    }

    e.target.value = '';
  }

  const getOptions = useCallback((colType: string) => {
    if (colType === 'select-budgeted') return settings.budgetedOptions;
    if (colType === 'select-cat') return settings.categories;
    if (colType === 'select-sub') return settings.subCategories;
    if (colType === 'select-type') return settings.types;
    return [];
  }, [settings]);

  const COLUMNS: [string, string][] = [
    ['date',         'Date'],
    ['startBalance', 'Start Bal'],
    ['endBalance',   'End Bal'],
    ['amount',       'Amount'],
    ['type',         'Type'],
    ['category',     'Category'],
    ['subCategory',  'Sub Category'],
    ['paidTo',       'Paid To'],
    ['comment',      'Comment'],
    ['budgeted',              'Budgeted'],
    ['excludeFromAnalytics',  'Excl.'],
    ['bankText',              'Bank Text'],
  ];

  // Active filter panel data
  const activeFilterCol = openFilter;
  const activeAllVals = activeFilterCol ? getUniqueVals(activeFilterCol) : [];
  const activeSel = activeFilterCol ? columnFilters[activeFilterCol] : undefined;
  const activeAllChecked = !activeSel || activeSel.length === activeAllVals.length;
  const activeSomeChecked = !!(activeSel && activeSel.length > 0 && activeSel.length < activeAllVals.length);
  const activeDisplayVals = filterSearch
    ? activeAllVals.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : activeAllVals;

  return (
    <div className="flex flex-col h-full">
      {/* Filters & Actions — pinned, does not scroll */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0 px-4 pt-4 pb-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100"
        >
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <button
          onClick={addRow}
          className="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded text-sm hover:bg-slate-300 dark:hover:bg-slate-500"
        >
          + Add Row
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded text-sm hover:bg-slate-300 dark:hover:bg-slate-500"
        >
          {typeFilter ? 'Upload bank file' : 'Import Bank File'}
        </button>
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={handleImport} />
        {importStatus && (
          <span className="text-sm text-gray-500 dark:text-slate-400">{importStatus}</span>
        )}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">
          {hasActiveFilters
            ? `${displayRows.length} of ${monthFiltered.length} transactions`
            : `${monthFiltered.length} transactions`}
          {displayRows.length > 0 && (() => {
            const total = displayRows.reduce((s, t) => s + (t.amount ?? 0), 0);
            return ` | Net: €${total.toFixed(2)}`;
          })()}
        </span>
      </div>

      {/* Table — scrollable area */}
      <div className="flex-1 overflow-auto mx-4 my-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 select-none">
              {COLUMNS.map(([key, label]) => {
                const filterable = FILTERABLE.has(key);
                const hasFilter = !!(columnFilters[key] && columnFilters[key].length > 0);
                return (
                  <th
                    key={key}
                    style={{ width: colWidths[key], minWidth: colWidths[key] }}
                    className="relative px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-slate-400 border-r border-gray-200 dark:border-slate-700 overflow-hidden sticky top-0 bg-gray-50 dark:bg-slate-900 z-10"
                  >
                    <div className="flex items-center gap-0.5 pr-2">
                      <span className="truncate flex-1">{label}</span>
                      {filterable && (
                        <button
                          onClick={e => openColumnFilter(key, e)}
                          className={`flex-shrink-0 text-xs leading-none px-0.5 py-0.5 rounded transition-colors ${
                            hasFilter
                              ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                              : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                          }`}
                          title={`Filter by ${label}`}
                        >
                          ▾
                        </button>
                      )}
                    </div>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 active:bg-blue-500"
                      onMouseDown={e => onResizeStart(key, e)}
                    />
                  </th>
                );
              })}
              <th className="w-8 bg-gray-50 dark:bg-slate-900 sticky top-0 right-0 z-20 border-l border-gray-200 dark:border-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-400 dark:text-slate-500">
                  {hasActiveFilters
                    ? 'No transactions match the active filters.'
                    : `No transactions for ${MONTHS[month - 1]} ${year}. Add a row or upload a bank file.`}
                </td>
              </tr>
            )}
            {displayRows.map((t, rowIdx) => (
              <tr
                key={t.id}
                className={`border-b border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors ${
                  rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/50 dark:bg-slate-800/50'
                }`}
              >
                {/* Date */}
                <td style={{ width: colWidths.date, minWidth: colWidths.date }} className="relative px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <DateInput value={t.date} onChange={v => updateField(t.id, 'date', v)} />
                  {t.bunqId && (
                    <span className="absolute top-0.5 right-0.5 text-[9px] font-bold text-blue-400 dark:text-blue-500 leading-none pointer-events-none" title="Synced from Bunq">B</span>
                  )}
                </td>

                {/* Start Balance */}
                <td style={{ width: colWidths.startBalance, minWidth: colWidths.startBalance }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <NumericInput
                    className="table-cell-input text-right"
                    value={t.startBalance}
                    onChange={v => updateField(t.id, 'startBalance', v)}
                  />
                </td>

                {/* End Balance — always calculated */}
                <td style={{ width: colWidths.endBalance, minWidth: colWidths.endBalance }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <span className={`block text-right px-1 py-0.5 text-xs bg-gray-50 dark:bg-slate-900 rounded ${
                    t.endBalance !== null && t.endBalance < 0 ? 'text-red-500 amount-negative' : 'text-gray-500 dark:text-slate-400'
                  }`}>
                    {fmt(t.endBalance)}
                  </span>
                </td>

                {/* Amount */}
                <td style={{ width: colWidths.amount, minWidth: colWidths.amount }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <NumericInput
                    className={`table-cell-input text-right ${
                      t.amount !== null && t.amount < 0 ? 'text-red-600 amount-negative' :
                      t.amount !== null && t.amount > 0 ? 'text-green-700 amount-positive' : ''
                    }`}
                    value={t.amount}
                    onChange={v => updateField(t.id, 'amount', v)}
                    inputRef={el => {
                      if (el && focusRowId.current === t.id) {
                        el.focus();
                        el.select();
                        focusRowId.current = null;
                      }
                    }}
                  />
                </td>

                {/* Type */}
                <td style={{ width: colWidths.type, minWidth: colWidths.type }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <select className="table-cell-select" value={t.type}
                    onChange={e => updateField(t.id, 'type', e.target.value)}>
                    <option value=""></option>
                    {getOptions('select-type').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>

                {/* Category */}
                <td style={{ width: colWidths.category, minWidth: colWidths.category }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <select className="table-cell-select" value={t.category}
                    onChange={e => updateField(t.id, 'category', e.target.value)}>
                    <option value=""></option>
                    {getOptions('select-cat').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>

                {/* Sub Category */}
                <td style={{ width: colWidths.subCategory, minWidth: colWidths.subCategory }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <select className="table-cell-select" value={t.subCategory}
                    onChange={e => updateField(t.id, 'subCategory', e.target.value)}>
                    <option value=""></option>
                    {getOptions('select-sub').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>

                {/* Paid To */}
                <td style={{ width: colWidths.paidTo, minWidth: colWidths.paidTo }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <input className="table-cell-input" value={t.paidTo}
                    onChange={e => updateField(t.id, 'paidTo', e.target.value)} />
                </td>

                {/* Comment */}
                <td style={{ width: colWidths.comment, minWidth: colWidths.comment }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <input className="table-cell-input" value={t.comment}
                    onChange={e => updateField(t.id, 'comment', e.target.value)} />
                </td>

                {/* Budgeted */}
                <td style={{ width: colWidths.budgeted, minWidth: colWidths.budgeted }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <select className="table-cell-select" value={t.budgeted}
                    onChange={e => updateField(t.id, 'budgeted', e.target.value)}>
                    <option value=""></option>
                    {getOptions('select-budgeted').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>

                {/* Excl. from Analytics */}
                <td style={{ width: colWidths.excludeFromAnalytics, minWidth: colWidths.excludeFromAnalytics }} className="px-1 py-0.5 border-r border-gray-100 text-center">
                  <input
                    type="checkbox"
                    checked={t.excludeFromAnalytics}
                    onChange={e => updateField(t.id, 'excludeFromAnalytics', e.target.checked)}
                    className="cursor-pointer w-4 h-4 accent-blue-600"
                  />
                </td>

                {/* Bank Text */}
                <td style={{ width: colWidths.bankText, minWidth: colWidths.bankText }} className="px-1 py-0.5 border-r border-gray-100 overflow-hidden">
                  <input className="table-cell-input" value={t.bankText}
                    title={t.bankText}
                    onChange={e => updateField(t.id, 'bankText', e.target.value)} />
                </td>

                {/* Delete — sticky right so always visible when scrolling */}
                <td className={`sticky right-0 px-1 py-0.5 border-l border-gray-200 dark:border-slate-700 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-900'}`}>
                  <button onClick={() => deleteRow(t.id)}
                    className="text-red-400 hover:text-red-600 text-base px-1 font-bold transition-colors" title="Delete row">
                    ✕
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Column filter panel */}
      {openFilter && filterAnchor && activeFilterCol && (
        <div
          ref={filterPanelRef}
          style={{ position: 'fixed', top: filterAnchor.top, left: filterAnchor.left, zIndex: 1000 }}
          className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg shadow-xl w-56"
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-200 dark:border-slate-700">
            <input
              autoFocus
              className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
              placeholder="Search…"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
            />
          </div>
          {/* Select All */}
          <div className="px-2 py-1.5 border-b border-gray-200 dark:border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeAllChecked}
                ref={el => { if (el) el.indeterminate = activeSomeChecked; }}
                onChange={() => toggleSelectAll(activeFilterCol)}
                className="cursor-pointer"
              />
              <span className="text-xs font-medium text-gray-700 dark:text-slate-200">(Select All)</span>
              <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">{activeAllVals.length}</span>
            </label>
          </div>
          {/* Value list */}
          <div className="max-h-52 overflow-y-auto">
            {activeDisplayVals.map(val => (
              <label key={val} className="flex items-center gap-2 px-2 py-0.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isValueChecked(activeFilterCol, val)}
                  onChange={() => toggleValue(activeFilterCol, val)}
                  className="cursor-pointer flex-shrink-0"
                />
                <span className="text-xs text-gray-700 dark:text-slate-200 truncate" title={val}>
                  {val === '' ? <span className="text-gray-400 dark:text-slate-500 italic">(blank)</span> : val}
                </span>
              </label>
            ))}
            {activeDisplayVals.length === 0 && (
              <div className="px-2 py-3 text-xs text-gray-400 dark:text-slate-500 text-center">No matches</div>
            )}
          </div>
          {/* Footer */}
          <div className="px-2 py-1.5 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
            <button
              onClick={() => { clearFilter(activeFilterCol); setOpenFilter(null); }}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear
            </button>
            <button
              onClick={() => setOpenFilter(null)}
              className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-300 dark:hover:bg-slate-500"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
