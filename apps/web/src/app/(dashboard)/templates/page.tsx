'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Eye, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Template {
  id: string; name: string; channel: string; stage: string; language: string;
  body: string; status: string; is_builtin: boolean;
}

const VARS = ['{{student_name}}','{{parent_name}}','{{school_name}}','{{amount}}','{{currency}}','{{due_date}}','{{days_overdue}}','{{fee_type}}','{{payment_link}}'];

const schema = z.object({
  name: z.string().min(1), channel: z.enum(['whatsapp','sms','email']),
  stage: z.enum(['P1','P2','P3','custom']), language: z.enum(['en','hi','ta','te','mr','kn','bn']),
  body: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

function statusBadge(s: string) {
  const map: Record<string,string> = { approved: 'bg-green-100 text-green-800', pending_approval: 'bg-yellow-100 text-yellow-800', draft: 'bg-gray-100 text-gray-700', rejected: 'bg-red-100 text-red-700' };
  return map[s] ?? 'bg-gray-100 text-gray-700';
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { channel: 'whatsapp', stage: 'P1', language: 'en' } });
  const body = watch('body') ?? '';

  async function load() {
    try { setTemplates(await api.get<Template[]>('/v1/templates')); }
    catch (e: unknown) { toast.error((e as Error).message || 'Failed to load templates'); }
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); reset(); setShowForm(true); }
  function openEdit(t: Template) {
    setEditing(t);
    setValue('name', t.name); setValue('channel', t.channel as 'whatsapp'|'sms'|'email');
    setValue('stage', t.stage as 'P1'|'P2'|'P3'|'custom'); setValue('language', t.language as 'en'|'hi');
    setValue('body', t.body);
    setShowForm(true);
  }

  async function onSubmit(data: FormData) {
    try {
      if (editing) { await api.put(`/v1/templates/${editing.id}`, data); toast.success('Template updated'); }
      else { await api.post('/v1/templates', data); toast.success('Template created'); }
      setShowForm(false); load();
    } catch (e: unknown) { toast.error((e as Error).message || 'Save failed'); }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    try { await api.delete(`/v1/templates/${id}`); toast.success('Deleted'); load(); }
    catch (e: unknown) { toast.error((e as Error).message || 'Delete failed'); }
  }

  async function submitForApproval(id: string) {
    try { await api.post(`/v1/templates/${id}/submit-for-approval`); toast.success('Submitted for approval'); load(); }
    catch (e: unknown) { toast.error((e as Error).message || 'Submission failed'); }
  }

  async function showPreview(id: string) {
    try {
      const res = await api.get<{ rendered: string }>(`/v1/templates/${id}/preview`, {
        student_name: 'Aryan Kumar', amount: '15000', school_name: 'Delhi Public School',
        due_date: '2025-06-01', days_overdue: '5', fee_type: 'Tuition Fee', parent_name: 'Mr. Kumar',
      });
      setPreview(res.rendered); setPreviewId(id);
    } catch (e: unknown) { toast.error((e as Error).message || 'Preview failed'); }
  }

  const insertVar = (v: string) => setValue('body', body + ' ' + v);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Template</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? 'Edit Template' : 'New Template'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Name</label><Input {...register('name')} className="mt-1" />{errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}</div>
                <div><label className="text-sm font-medium">Channel</label>
                  <Select {...register('channel')} className="mt-1">
                    <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option>
                  </Select>
                </div>
                <div><label className="text-sm font-medium">Stage</label>
                  <Select {...register('stage')} className="mt-1">
                    <option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option><option value="custom">Custom</option>
                  </Select>
                </div>
                <div><label className="text-sm font-medium">Language</label>
                  <Select {...register('language')} className="mt-1">
                    <option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="mr">Marathi</option><option value="kn">Kannada</option><option value="bn">Bengali</option>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Message Body</label>
                <div className="flex flex-wrap gap-1 mt-1 mb-2">
                  {VARS.map(v => <button key={v} type="button" onClick={() => insertVar(v)} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100">{v}</button>)}
                </div>
                <textarea {...register('body')} rows={4} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                {errors.body && <p className="text-red-500 text-xs mt-1">{errors.body.message}</p>}
              </div>
              {body && (
                <div className="bg-gray-50 border rounded-md p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Preview (with sample values)</p>
                  <p>{body.replace('{{student_name}}','Aryan').replace('{{amount}}','₹15,000').replace('{{due_date}}','June 1').replace('{{school_name}}','Delhi Public School').replace('{{days_overdue}}','5')}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit">Save</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Live Preview</CardTitle><button onClick={() => setPreview(null)} className="text-muted-foreground hover:text-foreground">✕</button></CardHeader>
          <CardContent><p className="text-sm bg-green-50 border border-green-200 rounded-md p-3">{preview}</p></CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {templates.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border rounded-lg">No templates yet. Create your first one.</div>
        ) : templates.map(t => (
          <Card key={t.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{t.name}</span>
                    {t.is_builtin && <Badge className="bg-purple-100 text-purple-700 text-xs">Built-in</Badge>}
                    <Badge className="bg-blue-100 text-blue-700 text-xs">{t.channel}</Badge>
                    <Badge className="bg-gray-100 text-gray-700 text-xs">{t.stage}</Badge>
                    <Badge className="bg-gray-50 text-gray-600 text-xs">{t.language}</Badge>
                    <Badge className={statusBadge(t.status) + ' text-xs'}>{t.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 truncate">{t.body}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => showPreview(t.id)}><Eye className="h-4 w-4" /></Button>
                  {!t.is_builtin && <>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    {t.channel === 'whatsapp' && t.status === 'draft' && <Button variant="ghost" size="sm" onClick={() => submitForApproval(t.id)}><Send className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
