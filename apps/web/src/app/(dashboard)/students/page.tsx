'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Download, Plus, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

interface Case {
  id: string;
  student_name: string | null;
  parent_name: string | null;
  parent_phone: string;
  fee_type: string;
  fee_amount: number;
  due_date: string;
  days_overdue: number;
  status: string;
  last_action_at: string | null;
}

interface CasesResponse {
  data: Case[];
  total: number;
  page: number;
  limit: number;
}

export default function StudentsPage() {
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ status: '', search: '', fee_type: '' });
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit), sort: 'days_overdue:desc' };
      if (filters.status) params.status = filters.status;
      if (filters.search) params.search = filters.search;
      if (filters.fee_type) params.fee_type = filters.fee_type;
      const res = await api.get<CasesResponse>('/v1/cases', params);
      setCases(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: 'hold' | 'resolve' | 'escalate') {
    try {
      await api.post(`/v1/cases/${id}/${action}`);
      toast.success(`Case ${action}d`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Action failed');
    }
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const params = new URLSearchParams({ format, ...filters });
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/cases/export?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cases.${format}`; a.click();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Export failed');
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Students</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')}><Download className="h-4 w-4 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => router.push('/students/upload')}><Plus className="h-4 w-4 mr-1" />Bulk Upload</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or phone..." className="pl-8"
            value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }} />
        </div>
        <Select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }} className="w-36">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ESCALATED">Escalated</option>
          <option value="HOLD">On Hold</option>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-md px-4 py-2 flex items-center gap-3 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => { selected.forEach(id => handleAction(id, 'hold')); setSelected(new Set()); }}>Hold All</Button>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-8 px-4 py-3"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(cases.map(c => c.id)) : new Set())} /></th>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Fee Type</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Due Date</th>
                <th className="text-right px-4 py-3 font-medium">Overdue</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : cases.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No cases found</td></tr>
              ) : cases.map(c => (
                <tr key={c.id} className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => router.push(`/students/${c.id}`)}>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium">{c.student_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.parent_phone}</td>
                  <td className="px-4 py-3">{c.fee_type}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.fee_amount)}</td>
                  <td className="px-4 py-3">{formatDate(c.due_date)}</td>
                  <td className="px-4 py-3 text-right font-medium text-orange-600">{c.days_overdue}d</td>
                  <td className="px-4 py-3"><Badge className={statusColor(c.status)}>{c.status}</Badge></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleAction(c.id, 'hold')}>Hold</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleAction(c.id, 'resolve')}>Resolve</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
