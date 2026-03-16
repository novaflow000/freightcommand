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

  private static PORTS: Record<string, [number, number]> = {
    'Casablanca': [33.57, -7.59], 'Tanger Med': [35.88, -5.5], 'Jorf Lasfar': [33.12, -8.62], 'Mohammedia': [33.68, -7.38],
    'New York': [40.71, -74.01], 'Rotterdam': [51.92, 4.48], 'Shanghai': [31.23, 121.47], 'Antwerp': [51.22, 4.40],
    'Dubai': [25.2, 55.27], 'Savannah': [32.08, -81.09], 'Santos': [-23.95, -46.33], 'Los Angeles': [34.05, -118.24],
    'Singapore': [1.35, 103.82], 'Houston': [29.76, -95.37], 'Barcelona': [41.39, 2.17], 'Hamburg': [53.55, 9.99],
  };
  /** Vessel positions: OPEN OCEAN ONLY (100+ nm from coast). [lat, lng]. */
  private static OCEAN_POSITIONS: Array<{ origin: string; dest: string; atSea: [number, number] }> = [
    { origin: 'Casablanca', dest: 'New York', atSea: [36.8, -48.2] },
    { origin: 'Tanger Med', dest: 'Rotterdam', atSea: [41.0, -12.0] },
    { origin: 'Casablanca', dest: 'Shanghai', atSea: [22.0, 65.5] },
    { origin: 'Jorf Lasfar', dest: 'Antwerp', atSea: [38.0, -6.0] },
    { origin: 'Mohammedia', dest: 'Dubai', atSea: [24.5, 38.0] },
    { origin: 'Tanger Med', dest: 'Savannah', atSea: [32.5, -42.0] },
    { origin: 'Casablanca', dest: 'Santos', atSea: [8.0, -28.0] },
    { origin: 'Jorf Lasfar', dest: 'Los Angeles', atSea: [28.5, -55.0] },
    { origin: 'Casablanca', dest: 'Singapore', atSea: [18.5, 55.0] },
    { origin: 'Tanger Med', dest: 'Houston', atSea: [32.0, -55.0] },
    { origin: 'Mohammedia', dest: 'Antwerp', atSea: [43.0, -15.0] },
    { origin: 'Jorf Lasfar', dest: 'Dubai', atSea: [26.0, 50.0] },
  ];

  protected simulateShipment(tracking_id: string, container_number: string, booking_number?: string): UnifiedShipment {
    const seed = (tracking_id || container_number || 'x').split('').reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
    const idx = seed % BaseTrackingProvider.OCEAN_POSITIONS.length;
    const r = BaseTrackingProvider.OCEAN_POSITIONS[idx];
    const atSea = r.atSea;
    const originPt = BaseTrackingProvider.PORTS[r.origin] || [33.57, -7.59];
    const destPt = BaseTrackingProvider.PORTS[r.dest] || [40.71, -74.01];
    const routeCoords: Array<[number, number]> = [originPt, atSea, destPt];
    const now = Date.now();
    const statuses = ['In Transit', 'In Transit', 'Delayed', 'Delivered', 'Pending'];
    const status = statuses[seed % statuses.length];
    return {
      tracking_id,
      status,
      simulated: true,
      eta: new Date(now + 1000 * 60 * 60 * 24 * (8 + (seed % 10))).toISOString(),
      location: { lat: atSea[0], lng: atSea[1], name: 'At Sea' },
      events: [
        { event_type: 'LOAD', description: 'Container Loaded', location: r.origin, timestamp: new Date(now - 1000 * 60 * 60 * 48).toISOString() },
        { event_type: 'DEPARTURE', description: 'Vessel Departed', location: r.origin, timestamp: new Date(now - 1000 * 60 * 60 * 36).toISOString() },
      ],
      vessel: { name: 'Simulated Vessel', voyage: `SIM${seed % 1000}` },
      route: {
        origin_port: r.origin,
        destination_port: r.dest,
        route_geometry: routeCoords,
      },
      vessel_position: { lat: atSea[0], lng: atSea[1], timestamp: new Date().toISOString() },
    };
  }
}
