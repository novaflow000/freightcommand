import { useState, useEffect } from 'react';
import { Bell, Save, Mail, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';

interface AlertConfigProps {
  addLog: (msg: string) => void;
}

export default function AlertConfig({ addLog }: AlertConfigProps) {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [testing, setTesting] = useState(false);
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
    } catch (err) {
      addLog('Error fetching settings');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts: settings.alerts })
      });
      
      if (res.ok) {
        addLog('Alert settings updated successfully');
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      addLog('Error saving alert settings');
    } finally {
      setLoading(false);
    }
  };

  const triggerTestAlert = async () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      addLog('Test alert dispatched (simulated)');
    }, 1200);
  };

  if (!settings) return <div className="p-8 text-gray-500">Loading settings...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-2 tracking-tight">
          <Bell className="h-6 w-6 text-indigo-600" /> Advanced Alerts
        </h2>
        <p className="text-gray-500 text-sm">Configure system notifications and thresholds.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 pb-4 border-b border-gray-100">Thresholds & Triggers</h3>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-900">Delay Threshold</label>
                <p className="text-xs text-gray-500 mt-1">Number of days delayed before triggering an alert.</p>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0"
                  className="w-24 bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-mono text-center"
                  value={settings.alerts.delayThresholdDays}
                  onChange={e => setSettings({...settings, alerts: {...settings.alerts, delayThresholdDays: parseInt(e.target.value)}})}
                />
                <span className="text-gray-500 text-sm">days</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-6">
              <div>
                <label className="block text-sm font-medium text-gray-900">Notify on Arrival</label>
                <p className="text-xs text-gray-500 mt-1">Send alerts when shipments reach their destination.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" 
                  checked={settings.alerts.notifyOnArrival}
                  onChange={e => setSettings({...settings, alerts: {...settings.alerts, notifyOnArrival: e.target.checked}})}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-6">
              <div>
                <label className="block text-sm font-medium text-gray-900">Notify on Delay</label>
                <p className="text-xs text-gray-500 mt-1">Send alerts when shipments exceed delay threshold.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" 
                  checked={settings.alerts.notifyOnDelay}
                  onChange={e => setSettings({...settings, alerts: {...settings.alerts, notifyOnDelay: e.target.checked}})}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-6">
              <div>
                <label className="block text-sm font-medium text-gray-900">Escalation Policy</label>
                <p className="text-xs text-gray-500 mt-1">Escalate after consecutive alert occurrences.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  value={settings.alerts.escalation || 'none'}
                  onChange={e => setSettings({...settings, alerts: {...settings.alerts, escalation: e.target.value}})}
                >
                  <option value="none">None</option>
                  <option value="3">After 3 alerts</option>
                  <option value="5">After 5 alerts</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 pb-4 border-b border-gray-100">Notification Channels</h3>
          
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email Recipients</label>
            <p className="text-xs text-gray-500 mb-3">Comma-separated list of email addresses.</p>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="admin@example.com, ops@example.com"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-mono"
                value={settings.alerts.emailRecipients.join(', ')}
                onChange={e => setSettings({...settings, alerts: {...settings.alerts, emailRecipients: e.target.value.split(',').map((s: string) => s.trim())}})}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center shadow-sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
          <button 
            type="button"
            onClick={triggerTestAlert}
            disabled={testing}
            className="ml-3 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Testing…' : 'Send Test Alert'}
          </button>
        </div>
      </form>
    </div>
  );
}
