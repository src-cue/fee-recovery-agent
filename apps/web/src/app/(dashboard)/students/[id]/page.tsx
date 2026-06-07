'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, MessageSquare, Phone, Mail, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate, statusColor, intentColor } from '@/lib/utils';

interface Case {
  id: string; student_name: string | null; parent_name: string | null; parent_phone: string;
  parent_email: string | null; fee_amount: number; currency: string; due_date: string;
  days_overdue: number; fee_type: string; status: string; current_stage: string | null;
  payment_link: string | null; notes: string | null; language: string;
}
interface TimelineEvent {
  id: string; type: string; channel: string | null; direction: string | null;
  content: string | null; intent: string | null; sentiment: number | null;
  provider: string | null; created_at: string;
}

function channelIcon(channel: string | null) {
  if (channel === 'whatsapp' || channel === 'sms') return <MessageSquare className="h-3.5 w-3.5" />;
  if (channel === 'call') return <Phone className="h-3.5 w-3.5" />;
  return <Mail className="h-3.5 w-3.5" />;
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [c, t] = await Promise.all([
        api.get<Case>(`/v1/cases/${id}`),
        api.get<TimelineEvent[]>(`/v1/cases/${id}/timeline`),
      ]);
      setCaseData(c); setTimeline(t);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to load case');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  async function addNote() {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/v1/cases/${id}/note`, { text: note });
      setNote(''); load();
      toast.success('Note added');
    } catch (e: unknown) { toast.error((e as Error).message || 'Failed to add note'); }
    finally { setSubmitting(false); }
  }

  async function handleAction(action: 'hold' | 'resolve' | 'escalate') {
    try {
      await api.post(`/v1/cases/${id}/${action}`);
      toast.success(`Case ${action}d`);
      load();
    } catch (e: unknown) { toast.error((e as Error).message || 'Action failed'); }
  }

  if (loading) return <div className="space-y-4"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-64 bg-gray-200 rounded animate-pulse" /></div>;
  if (!caseData) return <div className="text-center py-16 text-muted-foreground">Case not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold">{caseData.student_name ?? caseData.parent_phone}</h1>
        <Badge className={statusColor(caseData.status)}>{caseData.status}</Badge>
        {caseData.current_stage && <Badge className="bg-gray-100 text-gray-700">{caseData.current_stage}</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Case info + controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Case Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatCurrency(caseData.fee_amount, caseData.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span>{formatDate(caseData.due_date)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Days Overdue</span><span className="text-orange-600 font-medium">{caseData.days_overdue}d</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fee Type</span><span>{caseData.fee_type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Parent</span><span>{caseData.parent_name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{caseData.parent_phone}</span></div>
              {caseData.parent_email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="truncate ml-4">{caseData.parent_email}</span></div>}
              {caseData.payment_link && <div className="pt-2"><a href={caseData.payment_link} target="_blank" rel="noopener noreferrer" className="text-primary text-xs underline">Payment Link</a></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => handleAction('hold')}>Pause / Hold</Button>
              <Button variant="outline" size="sm" className="w-full" onClick={() => handleAction('escalate')}>Escalate to Human</Button>
              <Button size="sm" className="w-full" onClick={() => handleAction('resolve')}>Mark as Resolved</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Add Note</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="Add a note..."
                className="w-full border rounded-md px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-1 focus:ring-ring" />
              <Button size="sm" className="w-full" onClick={addNote} disabled={submitting || !note.trim()}>
                {submitting ? 'Adding...' : 'Add Note'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Timeline */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
              ) : (
                <div className="space-y-4">
                  {timeline.map((event, idx) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {channelIcon(event.channel)}
                        </div>
                        {idx < timeline.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium capitalize">{event.type.replace(/_/g, ' ')}</span>
                          {event.channel && <Badge className="text-xs bg-gray-100 text-gray-600">{event.channel}</Badge>}
                          {event.direction && <Badge className="text-xs bg-blue-50 text-blue-600">{event.direction}</Badge>}
                          {event.intent && <Badge className={intentColor(event.intent) + ' text-xs'}>{event.intent}</Badge>}
                          {event.sentiment && <span className="text-xs text-muted-foreground">★{event.sentiment}/5</span>}
                        </div>
                        {event.content && <p className="text-sm mt-1 text-muted-foreground">{event.content}</p>}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(event.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
