import { CanonicalizedPayload } from './provider_executor.ts';
import { FusedShipmentData } from './data_fusion.ts';

export interface CanonicalShipmentRecord extends CanonicalizedPayload {
  id: string; // shipment_id or BL
  bl_number?: string;
  client?: string;
}

export interface AnalyticsSnapshot {
  total: number;
  active: number;
  delivered: number;
  delayed: number;
  by_carrier: Record<string, number>;
  by_status: Record<string, number>;
  by_route: Record<string, number>;
  co2_emission_total: number;
  last_updated: string;
}

export interface SearchResult {
  type: 'shipment' | 'container' | 'vessel' | 'port';
  label: string;
  bl_number?: string;
  container_number?: string;
  vessel_name?: string;
  port?: string;
}

export class CanonicalDataService {
  private shipments: Map<string, CanonicalShipmentRecord> = new Map();
  private lastUpdated: string = new Date().toISOString();

  public getById(id: string): CanonicalShipmentRecord | undefined {
    return this.shipments.get(id);
  }

  public upsertFromCanonical(payload: CanonicalizedPayload & { id: string; bl_number?: string; client?: string }) {
    // Fallback: derive route_geometry from embedded route.geometry if mappings absent
    if (!payload.route_geometry && (payload as any).route?.geometry?.coordinates) {
      payload.route_geometry = {
        route_coordinates: (payload as any).route.geometry.coordinates,
        route_geometry_type: (payload as any).route.geometry.type || 'LineString',
      };
    }

    const existing = this.shipments.get(payload.id);
    if (!existing) {
      this.shipments.set(payload.id, { ...payload });
    } else {
      const merged: CanonicalShipmentRecord = { ...existing };
      merged.bl_number = payload.bl_number || existing.bl_number;
      merged.client = payload.client || existing.client;
      merged.shipment = { ...(existing.shipment || {}), ...(payload.shipment || {}) };
      merged.carrier = { ...(existing.carrier || {}), ...(payload.carrier || {}) };
      merged.route = { ...(existing.route || {}), ...(payload.route || {}) };
      merged.metadata = { ...(existing.metadata || {}), ...(payload.metadata || {}) };

      merged.containers = payload.containers?.length ? payload.containers : existing.containers;
      merged.events = payload.events?.length ? payload.events : existing.events;
      merged.vessels = payload.vessels?.length ? payload.vessels : existing.vessels;
      merged.route_geometry = payload.route_geometry || existing.route_geometry;

      this.shipments.set(payload.id, merged);
    }
    this.lastUpdated = new Date().toISOString();
  }

  public upsertInjected(injected: { id: string; bl_number?: string; container_number?: string; booking_number?: string; carrier?: string; client?: string; origin?: string; destination?: string }) {
    const record: CanonicalShipmentRecord = {
      id: injected.id,
      bl_number: injected.bl_number,
      client: injected.client,
      shipment: {
        shipment_id: injected.id,
        booking_number: injected.booking_number || injected.bl_number,
        shipment_status: 'Tracking Requested',
        provider: undefined,
        created_at: new Date().toISOString(),
      },
      carrier: { carrier_name: injected.carrier, carrier_code: injected.carrier },
      route: {
        origin_port_name: injected.origin,
        destination_port_name: injected.destination,
      },
      containers: [
        {
          container_number: injected.container_number,
          container_status: 'Tracking Requested',
        },
      ],
      events: [],
      vessels: [],
      metadata: {},
    };
    this.shipments.set(injected.id, record);
    this.lastUpdated = new Date().toISOString();
  }

