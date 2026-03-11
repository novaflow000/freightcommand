import { BaseCarrierConnector } from './base_connector.ts';
import axios from 'axios';

export class HapagLloydConnector extends BaseCarrierConnector {
  private accessToken: string = '';
  private tokenExpiry: number = 0;

  constructor(clientId: string, clientSecret: string) {
    // Hapag-Lloyd API URL
    super(clientId, 'https://api.hapag-lloyd.com/v1', clientSecret);
  }

  async authenticate(): Promise<void> {
    if (!this.apiKey || !this.apiSecret) {
      console.warn('Hapag-Lloyd credentials missing, skipping authentication.');
      return;
    }

    // Check if token is still valid (with 5 min buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 300000) {
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.apiKey);
      params.append('client_secret', this.apiSecret);

      // Using a separate axios call for auth to avoid circular dependency or interceptor issues
      const response = await axios.post('https://api.hapag-lloyd.com/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      // Set expiry based on expires_in (seconds)
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      // Update client headers
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
    } catch (error) {
      console.error('Hapag-Lloyd Authentication Failed:', error);
      // We don't throw here to allow fallback to simulation
    }
  }

  async trackContainer(containerNumber: string): Promise<any> {
    await this.authenticate();

    if (!this.accessToken) {
      return { ...this.simulateTracking(containerNumber, 'CONTAINER'), simulated: true };
    }

    try {
      const response = await this.makeRequest(`/tracking/containers/${containerNumber}`);
      return this.transformTrackingResponse(response, containerNumber, 'CONTAINER');
    } catch (error) {
      console.warn(`Hapag-Lloyd API request failed for container ${containerNumber}, falling back to simulation.`);
      return { ...this.simulateTracking(containerNumber, 'CONTAINER'), simulated: true };
    }
  }

  async trackBL(blNumber: string): Promise<any> {
    await this.authenticate();

    if (!this.accessToken) {
      return { ...this.simulateTracking(blNumber, 'BL'), simulated: true };
    }

    try {
      const response = await this.makeRequest(`/tracking/bl/${blNumber}`);
      return this.transformTrackingResponse(response, blNumber, 'BL');
    } catch (error) {
       console.warn(`Hapag-Lloyd API request failed for BL ${blNumber}, falling back to simulation.`);
      return { ...this.simulateTracking(blNumber, 'BL'), simulated: true };
    }
  }

  async getSchedule(vesselName: string, voyage: string): Promise<any> {
    await this.authenticate();

    if (!this.accessToken) {
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
    // Transform Hapag-Lloyd specific response to our standard format
    // This is a hypothetical mapping based on common API structures
    const lastEvent = data.events ? data.events[data.events.length - 1] : {};
    
    return {
      id: id,
      type: type,
      carrier: 'Hapag-Lloyd',
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
        { port: 'Hamburg', eta: '2023-11-01' },
        { port: 'New York', eta: '2023-11-15' }
      ],
      simulated: true
    };
  }
}
