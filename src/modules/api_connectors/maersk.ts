import { BaseCarrierConnector } from './base_connector.ts';

export class MaerskConnector extends BaseCarrierConnector {
  constructor(apiKey: string) {
    // Updated to a more likely correct endpoint
    super(apiKey, 'https://api.maersk.com/track/v1');
  }

  async authenticate(): Promise<void> {
    // Maersk uses X-API-Key header
    if (this.apiKey) {
      this.client.defaults.headers.common['X-API-Key'] = this.apiKey;
    }
    return Promise.resolve();
  }

  async trackContainer(containerNumber: string): Promise<any> {
    await this.authenticate();

    if (!this.apiKey) {
      return { ...this.simulateTracking(containerNumber, 'CONTAINER'), simulated: true };
    }

    try {
      // Updated endpoint to match likely API structure
      const response = await this.makeRequest(`/shipments?carrierBookingReference=${containerNumber}`);
      return this.transformTrackingResponse(response, containerNumber, 'CONTAINER');
    } catch (error: any) {
      // Suppress verbose error logging for expected failures in dev environment
      if (error.message.includes('404')) {
        console.warn(`Maersk Shipment Not Found for ${containerNumber}, falling back to simulation.`);
      } else if (error.message.includes('DNS Lookup Failed') || error.message.includes('Network error')) {
        console.warn(`Maersk Network Error (likely offline/blocked) for ${containerNumber}, falling back to simulation.`);
      } else if (error.message.includes('Authentication failed')) {
        // Silently fall back to simulation for invalid keys
      } else {
        console.warn(`Maersk API request failed for container ${containerNumber}: ${error.message}, falling back to simulation.`);
      }
      return { ...this.simulateTracking(containerNumber, 'CONTAINER'), simulated: true };
    }
  }

  async trackBL(blNumber: string): Promise<any> {
    await this.authenticate();

    if (!this.apiKey) {
      return { ...this.simulateTracking(blNumber, 'BL'), simulated: true };
    }

    try {
      const response = await this.makeRequest(`/shipments/${blNumber}`);
      return this.transformTrackingResponse(response, blNumber, 'BL');
    } catch (error) {
      console.warn(`Maersk API request failed for BL ${blNumber}, falling back to simulation.`);
      return { ...this.simulateTracking(blNumber, 'BL'), simulated: true };
    }
  }

  async getSchedule(vesselName: string, voyage: string): Promise<any> {
    await this.authenticate();

    if (!this.apiKey) {
      return this.simulateSchedule(vesselName, voyage);
    }

    try {
      const response = await this.makeRequest(`/schedules/vessels/${vesselName}`, 'GET', null, {
        params: { voyage }
      });
      return response;
    } catch (error) {
      return this.simulateSchedule(vesselName, voyage);
    }
  }

  // Backward compatibility alias
  async trackShipment(containerId: string): Promise<any> {
    return this.trackContainer(containerId);
  }

  private transformTrackingResponse(data: any, id: string, type: string): any {
    // Transform Maersk specific response to our standard format
    // Hypothetical mapping based on common API structures
    const lastEvent = data.events ? data.events[data.events.length - 1] : {};
    
    return {
      id: id,
      type: type,
      carrier: 'Maersk',
      status: lastEvent.status || 'Unknown',
      location: {
        lat: lastEvent.latitude || 0,
        lng: lastEvent.longitude || 0
      },
      current_port: lastEvent.locationName || '',
      timestamp: lastEvent.eventTimestamp || new Date().toISOString(),
      eta: data.estimatedArrival || '',
      events: data.events || [], // Include milestones as events
      simulated: false
    };
  }

  private simulateSchedule(vesselName: string, voyage: string): any {
    return {
      vessel: vesselName,
      voyage: voyage,
      stops: [
        { port: 'Shanghai', eta: '2023-10-01' },
        { port: 'Rotterdam', eta: '2023-10-20' }
      ],
      simulated: true
    };
  }
}
