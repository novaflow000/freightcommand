import React, { useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { cn } from '../lib/utils';
import { PORT_COORDINATES } from '../modules/geo_utils';

interface TacticalMapProps {
  shipments: any[];
}

// Vessel status icon
const createStatusIcon = (status: string) => {
  const norm = (status || '').toUpperCase();
  let color = '#3b82f6'; // default indigo-500
  if (norm === 'ARRIVED' || norm === 'DELIVERED') color = '#10b981';
  else if (norm === 'IN TRANSIT') color = '#6366f1';
  else if (norm === 'DELAYED' || norm === 'EXCEPTION') color = '#e11d48';

  const size = 16;
  const half = size / 2;

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="
      width: 0;
      height: 0;
      border-left: ${half}px solid transparent;
      border-right: ${half}px solid transparent;
      border-bottom: ${size}px solid ${color};
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.25));
      transform: translateY(-2px);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [half, size],
    popupAnchor: [0, -size],
  });
};

// Small triangle for ports
const portIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 10px solid #4f46e5;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
      transform: translateY(-2px);
    "></div>`,
  iconSize: [12, 10],
  iconAnchor: [6, 10],
  popupAnchor: [0, -8],
});

const jitter = (lat: number, lng: number, seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const delta = 0.04;
  const dx = ((h % 1000) / 1000 - 0.5) * delta;
  const dy = ((((h / 1000) | 0) % 1000) / 1000 - 0.5) * delta;
  return [lat + dy, lng + dx] as [number, number];
};

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

      // Vessel position (use only real coordinates; if out-of-bounds vs route, snap to route midpoint)
      const last =
        shipment.last_location ||
        shipment.vessel_position ||
        (Array.isArray(shipment.route_geometry?.current_coordinates) ? { lat: shipment.route_geometry.current_coordinates[0], lng: shipment.route_geometry.current_coordinates[1] } : undefined) ||
        shipment.location;
      let vesselPos: [number, number] | undefined =
        last && typeof last.lat === 'number' && typeof last.lng === 'number'
          ? ([last.lat, last.lng] as [number, number])
          : undefined;

      if (vesselPos && routePoints.length >= 2) {
        const lats = routePoints.map((p) => p[0]);
        const lngs = routePoints.map((p) => p[1]);
        const pad = 5; // degrees padding around route bbox
        const inBox =
          vesselPos[0] >= Math.min(...lats) - pad &&
          vesselPos[0] <= Math.max(...lats) + pad &&
          vesselPos[1] >= Math.min(...lngs) - pad &&
          vesselPos[1] <= Math.max(...lngs) + pad;
        if (!inBox) {
          const midIdx = Math.floor(routePoints.length / 2);
          vesselPos = routePoints[midIdx];
        }
      }

      // Polyline for route
      if (routePoints.length >= 2) {
        coords.push(...routePoints);
        const highlighted = shipments.length === 1;
        elements.push(
          <Polyline
            key={`${shipment.bl_number}-route`}
            positions={routePoints}
            pathOptions={{
              color: highlighted ? '#7c3aed' : '#4f46e5',
              weight: highlighted ? 4 : 2.5,
              dashArray: highlighted ? undefined : '8 6',
              opacity: status?.toUpperCase() === 'DELAYED' ? 0.7 : 0.6,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          >
            <Popup>
              <div className="text-xs text-gray-900 space-y-1">
                <div className="font-semibold">{shipment.bl_number}</div>
                <div className="text-gray-600">{shipment.carrier}</div>
                <div className="text-gray-600">{shipment.origin} → {shipment.destination}</div>
                <div className="text-gray-600">ETA: {shipment.eta || '—'}</div>
                <div className="text-gray-600">Status: {status}</div>
              </div>
            </Popup>
          </Polyline>
        );

        // Port markers along route
        routePoints.forEach((pt, idx) => {
          const portName = shipment.route?.[idx]?.port || (idx === 0 ? shipment.origin_port || shipment.origin : idx === routePoints.length - 1 ? shipment.destination_port || shipment.destination : 'Waypoint');
          elements.push(
            <Marker key={`${shipment.bl_number}-port-${idx}`} position={pt} icon={portIcon}>
              <Popup>
                <div className="text-xs text-gray-800">
                  <div className="font-semibold">{portName}</div>
                  <div className="text-gray-500">BL {shipment.bl_number}</div>
                  <div className="text-gray-500">ETA {shipment.eta || '—'}</div>
                </div>
              </Popup>
            </Marker>
          );
        });
      }

      // Vessel marker
      if (vesselPos && vesselPos.length === 2) {
        coords.push(vesselPos as [number, number]);
        elements.push(
          <Marker key={`${shipment.bl_number}-vessel`} position={vesselPos as [number, number]} icon={createStatusIcon(status)}>
            <Popup className="custom-popup">
              <div className="p-3 bg-white text-gray-900 min-w-[220px]">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-sm font-mono text-indigo-600">{shipment.bl_number}</h3>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold',
                      status?.toUpperCase() === 'DELIVERED' || status?.toUpperCase() === 'ARRIVED'
                        ? 'bg-emerald-50 text-emerald-600'
                        : status?.toUpperCase() === 'DELAYED'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-indigo-50 text-indigo-600',
                    )}
                  >
                    {status}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between text-gray-600"><span>Container</span><span className="font-medium">{shipment.container_number}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Carrier</span><span className="font-medium">{shipment.carrier}</span></div>
                  <div className="flex justify-between text-gray-600"><span>ETA</span><span className="font-medium">{shipment.eta || 'TBD'}</span></div>
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

  return (
    <div className="relative w-full h-full bg-gray-50 min-h-[520px]">
      <MapContainer
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
