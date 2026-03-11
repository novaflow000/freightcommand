import { BaseCarrierConnector } from './base_connector.ts';

export class CmaCgmConnector extends BaseCarrierConnector {
  constructor(apiKey: string) {
    // Updated to a more likely correct endpoint (though still might fail without real credentials)
    super(apiKey, 'https://apis.cma-cgm.net/v1');
  }

  async authenticate(): Promise<void> {
    // CMA CGM uses Bearer Token in Authorization header
    if (this.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return Promise.resolve();
  }

  async trackContainer(containerNumber: string): Promise<any> {
    await this.authenticate();

    if (!this.apiKey) {
      return { ...this.simulateTracking(containerNumber, 'CONTAINER'), simulated: true };
    }

    try {
      const response = await this.makeRequest(`/tracking/containers/${containerNumber}`);
      return this.transformTrackingResponse(response, containerNumber, 'CONTAINER');
    } catch (error: any) {
      // Suppress verbose error logging for expected failures in dev environment
      if (error.message.includes('429')) {
        console.warn(`CMA CGM Rate Limit Exceeded for container ${containerNumber}, falling back to simulation.`);
      } else if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Authentication failed')) {
        // Silently fall back to simulation for invalid keys
      } else if (error.message.includes('DNS Lookup Failed') || error.message.includes('Network error')) {
        console.warn(`CMA CGM Network Error (likely offline/blocked) for container ${containerNumber}, falling back to simulation.`);
      } else {
        console.warn(`CMA CGM API request failed for container ${containerNumber}: ${error.message}, falling back to simulation.`);
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
      const response = await this.makeRequest(`/tracking/bl/${blNumber}`);
      return this.transformTrackingResponse(response, blNumber, 'BL');
    } catch (error: any) {
      if (error.message.includes('429')) {
        console.warn(`CMA CGM Rate Limit Exceeded for BL ${blNumber}, falling back to simulation.`);
      } else if (error.message.includes('401')) {
        console.warn(`CMA CGM Authentication Failed (Expired Token) for BL ${blNumber}, falling back to simulation.`);
      } else {
        console.warn(`CMA CGM API request failed for BL ${blNumber}: ${error.message}, falling back to simulation.`);
      }
      return { ...this.simulateTracking(blNumber, 'BL'), simulated: true };
    }
  }

  async getSchedule(vesselName: string, voyage: string): Promise<any> {
    await this.authenticate();

    if (!this.apiKey) {
      return this.simulateSchedule(vesselName, voyage);
    }

    try {
      // Assuming endpoint structure similar to others or generic
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
    // Transform CMA CGM specific response to our standard format
    // Hypothetical mapping based on common API structures
    const lastEvent = data.events ? data.events[data.events.length - 1] : {};
    
    return {
      id: id,
      type: type,
      carrier: 'CMA CGM',
      status: lastEvent.status || 'Unknown',
      location: {
        lat: lastEvent.latitude || 0,
        lng: lastEvent.longitude || 0
      },
      current_port: lastEvent.locationName || '',
      timestamp: lastEvent.eventTimestamp || new Date().toISOString(),
      eta: data.estimatedArrival || '',
      events: data.events || [],
      simulated: false
    };
  }

  private simulateSchedule(vesselName: string, voyage: string): any {
    return {
      vessel: vesselName,
      voyage: voyage,
      stops: [
        { port: 'Singapore', eta: '2023-11-10' },
        { port: 'Los Angeles', eta: '2023-12-01' }
      ],
      simulated: true
    };
  }
}
