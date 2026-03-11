import { Calendar, MapPin, Anchor, Box, Ship, Clock, Info, Tag, Percent } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  shipment: any;
}

const statusBadge = (status: string) => {
  const s = (status || '').toUpperCase();
  if (s.includes('DELIVER')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('TRANSIT')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s.includes('DELAY') || s.includes('EXCEPTION')) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
};

const fmt = (d?: string) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : '—';

export default function ShipmentDetailCard({ shipment }: Props) {
  if (!shipment) return null;
  const sh = shipment.shipment || {};
  const route = shipment.route || {};
  const container = shipment.containers?.[0] || {};
  const vessel = shipment.vessels?.[0] || {};
  const progress = route.transit_progress_percent ?? 0;
  const events = shipment.events || [];
  const meta = shipment.metadata || {};

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-lg font-bold text-gray-900">{shipment.bl_number || sh.booking_number || sh.shipment_id}</div>
          <div className="text-sm text-gray-500">{shipment.carrier?.carrier_name || '—'} • {shipment.carrier?.carrier_code || '—'}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border', statusBadge(sh.shipment_status || sh.status || sh.shipment_status || ''))}>
              {sh.shipment_status || 'Unknown'}
            </span>
            <div className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="h-4 w-4" /> ETA {fmt(route.eta)}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1"><Percent className="h-4 w-4" /> {progress}%</div>
          </div>
        </div>
        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
          <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, progress || 0)}%` }} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-indigo-500" />
          <div>
            <div className="text-xs text-gray-500 uppercase">Origin</div>
            <div className="font-semibold text-gray-900">{route.origin_port_name || '—'} <span className="text-gray-500 text-xs">{route.origin_port_code}</span></div>
            <div className="text-xs text-gray-400">Depart {fmt(route.departure_time)}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-emerald-500" />
          <div>
            <div className="text-xs text-gray-500 uppercase">Destination</div>
            <div className="font-semibold text-gray-900">{route.destination_port_name || '—'} <span className="text-gray-500 text-xs">{route.destination_port_code}</span></div>
            <div className="text-xs text-gray-400">ETA {fmt(route.eta)}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] text-gray-500 uppercase font-semibold mb-2 flex items-center gap-1"><Box className="h-4 w-4" /> Cargo & Container</div>
          <div className="space-y-1 text-gray-800">
            <div>Type: {container.container_type || '—'}</div>
            <div>Weight: {container.container_size || '—'}</div>
            <div>Container: {container.container_number || '—'}</div>
            <div>Size/Type: {container.container_size || '—'} / {container.container_type || '—'}</div>
            <div>Client: {shipment.client || '—'}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-[11px] text-gray-500 uppercase font-semibold mb-2 flex items-center gap-1"><Ship className="h-4 w-4" /> Vessel</div>
          <div className="space-y-1 text-gray-800">
            <div>Name: {vessel.vessel_name || vessel.name || '—'}</div>
            <div>IMO: {vessel.vessel_imo || vessel.imo || '—'}</div>
            <div>Voyage: {vessel.voyage_number || vessel.voyage || '—'}</div>
            <div>Last update: {fmt(sh.checked_at || sh.updated_at)}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="text-[11px] text-gray-500 uppercase font-semibold mb-2 flex items-center gap-1"><Clock className="h-4 w-4" /> Event Timeline</div>
        <div className="space-y-3">
          {events.length === 0 && <div className="text-sm text-gray-400">No events yet.</div>}
          {events.map((e: any, idx: number) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-3 bg-white shadow-sm">
              <div className="flex justify-between text-sm font-semibold text-gray-900">
                <span>{e.event_type || 'EVENT'}</span>
                <span className="text-gray-500 text-xs whitespace-nowrap">{fmt(e.event_timestamp)}</span>
              </div>
              <div className="text-xs text-gray-500">{e.event_location_name || '—'} {e.event_location_code && `(${e.event_location_code})`}</div>
              {e.vessel_name && <div className="text-xs text-gray-500">Vessel: {e.vessel_name}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 text-xs text-gray-600 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-1"><Tag className="h-4 w-4 text-gray-400" /> Provider: {sh.provider || '—'}</div>
        <div className="flex items-center gap-1"><Info className="h-4 w-4 text-gray-400" /> Tracking ID: {sh.shipment_id || '—'}</div>
        <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-gray-400" /> Last API update: {fmt(meta.last_api_update_at || sh.updated_at)}</div>
        <div className="flex items-center gap-1"><Info className="h-4 w-4 text-gray-400" /> BL: {shipment.bl_number || sh.booking_number}</div>
        <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-gray-400" /> Last Refresh: {fmt(meta.last_refresh_at)}</div>
        <div className="flex items-center gap-1"><Info className="h-4 w-4 text-gray-400" /> Last Mode: {meta.last_refresh_mode || '—'}</div>
      </section>
    </div>
  );
}
