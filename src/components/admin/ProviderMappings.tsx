import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, CheckSquare } from 'lucide-react';

export default function ProviderMappings() {
  const [providers, setProviders] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [internalFields, setInternalFields] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    provider_id: '',
    endpoint_id: '',
    external_field: '',
    internal_field: '',
    domain_entity: '',
    transformation: '',
    is_array: false,
    default_value: '',
    required: false,
    validation_regex: '',
    custom_transform_fn: '',
    notes: '',
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');
  const [externalFilter, setExternalFilter] = useState<string>('');
  const [internalFilter, setInternalFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [endpointFilter, setEndpointFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    const [p, m] = await Promise.all([
      fetch('/api/v1/admin/providers').then(r => r.json()),
      fetch('/api/v1/admin/provider-mappings').then(r => r.json())
    ]);
    setProviders(p);
    setRows(m);
    if (selectedEndpoint) loadEndpoints(p[0]?.id);
  };
  const loadInternal = async () => {
    const res = await fetch('/internal-fields');
    if (res.ok) setInternalFields(await res.json());
  };
  const loadEndpoints = async (providerId?: string) => {
    if (!providerId) return;
    const res = await fetch(`/api/v1/admin/provider-endpoints?provider_id=${providerId}`);
    if (res.ok) setEndpoints(await res.json());
  };
  useEffect(() => { load(); loadInternal(); }, []);

  const submit = async () => {
    setValidationErrors([]);
    try {
      const errors: string[] = [];
      if (!form.external_field?.trim()) errors.push('External field is required');
      if (!form.internal_field?.trim()) errors.push('Internal field is required');
      if (!form.domain_entity) errors.push('Domain entity is required');
      
      if (form.validation_regex) {
        try {
          new RegExp(form.validation_regex);
        } catch {
          errors.push('Validation regex is invalid');
        }
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }

      const method = form.id ? 'PUT' : 'POST';
      const url = form.id ? `/api/v1/admin/provider-mappings/${form.id}` : '/api/v1/admin/provider-mappings';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      
      if (!res.ok) {
        const error = await res.json();
        setValidationErrors([error.message || 'Failed to save mapping']);
        return;
      }

      await load();
      setForm({
        provider_id: '',
        endpoint_id: '',
        external_field: '',
        internal_field: '',
        domain_entity: '',
        transformation: '',
        is_array: false,
        default_value: '',
        required: false,
        validation_regex: '',
        custom_transform_fn: '',
        notes: '',
      });
    } catch (err: any) {
      setValidationErrors([err.message || 'Failed to save mapping']);
    }
  };

  const edit = (row: any) => setForm({ ...row });
  const remove = async (id: string) => { if (!confirm('Delete mapping?')) return; await fetch(`/api/v1/admin/provider-mappings/${id}`, { method: 'DELETE' }); load(); };
  const generate = async () => {
    if (!selectedEndpoint) return;
    await fetch(`/admin/endpoints/${selectedEndpoint}/auto-mappings`, { method: 'POST' });
    load();
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    await fetch('/api/v1/admin/provider-mappings/delete-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) })
    });
    setSelectedIds(new Set());
    load();
  };

  const filteredRows = rows.filter((r) => {
    const providerMatch = !providerFilter || r.provider_id === providerFilter;
    const endpointMatch = !endpointFilter || r.endpoint_id === endpointFilter;
    const externalMatch = !externalFilter || r.external_field.toLowerCase().includes(externalFilter.toLowerCase());
    const internalMatch =
      !internalFilter ||
      (r.internal_field || '').toLowerCase().includes(internalFilter.toLowerCase()) ||
      (r.domain_entity || '').toLowerCase().includes(internalFilter.toLowerCase());
    return providerMatch && endpointMatch && externalMatch && internalMatch;
  });

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Data Mappings</h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setValidationErrors([]);
              setForm({
                provider_id: '',
                endpoint_id: '',
                external_field: '',
                internal_field: '',
                domain_entity: '',
                transformation: '',
                is_array: false,
                default_value: '',
                required: false,
                validation_regex: '',
                custom_transform_fn: '',
                notes: '',
              });
            }}
            className="px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg text-gray-700 inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New
          </button>
          <button onClick={submit} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg shadow-sm inline-flex items-center gap-2"><Save className="h-4 w-4" /> Save</button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
          <div className="text-sm font-semibold text-rose-900 mb-1">Validation Errors:</div>
          <ul className="text-sm text-rose-700 list-disc list-inside">
            {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold">Provider (for new mapping)</label>
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.provider_id} onChange={(e) => { setForm({ ...form, provider_id: e.target.value }); loadEndpoints(e.target.value); }}>
                <option value="">Select provider</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Endpoint (for auto mappings)</label>
              <select
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={selectedEndpoint}
                onChange={(e) => {
                  setSelectedEndpoint(e.target.value);
                  setForm({ ...form, endpoint_id: e.target.value });
                }}
              >
                <option value="">Select endpoint</option>
                {endpoints.filter((ep) => !form.provider_id || ep.provider_id === form.provider_id).map((ep) => <option key={ep.id} value={ep.id}>{ep.endpoint_name} ({ep.method})</option>)}
              </select>
              <div className="mt-2">
                <button onClick={generate} disabled={!selectedEndpoint} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded disabled:opacity-50">Generate from last response</button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold">External Field</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.external_field} onChange={(e) => setForm({ ...form, external_field: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Internal Field</label>
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.internal_field} onChange={(e) => setForm({ ...form, internal_field: e.target.value })}>
                <option value="">Select field</option>
                {internalFields.map((f) => (
                  <option key={f.id || f.name} value={f.name}>{`${f.domain}: ${f.name}`}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold">Domain Entity</label>
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.domain_entity} onChange={(e) => setForm({ ...form, domain_entity: e.target.value })}>
                <option value="">Select domain</option>
                {['Shipment','Carrier','Route','Container','Event','Vessel','RouteGeometry','Metadata'].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold">Transformation</label>
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.transformation || ''} onChange={(e) => setForm({ ...form, transformation: e.target.value })}>
                <option value="">None</option>
                {['string','number','date','geojson','array','boolean'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_array || false} onChange={(e) => setForm({ ...form, is_array: e.target.checked })} />
                Is Array
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.required || false} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
                Required
              </label>
            </div>
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-indigo-600 font-semibold">
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>
          </div>

          {showAdvanced && (
            <>
              <div>
                <label className="text-xs text-gray-500 font-semibold">Default Value (if missing)</label>
                <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.default_value || ''} onChange={(e) => setForm({ ...form, default_value: e.target.value })} placeholder="e.g., N/A or 0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold">Validation Regex (optional)</label>
                <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" value={form.validation_regex || ''} onChange={(e) => setForm({ ...form, validation_regex: e.target.value })} placeholder="e.g., ^[A-Z]{4}\d{7}$" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold">Custom Transform Function (JavaScript)</label>
                <textarea className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" rows={3} value={form.custom_transform_fn || ''} onChange={(e) => setForm({ ...form, custom_transform_fn: e.target.value })} placeholder="return value.toUpperCase();" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold">Notes</label>
                <textarea className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add any notes about this mapping..." />
              </div>
            </>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-xs text-gray-500">Filtered rows: {filteredRows.length}</div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="border border-gray-200 rounded px-2 py-1 text-xs" value={providerFilter} onChange={(e) => { const v = e.target.value; setProviderFilter(v); setEndpointFilter(''); loadEndpoints(v); }}>
                <option value="">All Providers</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="border border-gray-200 rounded px-2 py-1 text-xs" value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)}>
                <option value="">All Endpoints</option>
                {endpoints.filter((ep) => !providerFilter || ep.provider_id === providerFilter).map((ep) => <option key={ep.id} value={ep.id}>{ep.endpoint_name}</option>)}
              </select>
              <input value={externalFilter} onChange={(e) => setExternalFilter(e.target.value)} placeholder="External contains" className="border border-gray-200 rounded px-2 py-1 text-xs" />
              <input value={internalFilter} onChange={(e) => setInternalFilter(e.target.value)} placeholder="Internal contains" className="border border-gray-200 rounded px-2 py-1 text-xs" />
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1 rounded">
                <span className="text-xs text-rose-700 font-semibold">Selected: {selectedIds.size}</span>
                <button onClick={() => setConfirmOpen(true)} className="px-3 py-1 text-xs bg-rose-600 text-white rounded shadow-sm">Delete Selected</button>
              </div>
            )}
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filteredRows.map((r) => r.id)));
                    else setSelectedIds(new Set());
                  }} /></th>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">External</th>
                  <th className="px-3 py-2 text-left">Internal</th>
                  <th className="px-3 py-2 text-left">Domain</th>
                  <th className="px-3 py-2 text-left">Endpoint</th>
                  <th className="px-3 py-2 text-left">Transform</th>
                  <th className="px-3 py-2 text-left">Array</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
                <tr className="bg-white text-[11px] uppercase tracking-normal">
                  <th></th>
                  <th></th>
                  <th className="px-3 py-1"><input value={externalFilter} onChange={(e) => setExternalFilter(e.target.value)} placeholder="filter external" className="w-full border border-gray-200 rounded px-2 py-1 text-[11px]" /></th>
                  <th className="px-3 py-1"><input value={internalFilter} onChange={(e) => setInternalFilter(e.target.value)} placeholder="filter internal" className="w-full border border-gray-200 rounded px-2 py-1 text-[11px]" /></th>
                  <th className="px-3 py-1"><input value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)} placeholder="filter endpoint" className="w-full border border-gray-200 rounded px-2 py-1 text-[11px]" /></th>
                  <th></th>
                  <th></th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${selectedIds.has(r.id) ? 'bg-indigo-50' : ''}`}>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={selectedIds.has(r.id)} onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(r.id); else next.delete(r.id);
                      setSelectedIds(next);
                    }} /></td>
                    <td className="px-3 py-2 text-xs text-gray-600">{providers.find((p) => p.id === r.provider_id)?.name || r.provider_id}</td>
                    <td className="px-3 py-2 text-gray-800 text-xs">{r.external_field}</td>
                    <td className="px-3 py-2 text-gray-800 text-xs">{r.internal_field}</td>
                    <td className="px-3 py-2 text-gray-700 text-xs">{r.domain_entity}</td>
                    <td className="px-3 py-2 text-gray-700 text-xs">{endpoints.find((ep) => ep.id === r.endpoint_id)?.endpoint_name || r.endpoint_id || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{r.transformation || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{r.is_array ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button onClick={() => edit(r)} className="text-indigo-600 text-xs font-semibold">Edit</button>
                      <button onClick={() => remove(r.id)} className="text-rose-600 text-xs font-semibold">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="text-center text-gray-400 text-sm py-6">No mappings yet.</div>}
          </div>
        </div>
      </div>
    </div>

    {confirmOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-6 w-full max-w-md">
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Confirm deletion</h4>
          <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete the selected mappings? This action cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-700">Cancel</button>
            <button onClick={() => { setConfirmOpen(false); deleteSelected(); }} className="px-4 py-2 text-sm rounded bg-rose-600 text-white">Delete</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
