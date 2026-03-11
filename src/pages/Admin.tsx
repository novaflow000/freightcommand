import {useEffect, useMemo, useState} from 'react';
import AppHeader from '../components/AppHeader';
import DetailModal from '../components/DetailModal';
import EditShipmentModal from '../components/EditShipmentModal';
import ApiSettings from '../components/admin/ApiSettings';
import Providers from '../components/admin/Providers';
import ProviderEndpoints from '../components/admin/ProviderEndpoints';
import ProviderMappings from '../components/admin/ProviderMappings';
import ProviderCoverage from '../components/admin/ProviderCoverage';
import UserManagement from '../components/admin/UserManagement';
import AlertConfig from '../components/admin/AlertConfig';
import {
  Activity,
  Database,
  Server,
  Trash2,
  RefreshCw,
  Terminal,
  Search,
  Download,
  Eye,
  Edit,
  Key,
  Users,
  Bell,
  LayoutDashboard,
  Globe2,
  ShieldCheck,
  AlertTriangle,
  Cpu,
} from 'lucide-react';

interface Shipment {
  bl_number: string;
  client: string;
  carrier: string;
  status: string;
  created_at: string;
  cargo_value?: string;
}

interface SystemStatus {
  'Hapag-Lloyd': boolean;
  'Maersk': boolean;
  'CMA CGM': boolean;
}

type AdminSection = 'dashboard' | 'api-keys' | 'users' | 'alerts' | 'providers' | 'endpoints' | 'mappings' | 'coverage';

