import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import IntelligencePanel from '../components/IntelligencePanel';
import FiltersBar from '../components/FiltersBar';
import { useFilters } from '../context/FiltersContext';
import { fetchCanonicalAnalytics, fetchCanonicalShipments } from '../services/canonical';

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

  const carrierPerformance = useMemo(() => {
    const carriers: Record<string, number[]> = {};
    shipments.forEach((s) => {
      const carrier = s.carrier?.carrier_name || s.carrier?.carrier_code || 'Unknown';
      const transit = s.route?.transit_time_days;
      if (transit) {
        if (!carriers[carrier]) carriers[carrier] = [];
        carriers[carrier].push(Number(transit));
      }
    });
    return Object.entries(carriers).map(([carrier, times]) => ({
      carrier,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
    }));
  }, [shipments]);

  const topRoutes = useMemo(() => {
    const map: Record<string, number> = {};
    shipments.forEach((s) => {
      const route = `${s.route?.origin_port_name || 'Unknown'} → ${s.route?.destination_port_name || 'Unknown'}`;
      map[route] = (map[route] || 0) + 1;
    });
    return Object.entries(map).map(([route, count]) => ({ route, count })).slice(0, 8);
  }, [shipments]);

  const eventFrequency = useMemo(() => {
    return shipments.map((s) => ({
      bl: s.bl_number || s.shipment?.booking_number,
      events: s.events?.length || 0,
    }));
  }, [shipments]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-sans overflow-auto">
      <AppHeader />
      
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics Overview</h1>
              <p className="text-gray-500 mt-1">Powered by canonical shipment data.</p>
            </div>
          </div>

          <FiltersBar carriers={shipments.map((s) => s.carrier?.carrier_name || s.carrier?.carrier_code || 'Unknown')} statuses={shipments.map((s) => s.shipment?.shipment_status || 'Unknown')} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Status Distribution</h3>
              <div className="h-64">
                {loading ? <div className="text-gray-400 text-sm">Loading…</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Carrier Performance (avg transit days)</h3>
              <div className="h-64">
                {loading ? <div className="text-gray-400 text-sm">Loading…</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={carrierPerformance}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="carrier" tick={{fontSize: 11}} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="avg" fill="#4f46e5" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Top Routes</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topRoutes}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="route" tick={{fontSize: 11}} interval={0} angle={-20} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Event Frequency</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={eventFrequency}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="bl" hide />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="events" stroke="#f59e0b" strokeWidth={3} dot={{r: 3}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Total Shipments</div>
              <div className="text-2xl font-bold text-gray-900">{analytics.total ?? '—'}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Delayed</div>
              <div className="text-2xl font-bold text-gray-900">{analytics.delayed ?? '—'}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">CO₂ Total</div>
              <div className="text-2xl font-bold text-gray-900">{analytics.co2_emission_total ?? '—'}</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="text-sm font-bold text-gray-900 mb-4">Recent Shipments (canonical)</div>
            <IntelligencePanel shipments={shipments.slice(0, 15)} />
          </div>
        </div>
      </div>
    </div>
  );
}
