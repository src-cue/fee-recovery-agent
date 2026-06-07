'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatCurrency, statusColor, formatDate } from '@/lib/utils';
import { TrendingUp, Users, CheckCircle, Coins } from 'lucide-react';

// Types
interface Summary { active_cases: number; resolved_this_month: number; touchless_recovery_rate: number; token_balance: number; }
interface Case { id: string; student_name: string | null; parent_phone: string; fee_amount: number; days_overdue: number; status: string; fee_type: string; }
interface Activity { id: string; type: string; content: string | null; channel: string | null; created_at: string; cases?: { student_name: string | null; }; }

function KPICard({ title, value, icon: Icon, sub }: { title: string; value: string | number; icon: React.ElementType; sub?: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<unknown[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, t, c, a] = await Promise.all([
          api.get<Summary>('/v1/dashboard/summary'),
          api.get<unknown[]>('/v1/dashboard/trend', { days: '30' }),
          api.get<{ data: Case[] }>('/v1/cases', { status: 'ACTIVE', limit: '10', sort: 'days_overdue:desc' }),
          api.get<Activity[]>('/v1/dashboard/activity', { limit: '10' }),
        ]);
        setSummary(s);
        setTrend(t);
        setCases(c.data);
        setActivity(a);
      } catch (e: unknown) {
        toast.error((e as Error).message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Active Cases" value={summary?.active_cases ?? 0} icon={Users} />
        <KPICard title="Resolved This Month" value={summary?.resolved_this_month ?? 0} icon={CheckCircle} />
        <KPICard title="Recovery Rate" value={`${summary?.touchless_recovery_rate ?? 0}%`} icon={TrendingUp} />
        <KPICard title="Token Balance" value={summary?.token_balance ?? 0} icon={Coins} />
      </div>

      <Card>
        <CardHeader><CardTitle>Recovery Trend (30 days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend as Record<string, unknown>[]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="resolved" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="escalated" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Most Urgent Cases</CardTitle></CardHeader>
          <CardContent>
            {cases.length === 0 ? <p className="text-sm text-muted-foreground">No active cases</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Student</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Overdue</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map(c => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2">{c.student_name ?? c.parent_phone}</td>
                        <td className="py-2">{formatCurrency(c.fee_amount)}</td>
                        <td className="py-2 text-orange-600 font-medium">{c.days_overdue}d</td>
                        <td className="py-2"><Badge className={statusColor(c.status)}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? <p className="text-sm text-muted-foreground">No recent activity</p> : (
              <div className="space-y-3">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{a.content ?? a.type}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                    </div>
                    {a.channel && <Badge className="text-xs bg-gray-100 text-gray-600 shrink-0">{a.channel}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