export default function Admin() {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 80));
  };

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const load = async () => {
      setLoading(true);
      try {
        const [shipRes, statusRes, perfRes] = await Promise.all([
          fetch('/api/v1/shipments/injected', {signal: controller.signal}),
          fetch('/api/v1/config/carriers', {signal: controller.signal}),
          fetch('/api/v1/analytics/performance', {signal: controller.signal}),
        ]);
        if (shipRes.ok) setShipments(await shipRes.json());
        if (statusRes.ok) setSystemStatus(await statusRes.json());
        if (perfRes.ok) setStats(await perfRes.json());
      } catch (err) {
        addLog('Error fetching admin data: ' + String(err));
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    };
    load();
    addLog(`Navigated to ${activeSection}`);
  }, [activeSection]);

  const handleDelete = async (bl: string) => {
    if (!confirm(`Delete shipment ${bl}?`)) return;
    try {
      const res = await fetch(`/api/v1/shipments/injected/${bl}`, {method: 'DELETE'});
      if (res.ok) {
        setShipments((prev) => prev.filter((s) => s.bl_number !== bl));
        addLog(`Deleted shipment ${bl}`);
      }
    } catch (err) {
      addLog(`Delete failed: ${err}`);
    }
  };

  const handleForceUpdate = async () => {
    try {
      addLog('Triggering batch tracking update…');
      await fetch('/api/v1/shipments/tracking/batch', {method: 'POST'});
    } catch (err) {
      addLog('Batch update failed: ' + err);
    }
  };

  const handleExport = () => {
    addLog('Exporting CSV…');
    window.location.href = '/api/v1/export/csv';
  };

  const filteredShipments = useMemo(
    () =>
      shipments.filter(
        (s) =>
          s.bl_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.carrier.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [shipments, searchTerm],
  );

  const enterpriseMetrics = [
    {label: 'Shipments', value: stats.total ?? shipments.length, icon: Database, tone: 'text-indigo-600'},
    {
      label: 'Total Value',
      value: stats.total_value ? `$${(stats.total_value / 1_000_000).toFixed(2)}M` : '—',
      icon: Globe2,
      tone: 'text-amber-600',
    },
    {label: 'Performance', value: stats.performance ? `${stats.performance}%` : '—', icon: ShieldCheck, tone: 'text-emerald-600'},
    {
      label: 'Delayed / Exceptions',
      value: `${stats.delayed ?? 0} / ${stats.exceptions ?? 0}`,
      icon: AlertTriangle,
      tone: 'text-rose-600',
    },
    {label: 'In Transit', value: stats.in_transit ?? 0, icon: Activity, tone: 'text-blue-600'},
    {label: 'Arrived', value: stats.arrived ?? 0, icon: Server, tone: 'text-emerald-600'},
  ];

  const renderDashboard = () => (
    <div className="flex-1 overflow-auto bg-slate-25">
      <div className="px-8 py-6 border-b border-slate-200 bg-white sticky top-0 z-10 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase font-semibold text-slate-500">Control Tower</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Command Center</h1>
          <p className="text-slate-500 text-sm">Real-time visibility on carriers, data pipelines, and users.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleForceUpdate}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4" /> Resync Carriers
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {enterpriseMetrics.map((kpi, idx) => (
            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{kpi.label}</span>
                <kpi.icon className={`h-4 w-4 ${kpi.tone}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm xl:col-span-2">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Shipment Ledger</h3>
                <p className="text-slate-500 text-sm">Live injected records with audit controls.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search BL / client / carrier"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              </div>
            </div>
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-left">BL</th>
                    <th className="px-6 py-3 text-left">Client</th>
                    <th className="px-6 py-3 text-left">Carrier</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Value</th>
                    <th className="px-6 py-3 text-left">Created</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                        No records.
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.map((s) => (
                      <tr key={s.bl_number} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-semibold text-slate-900">{s.bl_number}</td>
                        <td className="px-6 py-3 text-slate-700">{s.client}</td>
                        <td className="px-6 py-3 text-slate-700">{s.carrier}</td>
                        <td className="px-6 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                              s.status === 'Arrived'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : s.status === 'In Transit'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-700">
                          {s.cargo_value ? `$${Number(s.cargo_value).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-6 py-3 text-slate-500">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setSelectedShipment(s)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingShipment(s)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(s.bl_number)}
                              className="p-1.5 text-slate-500 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Carrier Uptime</h3>
                  <p className="text-slate-500 text-sm">Credential health + reachability</p>
                </div>
                <Cpu className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="p-6 grid grid-cols-3 gap-3">
                {['Hapag-Lloyd', 'Maersk', 'CMA CGM'].map((c) => {
                  const up = systemStatus ? (systemStatus as any)[c] : false;
                  return (
                    <div
                      key={c}
                      className={`rounded-lg border px-3 py-3 text-sm ${
                        up ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      <div className="font-semibold">{c}</div>
                      <div className="text-xs opacity-80">{up ? 'Operational' : 'Attention needed'}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Event Log</h3>
                <Terminal className="h-4 w-4 text-slate-500" />
              </div>
              <div className="p-4 h-56 overflow-y-auto font-mono text-[11px] text-slate-700 bg-slate-950 text-slate-200 rounded-b-xl">
                {logs.length === 0 ? 'No events yet.' : logs.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Quick Access</h3>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <button
                  onClick={() => setActiveSection('api-keys')}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 text-left"
                >
                  <Key className="h-4 w-4 text-indigo-600" /> API Credentials
                </button>
                <button
                  onClick={() => setActiveSection('users')}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 text-left"
                >
                  <Users className="h-4 w-4 text-indigo-600" /> Identity & Access
                </button>
                <button
                  onClick={() => setActiveSection('alerts')}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 text-left"
                >
                  <Bell className="h-4 w-4 text-indigo-600" /> Alerting Rules
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'api-keys':
        return <ApiSettings addLog={addLog} />;
      case 'users':
        return <UserManagement addLog={addLog} />;
      case 'alerts':
        return <AlertConfig addLog={addLog} />;
      case 'providers':
        return <div className="flex-1 overflow-auto p-8"><Providers /></div>;
      case 'endpoints':
        return <div className="flex-1 overflow-auto p-8"><ProviderEndpoints /></div>;
      case 'mappings':
        return <div className="flex-1 overflow-auto p-8"><ProviderMappings /></div>;
      case 'coverage':
        return <div className="flex-1 overflow-auto p-8"><ProviderCoverage /></div>;
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans text-gray-900 overflow-auto">
      <AppHeader />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-60 bg-white border-r border-slate-200 flex flex-col shadow-sm">
          <div className="p-4 space-y-1">
            <button
              onClick={() => setActiveSection('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'dashboard'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveSection('api-keys')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'api-keys'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Key className="h-4 w-4" />
              API Keys
            </button>
            <button
              onClick={() => setActiveSection('users')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'users'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users className="h-4 w-4" />
              Users
            </button>
            <button
              onClick={() => setActiveSection('alerts')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'alerts'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Bell className="h-4 w-4" />
              Alerts
            </button>
            <div className="border-t border-slate-200 my-2"></div>
            <button
              onClick={() => setActiveSection('providers')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'providers'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Globe2 className="h-4 w-4" />
              Providers
            </button>
            <button
              onClick={() => setActiveSection('endpoints')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'endpoints'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Server className="h-4 w-4" />
              Endpoints
            </button>
            <button
              onClick={() => setActiveSection('mappings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'mappings'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Database className="h-4 w-4" />
              Data Mapping
            </button>
            <button
              onClick={() => setActiveSection('coverage')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSection === 'coverage'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Server className="h-4 w-4" />
              Carrier Coverage
            </button>
          </div>
        </div>

        {renderContent()}
      </div>

      {selectedShipment && (
        <DetailModal shipment={selectedShipment} onClose={() => setSelectedShipment(null)} />
      )}
      {editingShipment && (
        <EditShipmentModal
          shipment={editingShipment}
          onClose={() => setEditingShipment(null)}
          onSuccess={() => {
            setEditingShipment(null);
            addLog(`Updated shipment ${editingShipment.bl_number}`);
          }}
        />
      )}
    </div>
  );
}
