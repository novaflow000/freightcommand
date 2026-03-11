import {BaseTrackingProvider, UnifiedShipment} from './base_provider.ts';

export class SeaRatesProvider extends BaseTrackingProvider {
  constructor(apiKey: string) {
    super('SeaRates', apiKey, 'https://api.searates.com');
  }

  async createTracking(container_number: string, booking_number?: string, carrier?: string): Promise<string> {
    if (!this.apiKey) return `sim-${container_number}`;
    try {
      const res = await this.client.post('/tracking/ocean', {
        container_number,
        bl_number: booking_number,
        carrier,
      });
      return res.data?.id || res.data?.tracking_id || `sim-${container_number}`;
    } catch (err) {
      console.warn('SeaRates createTracking failed, using simulation:', err);
      return `sim-${container_number}`;
    }
  }

  async getShipment(tracking_id: string): Promise<UnifiedShipment> {
    if (!this.apiKey || tracking_id.startsWith('sim-')) {
      return this.simulateShipment(tracking_id, tracking_id.replace('sim-',''));
    }
    try {
      const res = await this.client.get(`/tracking/ocean/${tracking_id}`);
      const data = res.data;
      const lastEvent = data?.events?.[data.events.length - 1];
      return {
        tracking_id,
        status: data?.status || lastEvent?.status || 'Unknown',
        eta: data?.eta,
        location: data?.last_position
          ? {lat: data.last_position.lat, lng: data.last_position.lng, name: data.last_position.port}
          : undefined,
        events: (data?.events || []).map((evt: any) => ({
          event_type: evt.event_type || evt.status,
          description: evt.description || evt.status,
          location: evt.location || evt.port,
          vessel: evt.vessel,
          voyage: evt.voyage,
          timestamp: evt.timestamp || evt.time,
        })),
        vessel: data?.vessel,
        route: data?.route,
        vessel_position: data?.last_position
          ? {lat: data.last_position.lat, lng: data.last_position.lng, timestamp: data.last_position.timestamp || new Date().toISOString()}
          : undefined,
      };
    } catch (err) {
      console.warn('SeaRates getShipment failed, using simulation:', err);
      return this.simulateShipment(tracking_id, tracking_id);
    }
  }
}
