import { Filters } from '../context/FiltersContext';

export interface CanonicalShipment {
  id: string;
  bl_number?: string;
  shipment: any;
  carrier?: any;
  route?: any;
  containers?: any[];
  events?: any[];
  vessels?: any[];
  route_geometry?: any;
  metadata?: any;
  client?: string;
}

const buildQuery = (filters: Filters) => {
  const params = new URLSearchParams();
  if (filters.carrier) params.append('carrier', filters.carrier);
  if (filters.origin) params.append('origin', filters.origin);
  if (filters.destination) params.append('destination', filters.destination);
  if (filters.status) params.append('status', filters.status);
  if (filters.container) params.append('container', filters.container);
  if (filters.booking) params.append('booking', filters.booking);
  return params.toString();
};

export async function fetchCanonicalShipments(filters: Filters = {}): Promise<CanonicalShipment[]> {
  const qs = buildQuery(filters);
  const res = await fetch(`/api/v1/canonical/shipments${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to load shipments');
  return res.json();
}

export async function fetchCanonicalAnalytics(): Promise<any> {
  const res = await fetch('/api/v1/canonical/analytics');
  if (!res.ok) throw new Error('Failed to load analytics');
  return res.json();
}

export async function fetchCanonicalAlerts(): Promise<any[]> {
  const res = await fetch('/api/v1/canonical/alerts');
  if (!res.ok) throw new Error('Failed to load alerts');
  return res.json();
}

export async function searchCanonical(q: string) {
  const res = await fetch(`/api/v1/canonical/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
