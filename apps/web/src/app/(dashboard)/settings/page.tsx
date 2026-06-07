'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Tenant { id: string; school_name: string; email: string; timezone: string; currency: string; default_language: string; callback_url: string | null; erp_type: string; token_balance: number; }
interface Balance { token_balance: number; }
interface ApiKey { api_key: string; }

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'general' | 'api' | 'billing'>('general');

  useEffect(() => {
    Promise.all([
      api.get<Tenant>('/v1/settings'),
      api.get<ApiKey>('/v1/settings/api-key'),
    ]).then(([t, k]) => { setTenant(t); setApiKey(k.api_key); })
      .catch(e => toast.error((e as Error).message || 'Failed to load settings'));
  }, []);

  async function save() {
    if (!tenant) return;
    setSaving(true);
    try {
      const updated = await api.put<Tenant>('/v1/settings', {
        school_name: tenant.school_name, timezone: tenant.timezone,
        currency: tenant.currency, default_language: tenant.default_language,
        callback_url: tenant.callback_url, erp_type: tenant.erp_type,
      });
      setTenant(updated);
      toast.success('Settings saved');
    } catch (e: unknown) { toast.error((e as Error).message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function regenerateKey() {
    if (!confirm('Regenerate API key? Current key will stop working immediately.')) return;
    try {
      const res = await api.post<{ api_key: string }>('/v1/settings/api-key/regenerate');
      setApiKey(res.api_key);
      toast.success('API key regenerated');
    } catch (e: unknown) { toast.error((e as Error).message || 'Failed'); }
  }

  function copyKey() { navigator.clipboard.writeText(apiKey); toast.success('Copied'); }

  if (!tenant) return <div className="space-y-4">{Array.from({length:2}).map((_,i) => <div key={i} className="h-32 bg-gray-200 rounded animate-pulse" />)}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex gap-1 border-b">
        {(['general','api','billing'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="text-sm font-medium">School Name</label>
              <Input value={tenant.school_name} onChange={e => setTenant({...tenant, school_name: e.target.value})} className="mt-1" />
            </div>
            <div><label className="text-sm font-medium">Timezone</label>
              <Input value={tenant.timezone} onChange={e => setTenant({...tenant, timezone: e.target.value})} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Currency</label>
                <Select value={tenant.currency} onChange={e => setTenant({...tenant, currency: e.target.value})} className="mt-1">
                  <option value="INR">INR</option><option value="USD">USD</option><option value="GBP">GBP</option>
                </Select>
              </div>
              <div><label className="text-sm font-medium">Default Language</label>
                <Select value={tenant.default_language} onChange={e => setTenant({...tenant, default_language: e.target.value})} className="mt-1">
                  <option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option>
                </Select>
              </div>
            </div>
            <div><label className="text-sm font-medium">ERP Type</label>
              <Select value={tenant.erp_type} onChange={e => setTenant({...tenant, erp_type: e.target.value})} className="mt-1">
                <option value="api">Direct API</option><option value="fedena">Fedena</option><option value="entab">Entab</option><option value="classter">Classter</option><option value="csv">CSV Upload</option>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Callback URL</label>
              <Input value={tenant.callback_url ?? ''} onChange={e => setTenant({...tenant, callback_url: e.target.value || null})} placeholder="https://yourschool.com/webhook" className="mt-1" />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </CardContent>
        </Card>
      )}

      {tab === 'api' && (
        <Card>
          <CardHeader><CardTitle>API Key</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Use this key to authenticate API requests with <code className="bg-muted px-1 rounded">Authorization: Bearer frk_live_...</code></p>
            <div className="flex gap-2">
              <Input value={apiKey} readOnly className="font-mono text-xs flex-1" />
              <Button variant="outline" size="sm" onClick={copyKey}><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={regenerateKey}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'billing' && (
        <Card>
          <CardHeader><CardTitle>Billing &amp; Tokens</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Token Balance</p>
                <p className="text-3xl font-bold">{tenant.token_balance}</p>
                <p className="text-xs text-muted-foreground mt-1">1 token = 1 case opened</p>
              </div>
              <Button>Top Up</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
