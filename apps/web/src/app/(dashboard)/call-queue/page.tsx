'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Phone, RefreshCw, CheckCircle, Clock, AlertCircle, TrendingUp } from 'lucide-react';

interface Case {
  id: string;
  case_id: string;
  student_name: string;
  parent_name: string;
  parent_phone: string;
  fee_amount: number;
  currency: string;
  days_overdue: number;
  fee_type: string;
  call_attempts: number;
  last_call_at: string | null;
  priority_score: number;
  priority_reason: string | null;
  status: string;
  current_stage: string | null;
}

const STATUS_OPTIONS = [
  { value: 'RESOLVED', label: 'Mark Paid', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { value: 'PROMISE_TO_PAY', label: 'Promise to Pay', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { value: 'ON_HOLD', label: 'Put on Hold', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { value: 'ESCALATED', label: 'Escalate', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
];

function priorityBadge(score: number) {
  if (score >= 70) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">HIGH {score}</span>;
  if (score >= 40) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">MED {score}</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">LOW {score}</span>;
}

export default function CallQueuePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      const res = await api.get(`/v1/call-queue${refresh ? '?refresh=true' : ''}`) as { data: Case[] };
      setCases(res.data);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function rescore() {
    setRescoring(true);
    toast.info('AI is re-scoring all cases...');
    await load(true);
    setRescoring(false);
    toast.success('Priority scores updated');
  }

  async function dial(c: Case) {
    setDialingId(c.id);
    try {
      const res = await api.post(`/v1/call-queue/${c.id}/dial`, {}) as { callSid: string; status: string };
      toast.success(`Call initiated — SID: ${res.callSid}`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Call failed');
    } finally {
      setDialingId(null);
    }
  }

  async function updateStatus(caseId: string, status: string) {
    setStatusId(caseId);
    try {
      await api.patch(`/v1/call-queue/${caseId}/status`, { status });
      toast.success(`Marked as ${status.replace(/_/g, ' ')}`);
      setCases(prev => prev.filter(c => c.id !== caseId));
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setStatusId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Queue</h1>
          <p className="text-sm text-gray-500 mt-1">AI-ranked cases — highest priority first</p>
        </div>
        <button
          onClick={rescore}
          disabled={rescoring}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <TrendingUp className="h-4 w-4" />
          {rescoring ? 'Scoring...' : 'Re-score with AI'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{cases.filter(c => c.priority_score >= 70).length}</div>
          <div className="text-sm text-gray-500">High Priority</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">{cases.filter(c => c.call_attempts === 0).length}</div>
          <div className="text-sm text-gray-500">Never Called</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">
            ₹{cases.reduce((s, c) => s + c.fee_amount, 0).toLocaleString('en-IN')}
          </div>
          <div className="text-sm text-gray-500">Total Outstanding</div>
        </div>
      </div>

      {/* Queue table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading queue...</div>
        ) : cases.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-400" />
            <p className="font-medium">No active cases to call</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Student / Parent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Overdue</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Calls</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">AI Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">{priorityBadge(c.priority_score ?? 0)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.student_name}</div>
                    <div className="text-gray-500 text-xs">{c.parent_name} · {c.parent_phone}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    ₹{c.fee_amount.toLocaleString('en-IN')}
                    <div className="text-xs text-gray-400">{c.fee_type}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${c.days_overdue > 30 ? 'text-red-600' : 'text-orange-500'}`}>
                      {c.days_overdue}d
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Phone className="h-3 w-3" />
                      {c.call_attempts ?? 0}
                    </div>
                    {c.last_call_at && (
                      <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {new Date(c.last_call_at).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="text-xs text-gray-500 truncate" title={c.priority_reason ?? ''}>
                      {c.priority_reason ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => dial(c)}
                        disabled={dialingId === c.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <Phone className="h-3 w-3" />
                        {dialingId === c.id ? 'Calling...' : 'Call Now'}
                      </button>
                      <div className="relative group">
                        <button
                          disabled={statusId === c.id}
                          className="flex items-center gap-1 px-3 py-1.5 border rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <AlertCircle className="h-3 w-3" />
                          Status ▾
                        </button>
                        <div className="absolute right-0 top-8 hidden group-hover:flex flex-col bg-white border rounded-lg shadow-lg z-10 min-w-[150px]">
                          {STATUS_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => updateStatus(c.id, opt.value)}
                              className={`px-3 py-2 text-xs font-medium text-left transition-colors ${opt.color}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
