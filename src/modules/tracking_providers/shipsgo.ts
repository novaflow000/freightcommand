import {BaseTrackingProvider, UnifiedShipment, UnifiedEvent} from './base_provider.ts';

export class ShipsGoProvider extends BaseTrackingProvider {
  constructor(apiKey: string) {
    super('ShipsGo', apiKey, 'https://api.shipsgo.com');
    // ShipsGo uses a custom header token instead of Bearer auth
    this.client.defaults.headers.common['Authorization'] = undefined as any;
    this.client.defaults.headers.common['X-Shipsgo-User-Token'] = apiKey;
  }

  async createTracking(container_number: string, booking_number?: string, carrier?: string): Promise<string> {
    if (!this.apiKey) {
      // No key available, simulate creation
      return `sim-${container_number}`;
    }

    try {
      const res = await this.client.post('/v2/ocean/shipments', {
        reference: booking_number || container_number,
        container_number,
        booking_number,
        carrier,
        tags: ['platform'],
      });
      return res.data?.shipment_id || res.data?.id || res.data?.tracking_id;
    } catch (err) {
      console.warn('ShipsGo createTracking failed, falling back to simulation:', err);
      return `sim-${container_number}`;
    }
  }

  async getShipment(tracking_id: string): Promise<UnifiedShipment> {
    if (!this.apiKey || tracking_id.startsWith('sim-')) {
      return this.simulateShipment(tracking_id, tracking_id.replace('sim-',''));
    }

    try {
      const res = await this.client.get(`/v2/ocean/shipments/${tracking_id}`);
      return this.normalize(res.data, tracking_id);
    } catch (err) {
      console.warn('ShipsGo getShipment failed, using simulated data:', err);
      return this.simulateShipment(tracking_id, tracking_id);
    }
  }

  async getShipmentEvents(tracking_id: string): Promise<UnifiedEvent[]> {
    if (!this.apiKey || tracking_id.startsWith('sim-')) {
      return this.simulateShipment(tracking_id, tracking_id).events;
    }
    try {
      const res = await this.client.get(`/v2/ocean/shipments/${tracking_id}/events`);
      return (res.data?.events || []).map((evt: any) => ({
        event_type: evt.event_type || evt.type || evt.status,
        description: evt.description || evt.status || 'Event',
        location: evt.location,
        vessel: evt.vessel,
        voyage: evt.voyage,
        timestamp: evt.timestamp || evt.time || new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('ShipsGo getShipmentEvents failed, using shipment fallback:', err);
      const shipment = await this.getShipment(tracking_id);
      return shipment.events || [];
    }
  }

  async getShipmentRoute(tracking_id: string): Promise<UnifiedShipment['route']> {
    if (!this.apiKey || tracking_id.startsWith('sim-')) {
      return this.simulateShipment(tracking_id, tracking_id).route;
    }
    try {
      const res = await this.client.get(`/v2/ocean/shipments/${tracking_id}/geojson`);
      return res.data?.route || res.data?.features || res.data;
    } catch (err) {
      console.warn('ShipsGo getShipmentRoute failed, using shipment fallback:', err);
      const shipment = await this.getShipment(tracking_id);
      return shipment.route;
    }
  }

  private normalize(payload: any, tracking_id: string): UnifiedShipment {
    const lastEvent = payload?.events?.[payload.events.length - 1];
    const location = payload?.location || lastEvent?.location_coordinates;
    return {
      tracking_id,
      status: payload?.status || lastEvent?.status || 'Unknown',
      eta: payload?.eta || payload?.estimated_arrival,
      location: location
        ? {lat: location.lat || location.latitude, lng: location.lng || location.longitude, name: location.name || location.port}
        : undefined,
      events: (payload?.events || []).map((evt: any) => ({
        event_type: evt.event_type || evt.status || evt.type || 'EVENT',
        description: evt.description || evt.status || evt.type,
        location: evt.location || evt.port,
        vessel: evt.vessel || payload?.vessel?.name,
        voyage: evt.voyage || payload?.vessel?.voyage,
        timestamp: evt.timestamp || evt.time || new Date().toISOString(),
      })),
      vessel: payload?.vessel,
      route: payload?.route,
      vessel_position: payload?.vessel_position || (location
        ? {lat: location.lat || location.latitude, lng: location.lng || location.longitude, timestamp: new Date().toISOString()}
        : undefined),
    };
  }
}