  public upsertFromFused(fused: FusedShipmentData) {
    const id = fused.tracking?.tracking_id || fused.bl_number;
    const shipment_status = fused.tracking?.status || fused.tracking?.provider || 'Unknown';
    const eta = fused.tracking?.eta;
    const container_number = fused.tracking?.container_number;

    const canonical: CanonicalShipmentRecord = {
      id,
      bl_number: fused.bl_number,
      client: fused.client,
      shipment: {
        shipment_id: id,
        booking_number: fused.bl_number,
        container_count: fused.tracking?.container_number ? 1 : 0,
        shipment_status,
        shipment_message: undefined,
        created_at: fused.sources?.timestamp,
        updated_at: fused.sources?.timestamp,
        checked_at: fused.sources?.timestamp,
        provider: fused.sources?.api_source,
        endpoint: undefined,
      },
      carrier: {
        carrier_code: fused.tracking?.carrier,
        carrier_name: fused.tracking?.carrier,
      },
      route: {
        origin_port_name: fused.route?.origin,
        destination_port_name: fused.route?.destination,
        eta,
        transit_progress_percent: undefined,
        co2_emission: undefined,
      } as any,
      containers: [
        {
          container_number,
          container_status: shipment_status,
          container_size: fused.cargo?.weight,
          container_type: fused.cargo?.type,
        },
      ],
      events: (fused.tracking?.events || []).map((evt: any) => ({
        event_type: evt.event_type || evt.description || evt.status || 'EVENT',
        event_status: evt.status || evt.event_type || 'UNKNOWN',
        event_timestamp: evt.timestamp || evt.time,
        event_location_name: evt.location?.name || evt.location,
        event_location_code: evt.location?.code,
        event_country_name: evt.location?.country,
      })),
      vessels: [],
      route_geometry: fused.route?.geometry
        ? {
            route_geometry_type: 'LineString',
            route_coordinates: fused.route?.geometry,
          }
        : undefined,
      metadata: {},
    } as CanonicalShipmentRecord;

    // Derive route coordinates for UI map compatibility
    if (!canonical.route_geometry?.route_coordinates && Array.isArray(fused.tracking?.events)) {
      const coords = fused.tracking.events
        .map((e: any) => e.location)
        .filter((l: any) => l && typeof l.lat === 'number' && typeof l.lng === 'number')
        .map((l: any) => [l.lat, l.lng]);
      if (coords.length > 1) {
        canonical.route_geometry = {
          route_geometry_type: 'LineString',
          route_coordinates: coords,
        };
      }
    }

    this.upsertFromCanonical(canonical);
  }

  public listCanonical(filters?: Partial<{ provider: string; carrier: string; status: string; origin: string; destination: string; container: string; booking: string }>): CanonicalShipmentRecord[] {
    const all = Array.from(this.shipments.values());
    if (!filters) return all;
    return all.filter((s) => {
      const sh = s.shipment || {};
      const route = s.route || {};
      const container = s.containers?.[0] || {};
      const status = (sh.shipment_status || '').toLowerCase();
      return (
        (!filters.provider || (sh.provider || '').toLowerCase() === filters.provider.toLowerCase()) &&
        (!filters.carrier || (s.carrier?.carrier_name || s.carrier?.carrier_code || '').toLowerCase() === filters.carrier.toLowerCase()) &&
        (!filters.status || status === filters.status.toLowerCase()) &&
        (!filters.origin || (route.origin_port_name || '').toLowerCase().includes(filters.origin.toLowerCase())) &&
        (!filters.destination || (route.destination_port_name || '').toLowerCase().includes(filters.destination.toLowerCase())) &&
        (!filters.container || (container.container_number || '').toLowerCase().includes(filters.container.toLowerCase())) &&
        (!filters.booking || (sh.booking_number || '').toLowerCase().includes(filters.booking.toLowerCase()))
      );
    });
  }

  public getLegacyShipments(): any[] {
    return Array.from(this.shipments.values()).map((s) => {
      const container = s.containers?.[0] || {};
      const route = s.route || {};
      const coords = s.route_geometry?.route_coordinates;
      const routePoints = Array.isArray(coords)
        ? coords.map((c: any) => ({ lat: c[0], lng: c[1], port: undefined }))
        : [];
      return {
        bl_number: s.bl_number || s.shipment.booking_number,
        client: s.client || 'Client',
        container_number: container.container_number,
        carrier: s.carrier?.carrier_name || s.carrier?.carrier_code,
        origin: route.origin_port_name || '',
        destination: route.destination_port_name || '',
        origin_port: route.origin_port_name,
        destination_port: route.destination_port_name,
        eta: route.eta,
        current_status: s.shipment.shipment_status,
        route: routePoints,
        last_location: undefined,
        events: s.events || [],
        cargo_type: container.container_type || 'Cargo',
        cargo_weight: container.container_size,
        tracking_provider: s.shipment.provider,
        external_tracking_id: s.shipment.shipment_id,
      };
    });
  }

