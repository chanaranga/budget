import type { Transaction } from './types';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function recalcMonth(group: Transaction[]): Transaction[] {
  return group.reduce<Transaction[]>((acc, t, i) => {
    if (i === 0) {
      const end = t.startBalance !== null && t.amount !== null
        ? r2(t.startBalance + t.amount)
        : t.endBalance;
      return [...acc, { ...t, endBalance: end }];
    }
    const prev = acc[i - 1];
    const start = prev.endBalance;
    const end = start !== null && t.amount !== null ? r2(start + t.amount) : null;
    return [...acc, { ...t, startBalance: start, endBalance: end }];
  }, []);
}

export function recalcAllMonths(transactions: Transaction[]): Transaction[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.date) continue;
    const key = t.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const result: Transaction[] = [];
  for (const [, group] of [...groups.entries()].sort()) {
    result.push(...recalcMonth([...group].sort((a, b) => a.date.localeCompare(b.date))));
  }
  return [...result, ...transactions.filter(t => !t.date)];
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
