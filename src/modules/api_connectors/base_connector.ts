import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import crypto from 'crypto';

export abstract class BaseCarrierConnector {
  protected apiKey: string;
  protected apiSecret: string;
  protected baseUrl: string;
  protected client: AxiosInstance;

  constructor(apiKey: string, baseUrl: string, apiSecret: string = '') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.apiSecret = apiSecret;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10s timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error)
    );
  }

  // Abstract methods to be implemented by child classes
  abstract authenticate(): Promise<void>;
  abstract trackContainer(containerNumber: string): Promise<any>;
  abstract trackBL(blNumber: string): Promise<any>;
  abstract getSchedule(vesselName: string, voyage: string): Promise<any>;

  // Utility method for HTTP requests
  protected async makeRequest(endpoint: string, method: 'GET' | 'POST' | 'PUT' = 'GET', data?: any, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.client.request({
        url: endpoint,
        method,
        data,
        ...config,
      });
      return response.data;
    } catch (error) {
      // Error is already handled by interceptor, but we can re-throw or add context here
      throw error;
    }
  }

  // Utility for HMAC signature generation
  protected generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  // Error handling
  private handleError(error: AxiosError): Promise<never> {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const status = error.response.status;
      if (status === 401 || status === 403) {
        throw new Error('Authentication failed. Please check your API key.');
      } else if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`API Error: ${error.message}`);
      }
    } else if (error.request) {
      // The request was made but no response was received
      // Check for specific network errors like ENOTFOUND
      if (error.message.includes('ENOTFOUND')) {
         throw new Error(`DNS Lookup Failed: ${error.message}`);
      }
      throw new Error('Network error. Please check your connection.');
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Request error: ${error.message}`);
    }
  }

  // Simulation method for development
  protected simulateTracking(id: string, type: 'CONTAINER' | 'BL'): any {
    const locations = [
      { lat: 40.7128, lng: -74.0060, name: 'New York' },
      { lat: 51.9225, lng: 4.47917, name: 'Rotterdam' },
      { lat: 31.2304, lng: 121.4737, name: 'Shanghai' },
      { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
      { lat: 25.2048, lng: 55.2708, name: 'Dubai' },
    ];
    
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    const statuses = ['In Transit', 'Arrived', 'Customs Hold', 'Discharged'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      id: id,
      type: type,
      carrier: this.constructor.name.replace('Connector', ''),
      status: randomStatus,
      location: { lat: randomLocation.lat, lng: randomLocation.lng },
      current_port: randomLocation.name,
      timestamp: new Date().toISOString(),
      events: [
        { 
          status: 'Departed', 
          location: 'Origin Port', 
          time: new Date(Date.now() - 86400000 * 5).toISOString() 
        },
        { 
          status: randomStatus, 
          location: randomLocation.name, 
          time: new Date().toISOString() 
        }
      ]
    };
  }
}
