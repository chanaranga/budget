import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transaction } from '../types';
import { api } from '../api';
import type { SummaryData } from '../api';

interface Props {
  transactions: Transaction[];
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const EMPTY_DATA: SummaryData = {
  recurringBudgets: {},
  oneoffBudgets: {},
  salary: 0,
  fromPrevious: 0,
  moneyInRows: [
    { label: 'Umesha budget gap', amount: 0 },
    { label: '', amount: 0 },
    { label: '', amount: 0 },
    { label: '', amount: 0 },
    { label: '', amount: 0 },
    { label: '', amount: 0 },
    { label: '', amount: 0 },
    { label: '', amount: 0 },
  ],
};

function r2(n: number) { return Math.round(n * 100) / 100; }
function fmt(n: number) { return n.toFixed(2); }

function BalanceCell({ value }: { value: number }) {
  const color = value >= 0 ? 'text-green-700' : 'text-red-600';
  return <td className={`px-3 py-1.5 text-right text-sm tabular-nums ${color}`}>{fmt(value)}</td>;
}

function SpendCell({ value }: { value: number }) {
  return <td className="px-3 py-1.5 text-right text-sm tabular-nums text-gray-700">{value > 0 ? fmt(value) : '—'}</td>;
}

interface EditCellProps {
  value: number;
  onChange: (v: number) => void;
}
function EditCell({ value, onChange }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  function start() {
    setRaw(value === 0 ? '' : fmt(value));
    setEditing(true);
    setTimeout(() => ref.current?.select(), 0);
  }

  function commit() {
    const n = parseFloat(raw.replace(',', '.'));
    onChange(isNaN(n) ? 0 : r2(n));
    setEditing(false);
  }

  return editing ? (
    <td className="px-1 py-0.5">
      <input
        ref={ref}
        className="w-full text-right text-sm px-2 py-1 border border-blue-400 rounded focus:outline-none bg-white"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
      />
    </td>
  ) : (
    <td
      className="px-3 py-1.5 text-right text-sm tabular-nums cursor-pointer hover:bg-blue-50 rounded"
      onClick={start}
      title="Click to edit"
    >
      {value !== 0 ? <span className={value < 0 ? 'text-red-600' : ''}>{fmt(value)}</span> : <span className="text-gray-300">0.00</span>}
    </td>
  );
}

export default function Summary({ transactions }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<SummaryData>(EMPTY_DATA);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const years = Array.from(new Set([
    now.getFullYear() - 1, now.getFullYear(),
    ...transactions.map(t => t.date ? new Date(t.date).getFullYear() : now.getFullYear()),
  ])).sort();

  // Load budget data when month changes
  useEffect(() => {
    api.getSummary(yearMonth).then(d => {
      // Ensure at least 8 money-in rows
      while (d.moneyInRows.length < 8) d.moneyInRows.push({ label: '', amount: 0 });
      setData(d);
    });
  }, [yearMonth]);

  // Debounced auto-save
  const save = useCallback((next: SummaryData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      api.saveSummary(yearMonth, next).finally(() => setSaving(false));
    }, 800);
  }, [yearMonth]);

  function update(next: SummaryData) {
    setData(next);
    save(next);
  }

  async function copyFromPrevMonth() {
    setCopying(true);
    try {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear  = month === 1 ? year - 1 : year;
      const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
      const prev = await api.getSummary(prevYearMonth);
      const next: SummaryData = {
        ...data,
        recurringBudgets: { ...prev.recurringBudgets },
        oneoffBudgets: { ...prev.oneoffBudgets },
        salary: prev.salary,
        moneyInRows: prev.moneyInRows.map(r => ({ ...r })),
      };
      while (next.moneyInRows.length < 8) next.moneyInRows.push({ label: '', amount: 0 });
      update(next);
    } finally {
      setCopying(false);
    }
  }

  // ── Calculate current spend from transactions ──────────────────────────────
  const filtered = transactions.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  // Recurring spend — same filter as Analytics "Recurring Budgeted"
  // Negate so expenses (negative amounts) become positive spend, and positive amounts become negative spend
  const recurringRaw: Record<string, number> = {};
  filtered
    .filter(t => t.type === 'Reccuring' && t.budgeted === 'Yes')
    .forEach(t => {
      const key = `${t.category}|${t.subCategory}`;
      recurringRaw[key] = (recurringRaw[key] ?? 0) + (t.amount ?? 0);
    });
  const recurringSpend: Record<string, number> = Object.fromEntries(
    Object.entries(recurringRaw).map(([k, v]) => [k, r2(-v)])
  );

  // One-off spend — same filter as Analytics "One-off Budgeted", grouped by category
  const oneoffRaw: Record<string, number> = {};
  filtered
    .filter(t => t.type === 'One off' && t.budgeted === 'Yes')
    .forEach(t => {
      oneoffRaw[t.category] = (oneoffRaw[t.category] ?? 0) + (t.amount ?? 0);
    });
  const oneoffSpend: Record<string, number> = Object.fromEntries(
    Object.entries(oneoffRaw).map(([k, v]) => [k, r2(-v)])
  );

  // ── Derive row lists from ALL transactions ─────────────────────────────────
  const recurringRows = Array.from(
    new Set(
      transactions
        .filter(t => t.type === 'Reccuring' && t.budgeted === 'Yes' && t.category)
        .map(t => `${t.category}|${t.subCategory}`)
    )
  ).sort();

  const oneoffRows = Array.from(
    new Set(
      transactions
        .filter(t => t.type === 'One off' && t.budgeted === 'Yes' && t.category)
        .map(t => t.category)
    )
  ).sort();

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalRecurringBudget = recurringRows.reduce((s, k) => s + (data.recurringBudgets[k] ?? 0), 0);
  const totalRecurringSpend  = recurringRows.reduce((s, k) => s + (recurringSpend[k] ?? 0), 0);

  const totalOneoffBudget = oneoffRows.reduce((s, k) => s + (data.oneoffBudgets[k] ?? 0), 0);
  const totalOneoffSpend  = oneoffRows.reduce((s, k) => s + (oneoffSpend[k] ?? 0), 0);

  const totalBudget = r2(totalRecurringBudget + totalOneoffBudget);
  const totalSpend  = r2(totalRecurringSpend + totalOneoffSpend);

  const totalMoneyIn = r2(data.moneyInRows.reduce((s, r) => s + (r.amount ?? 0), 0));
  const totalAvailable = r2(data.salary + (data.fromPrevious ?? 0) + totalMoneyIn);
  const totalSpentMonth = r2(totalSpend);
  const savings = r2(totalAvailable - totalSpentMonth);

  const headerClass = 'px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider';

  return (
    <div className="p-4 max-w-3xl">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        {saving && <span className="text-xs text-gray-400 ml-2">Saving…</span>}
        <button
          onClick={copyFromPrevMonth}
          disabled={copying || saving}
          className="ml-auto px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Copy budget figures from the previous month"
        >
          {copying ? 'Copying…' : '← Copy from previous month'}
        </button>
      </div>

      <h1 className="text-lg font-bold text-gray-800 mb-4">Monthly Cost Summary — {MONTHS[month - 1]} {year}</h1>

      {/* ── RECURRING COSTS ─────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <div className="bg-slate-700 text-white px-4 py-2 text-sm font-semibold">Recurring Costs</div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={headerClass}>Category</th>
              <th className={headerClass}>Sub Category</th>
              <th className={`${headerClass} text-right`}>Budget</th>
              <th className={`${headerClass} text-right`}>Current Spent</th>
              <th className={`${headerClass} text-right`}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {recurringRows.map((key, i) => {
              const [cat, sub] = key.split('|');
              const budget = data.recurringBudgets[key] ?? 0;
              const spend  = recurringSpend[key] ?? 0;
              return (
                <tr key={key} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-3 py-1.5 text-sm text-gray-700">{cat}</td>
                  <td className="px-3 py-1.5 text-sm text-gray-500">{sub}</td>
                  <EditCell value={budget} onChange={v => update({ ...data, recurringBudgets: { ...data.recurringBudgets, [key]: v } })} />
                  <SpendCell value={spend} />
                  <BalanceCell value={r2(budget - spend)} />
                </tr>
              );
            })}
            {recurringRows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-400">No recurring budgeted transactions yet</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-sm">Total Recurring Costs</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">{fmt(totalRecurringBudget)}</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-gray-700">{fmt(totalRecurringSpend)}</td>
              <BalanceCell value={r2(totalRecurringBudget - totalRecurringSpend)} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── ONE-OFF COSTS ────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <div className="bg-slate-700 text-white px-4 py-2 text-sm font-semibold">One-off Costs</div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={headerClass}>Category</th>
              <th className={`${headerClass} text-right`}>Budget</th>
              <th className={`${headerClass} text-right`}>Current Spent</th>
              <th className={`${headerClass} text-right`}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {oneoffRows.map((cat, i) => {
              const budget = data.oneoffBudgets[cat] ?? 0;
              const spend  = oneoffSpend[cat] ?? 0;
              return (
                <tr key={cat} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-3 py-1.5 text-sm text-gray-700">{cat}</td>
                  <EditCell value={budget} onChange={v => update({ ...data, oneoffBudgets: { ...data.oneoffBudgets, [cat]: v } })} />
                  <SpendCell value={spend} />
                  <BalanceCell value={r2(budget - spend)} />
                </tr>
              );
            })}
            {oneoffRows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-400">No one-off budgeted transactions yet</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <tr>
              <td className="px-3 py-2 text-sm">Total One-off</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">{fmt(totalOneoffBudget)}</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-gray-700">{fmt(totalOneoffSpend)}</td>
              <BalanceCell value={r2(totalOneoffBudget - totalOneoffSpend)} />
            </tr>
            <tr className="border-t border-gray-200">
              <td className="px-3 py-2 text-sm">Total Expected Cost</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">{fmt(totalBudget)}</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-gray-700">{fmt(totalSpend)}</td>
              <BalanceCell value={r2(totalBudget - totalSpend)} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── SALARY & BUDGET GAP ──────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <div className="bg-slate-700 text-white px-4 py-2 text-sm font-semibold">Salary vs Budget</div>
        <table className="w-full">
          <tbody>
            <SummaryRow label="Monthly Salary Chana">
              <EditCell value={data.salary}
                onChange={v => update({ ...data, salary: v })} />
            </SummaryRow>
            <SummaryRow label="Previous month">
              <EditCell value={data.fromPrevious}
                onChange={v => update({ ...data, fromPrevious: v })} />
            </SummaryRow>
            <DividerRow />
            <CalcRow
              label="Budget gap"
              value={r2(data.salary - totalBudget - data.fromPrevious)}
              bold
              colored
            />
          </tbody>
        </table>
      </div>

      {/* ── MONTHLY OVERVIEW ─────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-slate-700 text-white px-4 py-2 text-sm font-semibold">Monthly Overview</div>
        <table className="w-full">
          <tbody>
            <CalcRow label="Money available" value={r2(data.salary + data.fromPrevious)} />
            {/* Money in so far rows */}
            {data.moneyInRows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-1.5 w-full">
                  <input
                    className="text-sm text-gray-700 bg-transparent border-none w-full focus:outline-none focus:bg-blue-50 rounded"
                    placeholder="--empty--"
                    value={row.label}
                    onChange={e => {
                      const rows = data.moneyInRows.map((r, j) => j === i ? { ...r, label: e.target.value } : r);
                      update({ ...data, moneyInRows: rows });
                    }}
                  />
                </td>
                <EditCell
                  value={row.amount}
                  onChange={v => {
                    const rows = data.moneyInRows.map((r, j) => j === i ? { ...r, amount: v } : r);
                    update({ ...data, moneyInRows: rows });
                  }}
                />
              </tr>
            ))}

            <DividerRow />

            <CalcRow label="Total available this month" value={totalAvailable} bold />
            <CalcRow label="Total spent this month" value={-totalSpentMonth} />
            <CalcRow label="Savings of the month" value={savings} bold colored />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-1.5 text-sm text-gray-700 w-full">{label}</td>
      {children}
    </tr>
  );
}

function CalcRow({ label, value, bold, colored }: { label: string; value: number; bold?: boolean; colored?: boolean }) {
  const textClass = colored
    ? value >= 0 ? 'text-green-700' : 'text-red-600'
    : 'text-gray-700';
  return (
    <tr className="border-b border-gray-100">
      <td className={`px-3 py-1.5 text-sm w-full ${bold ? 'font-semibold' : ''}`}>{label}</td>
      <td className={`px-3 py-1.5 text-right text-sm tabular-nums ${bold ? 'font-semibold' : ''} ${textClass}`}>
        {value.toFixed(2)}
      </td>
    </tr>
  );
}

function DividerRow() {
  return <tr className="border-t-2 border-gray-300"><td colSpan={2} className="py-0"></td></tr>;
}
