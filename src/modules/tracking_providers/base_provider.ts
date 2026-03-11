import axios, {AxiosInstance} from 'axios';

export interface UnifiedEvent {
  event_type: string;
  description: string;
  location?: string;
  vessel?: string;
  voyage?: string;
  timestamp: string;
}

export interface UnifiedShipment {
  tracking_id: string;
  status: string;
  eta?: string;
  location?: {lat: number; lng: number; name?: string};
  events: UnifiedEvent[];
  vessel?: {name?: string; imo?: string; voyage?: string};
  route?: {
    origin_port?: string;
    destination_port?: string;
    transshipment_port?: string;
    route_geometry?: Array<[number, number]>;
  };
  vessel_position?: {lat: number; lng: number; timestamp: string};
}

export interface TrackingProvider {
  name: string;
  createTracking(container_number: string, booking_number?: string, carrier?: string): Promise<string>;
  getShipment(tracking_id: string): Promise<UnifiedShipment>;
  getShipmentEvents?(tracking_id: string): Promise<UnifiedEvent[]>;
  getShipmentRoute?(tracking_id: string): Promise<UnifiedShipment['route']>;
}

export abstract class BaseTrackingProvider implements TrackingProvider {
  public name: string;
  protected apiKey: string;
  protected client: AxiosInstance;
  protected baseUrl: string;

  constructor(name: string, apiKey: string, baseUrl: string) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey ? `Bearer ${apiKey}` : undefined,
      },
    });
  }

  abstract createTracking(container_number: string, booking_number?: string, carrier?: string): Promise<string>;
  abstract getShipment(tracking_id: string): Promise<UnifiedShipment>;

  async getShipmentEvents(tracking_id: string): Promise<UnifiedEvent[]> {
    const {events} = await this.getShipment(tracking_id);
    return events || [];
  }

  async getShipmentRoute(tracking_id: string): Promise<UnifiedShipment['route']> {
    const {route} = await this.getShipment(tracking_id);
    return route;
  }

  protected simulateShipment(tracking_id: string, container_number: string, booking_number?: string): UnifiedShipment {
    const sampleRoute: Array<[number, number]> = [
      [33.5731, -7.5898],
      [36.1699, -86.7844],
      [40.7128, -74.0060],
    ];
    const now = Date.now();
    return {
      tracking_id,
      status: 'In Transit',
      eta: new Date(now + 1000 * 60 * 60 * 24 * 12).toISOString(),
      location: {lat: sampleRoute[1][0], lng: sampleRoute[1][1], name: 'Mid-Atlantic'},
      events: [
        {event_type: 'LOAD', description: 'Container Loaded', location: 'Casablanca', timestamp: new Date(now - 1000 * 60 * 60 * 48).toISOString()},
        {event_type: 'DEPARTURE', description: 'Vessel Departed', location: 'Casablanca', timestamp: new Date(now - 1000 * 60 * 60 * 36).toISOString()},
      ],
      vessel: {name: 'Simulated Vessel', voyage: 'SIM123'},
      route: {
        origin_port: 'Casablanca',
        destination_port: 'New York',
        route_geometry: sampleRoute,
      },
      vessel_position: {lat: sampleRoute[1][0], lng: sampleRoute[1][1], timestamp: new Date().toISOString()},
    };
  }
}