  public getAnalytics(): AnalyticsSnapshot {
    const all = Array.from(this.shipments.values());
    const snapshot: AnalyticsSnapshot = {
      total: all.length,
      active: 0,
      delivered: 0,
      delayed: 0,
      by_carrier: {},
      by_status: {},
      by_route: {},
      co2_emission_total: 0,
      last_updated: this.lastUpdated,
    };

    all.forEach((s) => {
      const status = (s.shipment.shipment_status || 'unknown').toLowerCase().replace(/[\s-]+/g, '_');
      const carrier = s.carrier?.carrier_name || s.carrier?.carrier_code || 'Unknown';
      const routeKey = `${s.route?.origin_port_name || 'Unknown'} → ${s.route?.destination_port_name || 'Unknown'}`;

      snapshot.by_carrier[carrier] = (snapshot.by_carrier[carrier] || 0) + 1;
      snapshot.by_status[status] = (snapshot.by_status[status] || 0) + 1;
      snapshot.by_route[routeKey] = (snapshot.by_route[routeKey] || 0) + 1;
      snapshot.co2_emission_total += Number(s.route?.co2_emission || 0);

      if (status.includes('arrived') || status.includes('delivered')) snapshot.delivered += 1;
      else snapshot.active += 1;
      if (status.includes('delay') || status.includes('exception') || status.includes('hold')) snapshot.delayed += 1;
    });

    return snapshot;
  }

  public search(query: string): SearchResult[] {
    const q = (query || '').toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];
    this.shipments.forEach((s) => {
      const container = s.containers?.[0];
      const route = s.route;
      if (s.shipment.shipment_id?.toLowerCase().includes(q) || s.bl_number?.toLowerCase().includes(q)) {
        results.push({ type: 'shipment', label: s.shipment.shipment_id || s.bl_number || 'Shipment', bl_number: s.bl_number });
      }
      if (container?.container_number?.toLowerCase().includes(q)) {
        results.push({ type: 'container', label: container.container_number, container_number: container.container_number, bl_number: s.bl_number });
      }
      if (route?.origin_port_name?.toLowerCase().includes(q) || route?.destination_port_name?.toLowerCase().includes(q)) {
        results.push({ type: 'port', label: route.origin_port_name || route.destination_port_name || 'Port', bl_number: s.bl_number, port: route.origin_port_name });
      }
      if (s.vessels) {
        s.vessels.forEach((v) => {
          if (v.vessel_name && v.vessel_name.toLowerCase().includes(q)) results.push({ type: 'vessel', label: v.vessel_name, vessel_name: v.vessel_name, bl_number: s.bl_number });
        });
      }
    });
    return results.slice(0, 20);
  }

  public alerts(): any[] {
    const alerts: any[] = [];
    this.shipments.forEach((s) => {
      s.events?.forEach((evt) => {
        if (!evt.event_type) return;
        const type = (evt.event_type || '').toUpperCase();
        if (['ARRV', 'ARRIVAL', 'ARRIVED'].includes(type)) {
          alerts.push({
            type: 'Vessel arrival',
            bl_number: s.bl_number,
            container: s.containers?.[0]?.container_number,
            port: evt.event_location_name,
            at: evt.event_timestamp,
          });
        }
        if (['DISC', 'DELIVERED'].includes(type)) {
          alerts.push({
            type: 'Shipment delivered',
            bl_number: s.bl_number,
            at: evt.event_timestamp,
          });
        }
        if (type.includes('DELAY') || type === 'EXCEPTION') {
          alerts.push({ type: 'Shipment delayed', bl_number: s.bl_number, at: evt.event_timestamp });
        }
      });
    });
    return alerts.slice(-50).reverse();
  }
}

export const canonicalDataService = new CanonicalDataService();
