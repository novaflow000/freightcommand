import React, { useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { cn } from '../lib/utils';
import { PORT_COORDINATES, deriveInTransitLocation } from '../modules/geo_utils';

interface TacticalMapProps {
  shipments: any[];
}

// Status → color (animated pulsing markers)
// 🟢 In Transit | 🔴 Delayed | ⚫ Pending | 🔵 Delivered
const normalizeStatus = (status: string) => (status || '').toUpperCase().replace(/[\s-]+/g, '_');

const getStatusColor = (status: string): string => {
  const norm = normalizeStatus(status);
  if (norm === 'ARRIVED' || norm === 'DELIVERED') return '#3b82f6'; // 🔵 Delivered
  if (norm === 'IN_TRANSIT') return '#22c55e'; // 🟢 In Transit
  if (norm === 'DELAYED' || norm === 'EXCEPTION' || norm === 'HOLD') return '#ef4444'; // 🔴 Delayed
  return '#374151'; // ⚫ Pending
};

const createPulsingMarkerIcon = (status: string) => {
  const color = getStatusColor(status);
  const size = 20;

  return L.divIcon({
    className: 'custom-div-icon shipment-marker-wrapper',
    html: `<div class="shipment-marker-pulse" style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid rgba(255,255,255,0.9);
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

/**
 * Get vessel position ON THE OCEAN (along route, not at ports).
 * Uses middle waypoints of route when available, or interpolated position between origin/destination.
 */
function getOceanPosition(shipment: any, routePoints: [number, number][]): [number, number] | undefined {
  // Real GPS / AIS position - use if it's along the route (not at port)
  const last =
    shipment.last_location ||
    shipment.vessel_position ||
    (Array.isArray(shipment.route_geometry?.current_coordinates)
      ? { lat: shipment.route_geometry.current_coordinates[0], lng: shipment.route_geometry.current_coordinates[1] }
      : undefined);
  if (last && typeof last.lat === 'number' && typeof last.lng === 'number' && routePoints.length >= 2) {
    const lats = routePoints.map((p) => p[0]);
    const lngs = routePoints.map((p) => p[1]);
    const pad = 8;
    const inOceanBox =
      last.lat >= Math.min(...lats) - pad &&
      last.lat <= Math.max(...lats) + pad &&
      last.lng >= Math.min(...lngs) - pad &&
      last.lng <= Math.max(...lngs) + pad;
    // Only use if not exactly at first/last port (ocean position)
    const atOrigin = routePoints.length && Math.abs(last.lat - routePoints[0][0]) < 0.5 && Math.abs(last.lng - routePoints[0][1]) < 0.5;
    const atDest = routePoints.length && Math.abs(last.lat - routePoints[routePoints.length - 1][0]) < 0.5 && Math.abs(last.lng - routePoints[routePoints.length - 1][1]) < 0.5;
    if (inOceanBox && !atOrigin && !atDest) return [last.lat, last.lng];
  }

  // No real position: place at ocean (middle of route, not at ports)
  if (routePoints.length >= 3) {
    // Use a middle waypoint (indices 1..len-2 are ocean)
    const midIdx = Math.floor(routePoints.length / 2);
    return routePoints[midIdx];
  }
  if (routePoints.length === 2) {
    const derived = deriveInTransitLocation(
      shipment.origin || shipment.origin_port,
      shipment.destination || shipment.destination_port,
      shipment.bl_number || shipment.canonical_id || 'x',
    );
    if (derived) return [derived.lat, derived.lng];
  }
  if (routePoints.length >= 1) {
    return routePoints[0]; // fallback
  }
  return undefined;
}

const jitter = (lat: number, lng: number, seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const delta = 0.04;
  const dx = ((h % 1000) / 1000 - 0.5) * delta;
  const dy = ((((h / 1000) | 0) % 1000) / 1000 - 0.5) * delta;
  return [lat + dy, lng + dx] as [number, number];
};

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  } catch {
    return ts;
  }
}

export default function TacticalMap({ shipments }: TacticalMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  const { markers, bounds } = useMemo(() => {
    const elements: React.ReactElement[] = [];
    const coords: [number, number][] = [];

    shipments.forEach((shipment) => {
      const status = shipment.current_status || shipment.status || 'Unknown';

      // Build route coordinates
      const routePoints: [number, number][] = [];
      const geoCoords = shipment.route_geometry?.route_coordinates || shipment.route_geometry?.geometry?.coordinates;
      if (Array.isArray(geoCoords) && geoCoords.length) {
        geoCoords.forEach((c: any) => {
          if (Array.isArray(c) && c.length >= 2) routePoints.push([c[0], c[1]]);
        });
      } else if (Array.isArray(shipment.route) && shipment.route.length > 0) {
        shipment.route.forEach((pt: any) => {
          if (typeof pt.lat === 'number' && typeof pt.lng === 'number') {
            routePoints.push([pt.lat, pt.lng]);
          }
        });
      } else {
        const o = PORT_COORDINATES[shipment.origin] || PORT_COORDINATES[shipment.origin_port];
        const d = PORT_COORDINATES[shipment.destination] || PORT_COORDINATES[shipment.destination_port];
        if (o) routePoints.push(o as [number, number]);
        if (d) routePoints.push(d as [number, number]);
      }

      // Vessel position (real-time fictive) — no route line, only marker
      const vesselPos = getOceanPosition(shipment, routePoints);

      // Shipment marker — animated pulsing, color-coded by status
      const displayPos =
        vesselPos && routePoints.length >= 2
          ? shipments.filter((s) => s.bl_number !== shipment.bl_number).length > 0
            ? jitter(vesselPos[0], vesselPos[1], shipment.bl_number || '')
            : vesselPos
          : undefined;

      if (displayPos) {
        coords.push(displayPos as [number, number]);
      } else if (routePoints.length >= 2) {
        coords.push(...routePoints); // for bounds when no vessel pos
      }

      if (displayPos) {
        const lastGpsTs =
          shipment.vessel_position?.timestamp ||
          shipment.last_gps_timestamp ||
          shipment.shipment?.checked_at ||
          shipment.shipment?.updated_at ||
          (Array.isArray(shipment.events) && shipment.events.length
            ? shipment.events.reduce((latest: string | null, e: any) => {
                const t = e.event_timestamp || e.timestamp;
                if (!t) return latest;
                if (!latest) return t;
                return new Date(t) > new Date(latest) ? t : latest;
              }, null)
            : null);

        elements.push(
          <Marker key={`${shipment.bl_number}-vessel`} position={displayPos as [number, number]} icon={createPulsingMarkerIcon(status)}>
            <Popup className="custom-popup">
              <div className="p-3 bg-white text-gray-900 min-w-[240px]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm font-mono text-indigo-600">{shipment.bl_number}</h3>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold',
                      normalizeStatus(status) === 'DELIVERED' || normalizeStatus(status) === 'ARRIVED'
                        ? 'bg-blue-50 text-blue-600'
                        : normalizeStatus(status) === 'DELAYED'
                          ? 'bg-rose-50 text-rose-600'
                          : normalizeStatus(status) === 'IN_TRANSIT'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {status}
                  </span>
                </div>
                <div className="text-xs space-y-1.5 border-t border-gray-100 pt-2">
                  <div className="flex justify-between text-gray-600"><span>Shipment ID</span><span className="font-medium">{shipment.bl_number || shipment.canonical_id || '—'}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Carrier</span><span className="font-medium">{shipment.carrier || '—'}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Last GPS update</span><span className="font-medium">{formatTimestamp(lastGpsTs)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Container</span><span className="font-medium">{shipment.container_number || '—'}</span></div>
                  <div className="flex justify-between text-gray-600"><span>ETA</span><span className="font-medium">{shipment.eta || 'TBD'}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Origin</span><span className="font-medium">{shipment.origin || '—'}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Destination</span><span className="font-medium">{shipment.destination || '—'}</span></div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      }
    });

    const bounds =
      coords.length >= 1 ? L.latLngBounds(coords) : L.latLngBounds([[20, -30], [55, 30]]);

    return { markers: elements, bounds };
  }, [shipments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (shipments.length === 0) return;
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [bounds, shipments]);

  const mapKey = useMemo(() => shipments.map((s) => s.bl_number || s.id || '').join('|'), [shipments]);

  return (
    <div className="relative w-full h-full bg-gray-50 min-h-[520px]">
      <MapContainer
        key={mapKey}
        center={[20, 0]}
        zoom={2}
        bounds={bounds}
        whenCreated={(map) => (mapRef.current = map)}
        boundsOptions={{ padding: [80, 80] }}
        zoomControl={false}
        style={{ height: '100%', width: '100%', background: '#f8fafc' }}
        minZoom={2}
        maxZoom={10}
        maxBounds={[
          [85, -180],
          [-85, 180],
        ]}
        maxBoundsViscosity={1}
        worldCopyJump={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}"
          noWrap
          attribution='Tiles © Esri World Physical'
        />

        <ZoomControl position="bottomright" />
        {markers}
      </MapContainer>
    </div>
  );
}
