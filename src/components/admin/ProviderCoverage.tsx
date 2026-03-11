import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';

export default function ProviderCoverage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ provider_id: '', carrier_code: '' });

  const load = async () => {
    const [p, c] = await Promise.all([
      fetch('/api/v1/admin/providers').then(r => r.json()),
      fetch('/api/v1/admin/provider-coverage').then(r => r.json())
    ]);
    setProviders(p);
    setRows(c);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const url = form.id ? `/api/v1/admin/provider-coverage/${form.id}` : '/api/v1/admin/provider-coverage';
    const method = form.id ? 'POST' : 'POST'; // both go through upsert
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ provider_id: '', carrier_code: '' });
    load();
  };

  const edit = (row: any) => setForm(row);
  const remove = async (id: string) => { if (!confirm('Delete coverage?')) return; await fetch(`/api/v1/admin/provider-coverage/${id}`, { method: 'DELETE' }); load(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Carrier Coverage</h3>
        <div className="flex gap-2">
          <button onClick={() => setForm({ provider_id: '', carrier_code: '' })} className="px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg text-gray-700 inline-flex items-center gap-2"><Plus className="h-4 w-4" /> New</button>
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
          <div>
            <label className="text-xs text-gray-500 font-semibold">Carrier Code (e.g. MSC, CMA_CGM, ALL)</label>
            <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.carrier_code} onChange={(e) => setForm({ ...form, carrier_code: e.target.value })} />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Carrier</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-600">{providers.find((p) => p.id === r.provider_id)?.name || r.provider_id}</td>
                    <td className="px-3 py-2 text-gray-800 text-xs">{r.carrier_code}</td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button onClick={() => edit(r)} className="text-indigo-600 text-xs font-semibold">Edit</button>
                      <button onClick={() => remove(r.id)} className="text-rose-600 text-xs font-semibold">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="text-center text-gray-400 text-sm py-6">No coverage defined.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
