import { useEffect, useState } from 'react';
import { Plus, Save, ToggleLeft, ToggleRight, Trash2, Key, Link as LinkIcon } from 'lucide-react';

interface ProviderForm {
  id?: string;
  name: string;
  base_url: string;
  auth_type: 'API_KEY' | 'BEARER_TOKEN' | 'OAUTH2' | 'CUSTOM_HEADER';
  api_key?: string;
  client_id?: string;
  client_secret?: string;
  headers?: string;
  is_active: boolean;
  priority?: number;
  multi_carrier?: boolean;
  supports_container_tracking?: boolean;
  supports_bl_tracking?: boolean;
}

export default function Providers() {
  const [providers, setProviders] = useState<any[]>([]);
  const [form, setForm] = useState<ProviderForm>({ name: '', base_url: '', auth_type: 'API_KEY', headers: '{}', is_active: true, priority: 10, multi_carrier: false, supports_container_tracking: true, supports_bl_tracking: false });
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const loadProviders = async () => {
    try {
      const res = await fetch('/api/v1/admin/providers');
      const data = await res.json();
      console.log('Providers API response:', data);
      if (res.ok) setProviders(data);
      else console.error('Failed loading providers', data);
    } catch (err) {
      console.error('Failed loading providers', err);
    }
  };

  useEffect(() => { loadProviders(); }, []);

  const submit = async () => {
    setLoading(true);
    const body = { ...form, headers: form.headers ? JSON.parse(form.headers) : {} };
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/v1/admin/providers/${form.id}` : '/api/v1/admin/providers';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await loadProviders();
    setForm({ name: '', base_url: '', auth_type: 'API_KEY', headers: '{}', is_active: true, priority: 10, multi_carrier: false, supports_container_tracking: true, supports_bl_tracking: false });
    setLoading(false);
  };

  const edit = (row: any) => {
    setForm({ ...row, headers: JSON.stringify(row.headers || {}, null, 2) });
  };

  const toggle = async (row: any) => {
    await fetch(`/api/v1/admin/providers/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    loadProviders();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete provider?')) return;
    await fetch(`/api/v1/admin/providers/${id}`, { method: 'DELETE' });
    loadProviders();
  };

  const testConnection = async (row: any) => {
    setTestResult((prev) => ({ ...prev, [row.id]: 'Testing...' }));
    const res = await fetch(`/api/v1/admin/providers/${row.id}/test`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setTestResult((prev) => ({ ...prev, [row.id]: `${body.status} (${body.latency || 'n/a'})` }));
    else setTestResult((prev) => ({ ...prev, [row.id]: `Error: ${body.error || body.message || res.status}` }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Providers</h3>
        <div className="flex gap-2">
          <button onClick={() => setForm({ name: '', base_url: '', auth_type: 'API_KEY', headers: '{}', is_active: true })} className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg text-gray-700">
            <Plus className="h-4 w-4" /> New
          </button>
          <button onClick={submit} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg shadow-sm disabled:opacity-60">
            <Save className="h-4 w-4" /> {form.id ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
          <div>
            <label className="text-xs text-gray-500 font-semibold">Provider Name</label>
            <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Base URL</label>
            <div className="flex items-center gap-2 mt-1">
              <LinkIcon className="h-4 w-4 text-gray-400" />
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Auth Type</label>
            <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value as any })}>
              {['API_KEY','BEARER_TOKEN','OAUTH2','CUSTOM_HEADER'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold">API Key</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.api_key || ''} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Client ID</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.client_id || ''} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Client Secret</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.client_secret || ''} onChange={(e) => setForm({ ...form, client_secret: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Priority (lower = preferred)</label>
              <input type="number" className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.priority ?? 10} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-semibold text-gray-500">Active</span>
              <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })} className="text-indigo-600">{form.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-semibold text-gray-500">Multi Carrier</span>
              <button type="button" onClick={() => setForm({ ...form, multi_carrier: !form.multi_carrier })} className="text-indigo-600">{form.multi_carrier ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-semibold text-gray-500">Container Tracking</span>
              <button type="button" onClick={() => setForm({ ...form, supports_container_tracking: !form.supports_container_tracking })} className="text-indigo-600">{form.supports_container_tracking ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs font-semibold text-gray-500">BL Tracking</span>
              <button type="button" onClick={() => setForm({ ...form, supports_bl_tracking: !form.supports_bl_tracking })} className="text-indigo-600">{form.supports_bl_tracking ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Headers JSON</label>
            <textarea className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" rows={4} value={form.headers || ''} onChange={(e) => setForm({ ...form, headers: e.target.value })} />
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="overflow-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Base URL</th>
                  <th className="px-3 py-2">Auth</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers?.length ? (
                  providers.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-900">{p.name}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{p.base_url}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{p.auth_type}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggle(p)} className="text-indigo-600">{p.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button>
                        </td>
                        <td className="px-3 py-2 text-right space-x-2">
                          <button onClick={() => edit(p)} className="text-indigo-600 text-xs font-semibold">Edit</button>
                          <button onClick={() => testConnection(p)} className="text-emerald-600 text-xs font-semibold">Test</button>
                          <button onClick={() => remove(p.id)} className="text-rose-600 text-xs font-semibold">Delete</button>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">{testResult[p.id]}</td>
                      </tr>
                      {p.endpoints?.map((ep: any) => (
                        <tr key={`${p.id}-${ep.endpoint_name}`} className="endpoint-row">
                          <td className="px-3 py-1 text-gray-800 text-sm" style={{ paddingLeft: '40px' }}>
                            ↳ {ep.endpoint_name}
                          </td>
                          <td className="px-3 py-1 text-gray-600 text-xs">{ep.method}</td>
                          <td className="px-3 py-1 text-gray-600 text-xs" colSpan={3}>{ep.path}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-500" colSpan={6}>No providers yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {providers.length === 0 && <div className="text-center text-gray-400 text-sm py-6">No providers yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
