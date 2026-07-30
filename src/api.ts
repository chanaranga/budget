import type { Transaction, DropdownSettings } from './types';
import { getStoredUser } from './auth';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = getStoredUser();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 || res.status === 403) {
    // Token expired or forbidden — force re-login
    localStorage.removeItem('financetracker_auth');
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getTransactions: () =>
    request<Transaction[]>('/api/transactions'),

  createTransaction: (t: Transaction) =>
    request<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(t) }),

  updateTransaction: (t: Transaction) =>
    request<Transaction>(`/api/transactions/${t.id}`, { method: 'PUT', body: JSON.stringify(t) }),

  deleteTransaction: (id: string) =>
    request<void>(`/api/transactions/${id}`, { method: 'DELETE' }),

  bulkImport: (transactions: Transaction[]) =>
    request<{ imported: number }>('/api/transactions/bulk', { method: 'POST', body: JSON.stringify(transactions) }),

  getSettings: () =>
    request<DropdownSettings>('/api/settings'),

  updateSettings: (s: DropdownSettings) =>
    request<DropdownSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),

  getSummary: (yearMonth: string) =>
    request<SummaryData>(`/api/summary/${yearMonth}`),

  saveSummary: (yearMonth: string, data: SummaryData) =>
    request<SummaryData>(`/api/summary/${yearMonth}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export interface MoneyInRow {
  label: string;
  amount: number;
}

export interface SummaryData {
  recurringBudgets: Record<string, number>; // "Category|SubCategory" -> amount
  oneoffBudgets: Record<string, number>;    // "Category" -> amount
  salary: number;
  fromPrevious: number;
  moneyInRows: MoneyInRow[];
}
