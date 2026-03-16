import { useState, useEffect, useMemo } from 'react';
import AppHeader from '../components/AppHeader';
import KPIGrid from '../components/KPIGrid';
import OperationsPanel from '../components/OperationsPanel';
import TacticalMap from '../components/TacticalMap';
import InjectionModal from '../components/InjectionModal';
import DetailModal from '../components/DetailModal';
import FiltersBar from '../components/FiltersBar';
import { useFilters } from '../context/FiltersContext';
import { fetchCanonicalAnalytics, fetchCanonicalShipments } from '../services/canonical';

export default function Dashboard() {
  const { filters, setFilters } = useFilters();
  const [canonicalShipments, setCanonicalShipments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);
  const [isInjectionOpen, setIsInjectionOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ship, analytics] = await Promise.all([
        fetchCanonicalShipments(filters),
        fetchCanonicalAnalytics(),
      ]);
      setCanonicalShipments(ship);
      // Derive stats client-side to stay in lock-step with the list data
      const derived = deriveStats(ship);
      setStats({
        ...analytics,
        ...derived,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [filters]);

  const uiShipments = useMemo(() => {
    return canonicalShipments.map((s) => {
      const sh = s.shipment || {};
      const route = s.route || {};
      const container = s.containers?.[0] || {};
      const coords = s.route_geometry?.route_coordinates;
      const currentCoords = s.route_geometry?.current_coordinates;
      const vesselPos = (s as any).vessel_position;
      return {
        bl_number: s.bl_number || sh.booking_number || sh.shipment_id,
        client: s.client || 'Client',
        container_number: container.container_number || '',
        carrier: s.carrier?.carrier_name || s.carrier?.carrier_code || '',
        origin: route.origin_port_name || '',
        destination: route.destination_port_name || '',
        eta: route.eta,
        current_status: sh.shipment_status || '',
        route: Array.isArray(coords) ? coords.map((c: any) => ({ lat: c[0], lng: c[1] })) : [],
        events: s.events || [],
        cargo_type: container.container_type || '',
        cargo_weight: container.container_size || '',
        route_geometry: s.route_geometry,
        status_raw: sh.shipment_status,
        canonical_id: sh.shipment_id,
        last_location: vesselPos
          ? { lat: vesselPos.lat, lng: vesselPos.lng }
          : Array.isArray(currentCoords) && currentCoords.length >= 2
            ? { lat: currentCoords[0], lng: currentCoords[1] }
            : undefined,
        vessel_position: vesselPos,
        shipment: sh,
      };
    });
  }, [canonicalShipments]);

  const carriers = useMemo(() => uiShipments.map((s) => s.carrier || 'Unknown'), [uiShipments]);
  const statuses = useMemo(() => uiShipments.map((s) => s.current_status || 'Unknown'), [uiShipments]);

  const filteredShipments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return uiShipments.filter((s) => {
      const matchesSearch =
        !q ||
        s.bl_number.toLowerCase().includes(q) ||
        s.container_number.toLowerCase().includes(q) ||
        s.origin.toLowerCase().includes(q) ||
        s.destination.toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [uiShipments, search]);

  const onSelectShipment = (s: any) => {
    const found = canonicalShipments.find((c) => c.bl_number === s.bl_number || c.shipment?.shipment_id === s.canonical_id);
    setSelectedShipment(found || s);
  };

  const handleRefresh = async (ids: string[], mode: 'reapply' | 'api' | 'full') => {
    if (!ids.length) return;
    setRefreshing(true);
    try {
      await fetch('/api/v1/shipments/refresh', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ shipment_ids: ids, mode }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden font-sans">
      <AppHeader />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 pb-0 shrink-0">
          <KPIGrid stats={stats} />
        </div>

        {/* Filters */}
        <div className="px-6 pt-4 space-y-3 shrink-0">
          <FiltersBar carriers={carriers} statuses={statuses} />
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search BL / container / port"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            />
            <button
              onClick={() => { setSearch(''); setFilters({ ...filters }); }}
              className="text-xs text-indigo-600 font-semibold hover:text-indigo-700"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden p-6 pt-4 gap-6 min-h-0 items-start">
          {/* Center: Map */}
          <div className="flex-1 relative bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-0 h-[70vh]">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <TacticalMap shipments={filteredShipments} />
            )}
          </div>

          {/* Right Panel: Operations */}
          <div className="w-96 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-h-[70vh] overflow-y-auto">
            <OperationsPanel 
              shipments={filteredShipments}
              onSelectShipment={onSelectShipment}
              onAddShipment={() => setIsInjectionOpen(true)}
              onUpload={() => setIsInjectionOpen(true)}
              onDownloadTemplate={() => window.location.href = '/api/v1/shipments/injected/template'}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <InjectionModal 
        isOpen={isInjectionOpen} 
        onClose={() => setIsInjectionOpen(false)}
        onSuccess={loadData}
      />

      {selectedShipment && (
        <DetailModal 
          shipment={selectedShipment} 
          onClose={() => setSelectedShipment(null)} 
        />
      )}
    </div>
  );
}

// Keep status logic in one place for KPIs
function deriveStats(shipments: any[]) {
  const stats = {
    total: shipments.length,
    in_transit: 0,
    arrived: 0,
    delayed: 0,
    exceptions: 0,
    total_value: 0,
    performance: 0,
    last_updated: new Date().toISOString(),
  };

  shipments.forEach((s) => {
    const status = (s.shipment?.shipment_status || s.current_status || '').toUpperCase().replace(/[\s-]+/g, '_');
    stats.total_value += Number(s.cargo_value || s.route?.cargo_value || 0);
    if (status === 'ARRIVED' || status === 'DELIVERED') stats.arrived += 1;
    else if (status === 'IN_TRANSIT') stats.in_transit += 1;
    else if (status === 'DELAYED' || status === 'EXCEPTION' || status === 'HOLD') stats.delayed += 1;
  });

  stats.performance = stats.total === 0 ? 0 : Math.round((stats.arrived / stats.total) * 100);
  return stats;
}
