import { useState } from 'react';
import type { Transaction } from '../types';

interface Props {
  transactions: Transaction[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface FlatRow {
  cols: string[];
  amount: number;
  isSubtotal: boolean;
  isTotal: boolean;
}

function buildFlatRows(
  transactions: Transaction[],
  extractors: ((t: Transaction) => string)[]
): FlatRow[] {
  if (transactions.length === 0) return [];

  // Group recursively, then flatten with subtotals
  function group(items: Transaction[], level: number, prefix: string[]): FlatRow[] {
    const rows: FlatRow[] = [];
    const map = new Map<string, Transaction[]>();
    for (const t of items) {
      const key = extractors[level](t) || '(blank)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [key, group_items] of sorted) {
      const isLast = level === extractors.length - 1;
      const colPrefix = [...prefix, key];

      if (isLast) {
        const amount = group_items.reduce((s, t) => s + (t.amount ?? 0), 0);
        // Pad cols to full width
        const cols = [...colPrefix, ...Array(extractors.length - colPrefix.length).fill('')];
        rows.push({ cols, amount, isSubtotal: false, isTotal: false });
      } else {
        // Recurse into sub-levels
        const children = group(group_items, level + 1, colPrefix);
        rows.push(...children);

      }
    }
    return rows;
  }

  const dataRows = group(transactions, 0, []);
  const grandTotal = dataRows.filter(r => !r.isSubtotal).reduce((s, r) => s + r.amount, 0);
  dataRows.push({ cols: Array(extractors.length).fill(''), amount: grandTotal, isSubtotal: false, isTotal: true });
  return dataRows;
}

function WriteOffTable({ transactions }: { transactions: Transaction[] }) {
  const amtClass = (v: number) => v < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400';
  const total = transactions.reduce((s, t) => s + (t.amount ?? 0), 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="bg-blue-600 text-white px-4 py-2 text-sm font-semibold">Write-off</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <tr>
              {['Category', 'Sub Category', 'Paid To'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400 dark:text-slate-500">No data</td></tr>
            )}
            {transactions.map(t => (
              <tr key={t.id} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                <td className="px-3 py-1.5 text-sm text-gray-700 dark:text-slate-200">{t.category}</td>
                <td className="px-3 py-1.5 text-sm text-gray-700 dark:text-slate-200">{t.subCategory}</td>
                <td className="px-3 py-1.5 text-sm text-gray-700 dark:text-slate-200">{t.paidTo}</td>
                <td className={`px-3 py-1.5 text-right text-sm tabular-nums ${amtClass(t.amount ?? 0)}`}>
                  €{(t.amount ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
            {transactions.length > 0 && (
              <tr className="border-t-2 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 font-bold">
                <td colSpan={3} className="px-3 py-2 text-sm dark:text-slate-100">Total</td>
                <td className={`px-3 py-2 text-right text-sm ${amtClass(total)}`}>€{total.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlatTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: FlatRow[];
}) {
  const amtClass = (v: number) => v < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="bg-blue-600 text-white px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <tr>
              {headers.map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={headers.length + 1} className="px-3 py-6 text-center text-gray-400 dark:text-slate-500">No data</td></tr>
            )}
            {rows.map((row, i) => {
              if (row.isTotal) {
                return (
                  <tr key={i} className="border-t-2 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 font-bold">
                    <td colSpan={headers.length} className="px-3 py-2 text-sm dark:text-slate-100">Grand Total</td>
                    <td className={`px-3 py-2 text-right text-sm ${amtClass(row.amount)}`}>
                      €{row.amount.toFixed(2)}
                    </td>
                  </tr>
                );
              }
              if (row.isSubtotal) {
                return (
                  <tr key={i} className="border-t border-gray-200 bg-gray-50/80 font-medium">
                    {row.cols.map((c, j) => (
                      <td key={j} className="px-3 py-1 text-sm text-gray-600">{c}</td>
                    ))}
                    <td className={`px-3 py-1 text-right text-sm ${amtClass(row.amount)}`}>
                      €{row.amount.toFixed(2)}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={i} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                  {row.cols.map((c, j) => (
                    <td key={j} className="px-3 py-1.5 text-sm text-gray-700 dark:text-slate-200">{c}</td>
                  ))}
                  <td className={`px-3 py-1.5 text-right text-sm tabular-nums ${amtClass(row.amount)}`}>
                    €{row.amount.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Analytics({ transactions }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const years = Array.from(
    new Set([now.getFullYear() - 1, now.getFullYear(),
      ...transactions.map(t => t.date ? new Date(t.date).getFullYear() : now.getFullYear())])
  ).sort();

  const filtered = transactions.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  const included = filtered.filter(t => !t.excludeFromAnalytics);

  const oneOffBudgeted   = included.filter(t => t.type === 'One off' && t.budgeted === 'Yes');
  const recurringBudgeted = included.filter(t => t.type === 'Reccuring' && t.budgeted === 'Yes');
  const notBudgeted      = included.filter(t => t.budgeted === 'No');
  const moneyIn          = included.filter(t => t.category === 'Money In');
  const writeOff         = included.filter(t => t.budgeted === 'WO');

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-5">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100">
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <span className="text-sm text-gray-500 dark:text-slate-400">{filtered.length} transactions · {MONTHS[month - 1]} {year}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FlatTable
          title="One-off Budgeted"
          headers={['Category', 'Sub Category']}
          rows={buildFlatRows(oneOffBudgeted, [t => t.category, t => t.subCategory])}
        />
        <FlatTable
          title="Recurring Budgeted"
          headers={['Category', 'Sub Category']}
          rows={buildFlatRows(recurringBudgeted, [t => t.category, t => t.subCategory])}
        />
        <FlatTable
          title="Not Budgeted"
          headers={['Category', 'Paid To']}
          rows={buildFlatRows(notBudgeted, [t => t.category, t => t.paidTo])}
        />
        <FlatTable
          title="Money In"
          headers={['Category', 'Sub Category', 'Paid To']}
          rows={buildFlatRows(moneyIn, [t => t.category, t => t.subCategory, t => t.paidTo])}
        />
        <WriteOffTable transactions={writeOff} />
      </div>
    </div>
  );
}
