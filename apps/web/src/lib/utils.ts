import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'bg-blue-100 text-blue-800',
    RESOLVED: 'bg-green-100 text-green-800',
    ESCALATED: 'bg-red-100 text-red-800',
    HOLD: 'bg-yellow-100 text-yellow-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-800';
}

export function intentColor(intent: string): string {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    promise: 'bg-blue-100 text-blue-800',
    dispute: 'bg-orange-100 text-orange-800',
    distress: 'bg-red-100 text-red-800',
    no_intent: 'bg-gray-100 text-gray-800',
  };
  return map[intent] ?? 'bg-gray-100 text-gray-800';
}
