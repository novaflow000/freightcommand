import {useEffect, useState} from 'react';
import {Save, Key, ShieldCheck, ShieldAlert, RefreshCw, Eye, EyeOff, Info, Copy, Activity} from 'lucide-react';

interface ApiSettingsProps {
  addLog: (msg: string) => void;
}

type CarrierKey = 'hapagLloyd' | 'maersk' | 'cmaCgm';

export default function ApiSettings({addLog}: ApiSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const apiBase = typeof window !== 'undefined'
    ? window.location.origin.replace('127.0.0.1:4173', 'localhost:3000').replace('5173', '3000')
    : '';

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      addLog('Error fetching settings; showing editable placeholder.');
      setSettings({
        apiKeys: {
          hapagLloyd: {clientId: '', clientSecret: ''},
          maersk: {apiKey: ''},
          cmaCgm: {apiKey: ''},
        },
        status: {
          hapagLloyd: {status: 'missing'},
          maersk: {status: 'missing'},
          cmaCgm: {status: 'missing'},
        },
      });
    }
  };

  const fetchCarrierStatus = async () => {
    try {
      setValidating(true);
      const res = await fetch(`${apiBase}/api/v1/admin/settings/validate`, {method: 'POST'});
      if (res.ok) {
        const status = await res.json();
        setSettings((prev: any) => ({...prev, status}));
        addLog('Carrier connectivity checked');
      }
    } catch {
      addLog('Error validating carriers');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/settings`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({apiKeys: settings.apiKeys}),
      });
      if (!res.ok) throw new Error();
      addLog('API Keys updated successfully');
      await fetchCarrierStatus();
    } catch {
      addLog('Error saving API keys');
    } finally {
      setLoading(false);
    }
  };

  const renderStatusPill = (carrier: CarrierKey) => {
    const status = settings?.status?.[carrier]?.status || 'missing';
    const lastValidated = settings?.status?.[carrier]?.lastValidated;
    const message = settings?.status?.[carrier]?.message;
    const colorMap: Record<string, string> = {
      ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      simulated: 'bg-amber-50 text-amber-700 border-amber-200',
      missing: 'bg-gray-50 text-gray-600 border-gray-200',
      error: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${colorMap[status]}`}>
        {status === 'ok' ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        <span className="uppercase tracking-wider">{status}</span>
        {lastValidated && <span className="text-[10px] text-gray-500">{new Date(lastValidated).toLocaleTimeString()}</span>}
        {message && <span className="text-[10px] text-gray-500">{message}</span>}
      </div>
    );
  };

  const copyToClipboard = (text: string) =>
    navigator?.clipboard?.writeText(text).then(() => addLog('Copied to clipboard')).catch(() => {});

  if (!settings) return <div className="p-8 text-gray-500">Loading settings...</div>;

  const statusGrid = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {(['hapagLloyd', 'maersk', 'cmaCgm'] as CarrierKey[]).map((c) => {
        const state = settings?.status?.[c]?.status || 'missing';
        const ts = settings?.status?.[c]?.lastValidated;
        const base = state === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : state === 'simulated' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-rose-50 border-rose-200 text-rose-700';
        return (
          <div key={c} className={`rounded-lg border ${base} p-3 text-sm`}> 
            <div className="flex items-center justify-between">
              <span className="font-semibold capitalize">{c.replace('cmaCgm','CMA CGM')}</span>
              {state === 'ok' ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </div>
            <div className="text-xs mt-1 capitalize">{state}</div>
            {ts && <div className="text-[10px] opacity-70">Checked {new Date(ts).toLocaleTimeString()}</div>}
          </div>
        );
      })}
    </div>
  );

  const carrierBlocks: Array<{key: CarrierKey; title: string; fields: {label: string; path: string}[]}> = [
    {key: 'hapagLloyd', title: 'Hapag-Lloyd', fields: [{label: 'Client ID', path: 'clientId'}, {label: 'Client Secret', path: 'clientSecret'}]},
    {key: 'maersk', title: 'Maersk', fields: [{label: 'API Key', path: 'apiKey'}]},
    {key: 'cmaCgm', title: 'CMA CGM', fields: [{label: 'API Key', path: 'apiKey'}]},
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-1 tracking-tight">
            <Key className="h-6 w-6 text-indigo-600" /> Carrier API Configuration
          </h2>
          <p className="text-gray-500 text-sm">Manage credentials, validate connectivity, and monitor carrier health.</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
            <Info className="h-4 w-4" /> Secrets are masked locally; validation runs server-side.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowSecrets((v) => !v)}
            className="inline-flex items-center gap-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg border border-gray-200"
          >
            {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {showSecrets ? 'Hide' : 'Show'} secrets
          </button>
          <button
            type="button"
            onClick={fetchCarrierStatus}
            disabled={validating}
            className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg border border-indigo-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${validating ? 'animate-spin' : ''}`} /> Test Connections
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-700 font-semibold">
            <Activity className="h-4 w-4 text-indigo-600" /> Carrier Health Snapshot
          </div>
          <button
            type="button"
            onClick={fetchCarrierStatus}
            disabled={validating}
            className="inline-flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${validating ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {statusGrid}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {carrierBlocks.map((block) => (
            <div key={block.key} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-start justify-between mb-4 pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{block.title}</h3>
                  <p className="text-xs text-gray-500">Store credentials and monitor reachability.</p>
                </div>
                {renderStatusPill(block.key)}
              </div>
              <div className="space-y-4">
                {block.fields.map((field) => (
                  <div key={field.label}>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{field.label}</label>
                    <div className="flex gap-2">
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-mono"
                        value={settings.apiKeys[block.key][field.path]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            apiKeys: {
                              ...settings.apiKeys,
                              [block.key]: {...settings.apiKeys[block.key], [field.path]: e.target.value},
                            },
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(settings.apiKeys[block.key][field.path] || '')}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition"
                        title="Copy"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center shadow-sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving…' : 'Save & Validate'}
          </button>
        </div>
      </form>
    </div>
  );
}
