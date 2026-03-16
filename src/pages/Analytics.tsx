import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import IntelligencePanel from '../components/IntelligencePanel';
import FiltersBar from '../components/FiltersBar';
import { useFilters } from '../context/FiltersContext';
import { fetchCanonicalAnalytics, fetchCanonicalShipments } from '../services/canonical';
import { Package, AlertTriangle, CheckCircle, Clock, Anchor, TrendingUp, DollarSign, Calendar, Activity } from 'lucide-react';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Analytics() {
  const { filters } = useFilters();
  const [shipments, setShipments] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ship, ana] = await Promise.all([
          fetchCanonicalShipments(filters),
          fetchCanonicalAnalytics(),
        ]);
        setShipments(ship);
        setAnalytics(ana);
      } catch (err) {
        console.error('Analytics fetch failed', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters]);

  const statusDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    shipments.forEach((s) => {
      const status = (s.shipment?.shipment_status || 'Unknown').toUpperCase();
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [shipments]);

  const carrierDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    shipments.forEach((s) => {
      const c = s.carrier?.carrier_name || s.carrier?.carrier_code || 'Unknown';
      map[c] = (map[c] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [shipments]);

  const topRoutes = useMemo(() => {
    const map: Record<string, number> = {};
    shipments.forEach((s) => {
      const route = `${s.route?.origin_port_name || '?'} → ${s.route?.destination_port_name || '?'}`;
      map[route] = (map[route] || 0) + 1;
    });
    return Object.entries(map).map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [shipments]);

  const moroccoOriginBreakdown = useMemo(() => {
    const map: Record<string, number> = analytics.by_origin_port || {};
    return Object.entries(map)
      .filter(([port]) => port !== 'Unknown')
      .map(([port, count]) => ({ port, count }))
      .sort((a, b) => b.count - a.count);
  }, [analytics]);

  const etaBuckets = useMemo(() => {
    const now = new Date();
    const buckets = { 'This week': 0, 'Next 2 weeks': 0, 'Next month': 0, 'Later': 0 };
    shipments.forEach((s) => {
      const eta = s.route?.eta ? new Date(s.route.eta) : null;
      if (!eta || isNaN(eta.getTime())) {
        buckets['Later']++;
        return;
      }
      const days = (eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 7) buckets['This week']++;
      else if (days <= 14) buckets['Next 2 weeks']++;
      else if (days <= 30) buckets['Next month']++;
      else buckets['Later']++;
    });
    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }, [shipments]);

  const eventsPerShipment = useMemo(() => {
    return shipments.slice(0, 15).map((s) => ({
      bl: (s.bl_number || '').slice(-8),
      events: s.events?.length || 0,
    }));
  }, [shipments]);

  const onTimeRate = analytics.total ? Math.round(((analytics.delivered || 0) / analytics.total) * 100) : 0;
  const riskRate = analytics.total ? Math.round(((analytics.delayed || 0) / analytics.total) * 100) : 0;
  const cargoValueTotal = analytics.cargo_value_total ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-sans overflow-auto">
      <AppHeader />

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics Overview</h1>
            <p className="text-gray-500 mt-1">Data from ShipsGo & tracking providers — status, ETA, carrier, events</p>
          </div>

          <FiltersBar
            carriers={shipments.map((s) => s.carrier?.carrier_name || s.carrier?.carrier_code || 'Unknown')}
            statuses={shipments.map((s) => s.shipment?.shipment_status || 'Unknown')}
          />

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <Package className="h-5 w-5 text-indigo-500 mb-2" />
              <div className="text-2xl font-bold text-gray-900">{analytics.total ?? '—'}</div>
              <div className="text-xs text-gray-500">Total shipments</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <CheckCircle className="h-5 w-5 text-emerald-500 mb-2" />
              <div className="text-2xl font-bold text-emerald-600">{analytics.delivered ?? '—'}</div>
              <div className="text-xs text-gray-500">Delivered</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <Clock className="h-5 w-5 text-blue-500 mb-2" />
              <div className="text-2xl font-bold text-blue-600">{analytics.active ?? '—'}</div>
              <div className="text-xs text-gray-500">In Transit</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-rose-500 mb-2" />
              <div className="text-2xl font-bold text-rose-600">{analytics.delayed ?? '—'}</div>
              <div className="text-xs text-gray-500">Delayed</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <TrendingUp className="h-5 w-5 text-violet-500 mb-2" />
              <div className="text-2xl font-bold text-violet-600">{onTimeRate}%</div>
              <div className="text-xs text-gray-500">On-time rate</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <DollarSign className="h-5 w-5 text-amber-500 mb-2" />
              <div className="text-2xl font-bold text-gray-900">${(cargoValueTotal || 0).toLocaleString()}</div>
              <div className="text-xs text-gray-500">Cargo value</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Status (provider status)</h3>
              <div className="h-64">
                {loading ? <div className="text-gray-400 text-sm">Loading…</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {statusDistribution.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v} shipments`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Carrier (provider carrier)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={carrierDistribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Shipments" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> ETA distribution (provider ETA)
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={etaBuckets}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Arriving" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4" /> Events per shipment (provider events)
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventsPerShipment}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="bl" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="events" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Events" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Top routes (origin → destination)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topRoutes} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" />
                    <YAxis dataKey="route" type="category" width={140} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Shipments" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {moroccoOriginBreakdown.length > 0 && (
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Anchor className="h-4 w-4" /> Volume by Morocco origin port
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={moroccoOriginBreakdown} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" />
                      <YAxis dataKey="port" type="category" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Shipments" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="text-sm font-bold text-gray-900 mb-4">Recent shipments</div>
            <IntelligencePanel shipments={shipments.slice(0, 15)} />
          </div>
        </div>
      </div>
    </div>
  );
}
