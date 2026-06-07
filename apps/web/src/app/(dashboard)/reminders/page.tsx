'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Stage { stage: string; day_trigger: number; channel: string; enabled: boolean; template_id?: string; }
interface PolicyLadder { stages: Stage[]; daily_cap: number; blackout_start: string; blackout_end: string; test_mode: boolean; test_phone?: string; }

export default function RemindersPage() {
  const [ladder, setLadder] = useState<PolicyLadder | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<PolicyLadder>('/v1/settings/policy-ladder')
      .then(setLadder)
      .catch(e => toast.error((e as Error).message || 'Failed to load settings'));
  }, []);

  async function save() {
    if (!ladder) return;
    setSaving(true);
    try { await api.put('/v1/settings/policy-ladder', ladder); toast.success('Settings saved'); }
    catch (e: unknown) { toast.error((e as Error).message || 'Save failed'); }
    finally { setSaving(false); }
  }

  function updateStage(index: number, field: keyof Stage, value: unknown) {
    if (!ladder) return;
    const stages = [...ladder.stages];
    stages[index] = { ...stages[index], [field]: value };
    setLadder({ ...ladder, stages });
  }

  if (!ladder) return <div className="space-y-4">{Array.from({length: 3}).map((_,i) => <div key={i} className="h-20 bg-gray-200 rounded animate-pulse" />)}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reminder Settings</h1>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Policy Ladder</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {ladder.stages.map((stage, i) => (
            <div key={stage.stage} className={`border rounded-lg p-4 space-y-3 ${!stage.enabled ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{stage.stage}</span>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={stage.enabled} onChange={e => updateStage(i, 'enabled', e.target.checked)} className="rounded" />
                  Enabled
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Day trigger</label>
                  <Input type="number" min={0} value={stage.day_trigger}
                    onChange={e => updateStage(i, 'day_trigger', parseInt(e.target.value) || 0)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Channel</label>
                  <Select value={stage.channel} onChange={e => updateStage(i, 'channel', e.target.value)} className="mt-1">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="call">Call</option>
                    <option value="sms">SMS</option>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Global Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Daily message cap per parent</label>
            <Input type="number" min={1} max={3} value={ladder.daily_cap}
              onChange={e => setLadder({ ...ladder, daily_cap: parseInt(e.target.value) || 1 })} className="mt-1 w-24" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Blackout start</label>
              <Input type="time" value={ladder.blackout_start}
                onChange={e => setLadder({ ...ladder, blackout_start: e.target.value })} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Blackout end</label>
              <Input type="time" value={ladder.blackout_end}
                onChange={e => setLadder({ ...ladder, blackout_end: e.target.value })} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={ladder.test_mode} onChange={e => setLadder({ ...ladder, test_mode: e.target.checked })} />
              Test mode (sends to test phone only)
            </label>
            {ladder.test_mode && (
              <Input placeholder="+919876543210" value={ladder.test_phone ?? ''}
                onChange={e => setLadder({ ...ladder, test_phone: e.target.value })} className="mt-2 max-w-xs" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
