import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, FlaskConical, X } from 'lucide-react';

export default function ProviderEndpoints() {
  const [providers, setProviders] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ provider_id: '', endpoint_name: '', method: 'POST', path: '', body_template: '{"sample":"value"}', response_root: '' });
  const [testOpen, setTestOpen] = useState(false);
  const [testEndpoint, setTestEndpoint] = useState<any>(null);
  const [testPayload, setTestPayload] = useState<string>('{}');
  const [testResult, setTestResult] = useState<any>(null);

  const load = async () => {
    const [p, e] = await Promise.all([
      fetch('/api/v1/admin/providers').then(r => r.json()),
      fetch('/api/v1/admin/provider-endpoints').then(r => r.json())
    ]);
    setProviders(p);
    setRows(e);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    const body = { ...form, body_template: JSON.parse(form.body_template || '{}') };
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/v1/admin/provider-endpoints/${form.id}` : '/api/v1/admin/provider-endpoints';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await load();
    setForm({ provider_id: '', endpoint_name: '', method: 'POST', path: '', body_template: '{"sample":"value"}', response_root: '' });
  };

  const edit = (row: any) => setForm({ ...row, body_template: JSON.stringify(row.body_template || row.request_template || {}, null, 2) });
  const remove = async (id: string) => { if (!confirm('Delete endpoint?')) return; await fetch(`/api/v1/admin/provider-endpoints/${id}`, { method: 'DELETE' }); load(); };

  const extractVars = (tpl: any, acc: Set<string>) => {
    if (!tpl) return;
    if (typeof tpl === 'string') {
      const matches = tpl.match(/{{\s*([\w\.]+)\s*}}/g) || [];
      matches.forEach((m) => acc.add(m.replace(/{{|}}|\s/g, '')));
    } else if (Array.isArray(tpl)) {
      tpl.forEach((t) => extractVars(t, acc));
    } else if (typeof tpl === 'object') {
      Object.values(tpl).forEach((v) => extractVars(v, acc));
    }
  };

  const extractPathVars = (path: string) => {
    const vars: string[] = [];
    const regex = /{{\s*([\w\.]+)\s*}}/g;
    let m;
    while ((m = regex.exec(path)) !== null) vars.push(m[1]);
    return vars;
  };

  const buildTestPayload = (endpoint: any) => {
    const vars = new Set<string>();
    extractVars(endpoint.body_template || endpoint.request_template || {}, vars);
    extractVars(endpoint.headers_json || {}, vars);
    extractVars(endpoint.query_params_json || {}, vars);
    extractPathVars(endpoint.path || '').forEach((v) => vars.add(v));
    const payload: Record<string, any> = {};
    vars.forEach((v) => (payload[v] = ''));
    // If POST/PUT/PATCH and a structured body_template exists without placeholders, use it as example
    if (['POST', 'PUT', 'PATCH'].includes((endpoint.method || '').toUpperCase()) && endpoint.body_template && Object.keys(payload).length === 0) {
      payload['example'] = endpoint.body_template;
    }
    return Object.keys(payload).length ? payload : { sample: 'add variables here' };
  };

  const openTest = (endpoint: any) => {
    setTestEndpoint(endpoint);
    const payload = buildTestPayload(endpoint);
    setTestPayload(JSON.stringify(payload, null, 2));
    setTestResult(null);
    setTestOpen(true);
  };

  const runTest = async () => {
    if (!testEndpoint) return;
    setTestResult({ loading: true });
    const res = await fetch(`/api/v1/admin/provider-endpoints/${testEndpoint.id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testPayload
    });
    const body = await res.json();
    setTestResult(body);
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Endpoints</h3>
        <div className="flex gap-2">
          <button onClick={() => setForm({ provider_id: '', endpoint_name: '', method: 'POST', path: '', request_template: '{"sample":"value"}', response_root: '' })} className="px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg text-gray-700 inline-flex items-center gap-2"><Plus className="h-4 w-4" /> New</button>
          <button onClick={submit} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg shadow-sm inline-flex items-center gap-2"><Save className="h-4 w-4" /> Save</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-semibold">Provider</label>
            <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })}>
              <option value="">Select provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold">Endpoint Name</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.endpoint_name} onChange={(e) => setForm({ ...form, endpoint_name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Method</label>
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Path</label>
            <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Request Template (JSON)</label>
            <textarea className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" rows={6} value={form.body_template} onChange={(e) => setForm({ ...form, body_template: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">Response Root (optional)</label>
            <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.response_root || ''} onChange={(e) => setForm({ ...form, response_root: e.target.value })} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Path</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-600">{providers.find((p) => p.id === r.provider_id)?.name || r.provider_id}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{r.endpoint_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.method}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.path}</td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button onClick={() => openTest(r)} className="text-blue-600 text-xs font-semibold inline-flex items-center gap-1"><FlaskConical className="h-3.5 w-3.5" />Test</button>
                      <button onClick={() => edit(r)} className="text-indigo-600 text-xs font-semibold">Edit</button>
                      <button onClick={() => remove(r.id)} className="text-rose-600 text-xs font-semibold">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="text-center text-gray-400 text-sm py-6">No endpoints yet.</div>}
          </div>
        </div>
      </div>
    </div>

    {testOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-900">Test Endpoint</h4>
            <button onClick={() => setTestOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-sm text-gray-600">{testEndpoint?.endpoint_name} – {providers.find((p) => p.id === testEndpoint?.provider_id)?.name}</p>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Request Payload (JSON)</label>
            <textarea className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" rows={6} value={testPayload} onChange={(e) => setTestPayload(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <button onClick={runTest} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm">Run Test</button>
          </div>
          {testResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 max-h-96 overflow-auto">
              {testResult.loading ? (
                <div className="text-sm text-gray-500">Running…</div>
              ) : (
                <>
                  <div className="text-sm font-semibold text-gray-900">Status: {testResult.status || 'OK'}</div>
                  <div className="text-xs font-semibold text-gray-700 mt-2">Response</div>
                  <pre className="bg-white border border-gray-200 rounded p-3 text-xs overflow-auto">{JSON.stringify(testResult.payload || testResult, null, 2)}</pre>
                  {testResult.suggestions && (
                    <div className="mt-2">
                      <div className="text-xs font-semibold text-gray-700 mb-1">Suggested mappings</div>
                      <ul className="text-xs text-gray-700 space-y-1 max-h-32 overflow-auto">
                        {testResult.suggestions.map((s: any, idx: number) => (
                          <li key={idx} className="flex justify-between border border-gray-200 rounded px-2 py-1 bg-white">
                            <span>{s.external_field}</span>
                            <span className="text-indigo-600 font-semibold">→ {s.internal_field}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={runTest} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded">Replay Request</button>
                    <button onClick={() => setTestResult(null)} className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded">Edit Request</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
