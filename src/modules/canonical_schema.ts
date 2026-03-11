export type DomainEntity =
  | 'Shipment'
  | 'Carrier'
  | 'Route'
  | 'Container'
  | 'Event'
  | 'Vessel'
  | 'RouteGeometry'
  | 'Metadata';

export type TransformType = 'string' | 'number' | 'date' | 'geojson' | 'array' | 'boolean';

export interface CanonicalField {
  id: string; // stable identifier (usually same as name)
  name: string; // snake_case canonical name
  domain: DomainEntity;
  data_type: TransformType | 'object';
  description?: string;
  is_array?: boolean;
}

// Canonical master data model fields
export const CANONICAL_FIELDS: CanonicalField[] = [
  // Shipment
  { id: 'shipment_id', name: 'shipment_id', domain: 'Shipment', data_type: 'string', description: 'Provider shipment identifier' },
  { id: 'booking_number', name: 'booking_number', domain: 'Shipment', data_type: 'string' },
  { id: 'container_count', name: 'container_count', domain: 'Shipment', data_type: 'number' },
  { id: 'shipment_status', name: 'shipment_status', domain: 'Shipment', data_type: 'string' },
  { id: 'shipment_message', name: 'shipment_message', domain: 'Shipment', data_type: 'string' },
  { id: 'created_at', name: 'created_at', domain: 'Shipment', data_type: 'date' },
  { id: 'updated_at', name: 'updated_at', domain: 'Shipment', data_type: 'date' },
  { id: 'checked_at', name: 'checked_at', domain: 'Shipment', data_type: 'date' },
  { id: 'provider', name: 'provider', domain: 'Shipment', data_type: 'string' },
  { id: 'endpoint', name: 'endpoint', domain: 'Shipment', data_type: 'string' },

  // Carrier
  { id: 'carrier_code', name: 'carrier_code', domain: 'Carrier', data_type: 'string' },
  { id: 'carrier_name', name: 'carrier_name', domain: 'Carrier', data_type: 'string' },

  // Route
  { id: 'origin_port_name', name: 'origin_port_name', domain: 'Route', data_type: 'string' },
  { id: 'origin_port_code', name: 'origin_port_code', domain: 'Route', data_type: 'string' },
  { id: 'origin_country_code', name: 'origin_country_code', domain: 'Route', data_type: 'string' },
  { id: 'origin_country_name', name: 'origin_country_name', domain: 'Route', data_type: 'string' },
  { id: 'origin_timezone', name: 'origin_timezone', domain: 'Route', data_type: 'string' },
  { id: 'departure_time', name: 'departure_time', domain: 'Route', data_type: 'date' },
  { id: 'departure_time_initial', name: 'departure_time_initial', domain: 'Route', data_type: 'date' },
  { id: 'destination_port_name', name: 'destination_port_name', domain: 'Route', data_type: 'string' },
  { id: 'destination_port_code', name: 'destination_port_code', domain: 'Route', data_type: 'string' },
  { id: 'destination_country_code', name: 'destination_country_code', domain: 'Route', data_type: 'string' },
  { id: 'destination_country_name', name: 'destination_country_name', domain: 'Route', data_type: 'string' },
  { id: 'destination_timezone', name: 'destination_timezone', domain: 'Route', data_type: 'string' },
  { id: 'eta', name: 'eta', domain: 'Route', data_type: 'date' },
  { id: 'eta_initial', name: 'eta_initial', domain: 'Route', data_type: 'date' },
  { id: 'transshipment_count', name: 'transshipment_count', domain: 'Route', data_type: 'number' },
  { id: 'transit_time_days', name: 'transit_time_days', domain: 'Route', data_type: 'number' },
  { id: 'transit_progress_percent', name: 'transit_progress_percent', domain: 'Route', data_type: 'number' },
  { id: 'co2_emission', name: 'co2_emission', domain: 'Route', data_type: 'number' },

  // Container
  { id: 'container_number', name: 'container_number', domain: 'Container', data_type: 'string' },
  { id: 'container_status', name: 'container_status', domain: 'Container', data_type: 'string' },
  { id: 'container_size', name: 'container_size', domain: 'Container', data_type: 'string' },
  { id: 'container_type', name: 'container_type', domain: 'Container', data_type: 'string' },

  // Event
  { id: 'event_type', name: 'event_type', domain: 'Event', data_type: 'string' },
  { id: 'event_status', name: 'event_status', domain: 'Event', data_type: 'string' },
  { id: 'event_timestamp', name: 'event_timestamp', domain: 'Event', data_type: 'date' },
  { id: 'event_location_name', name: 'event_location_name', domain: 'Event', data_type: 'string' },
  { id: 'event_location_code', name: 'event_location_code', domain: 'Event', data_type: 'string' },
  { id: 'event_country_code', name: 'event_country_code', domain: 'Event', data_type: 'string' },
  { id: 'event_country_name', name: 'event_country_name', domain: 'Event', data_type: 'string' },
  { id: 'event_timezone', name: 'event_timezone', domain: 'Event', data_type: 'string' },

  // Vessel
  { id: 'vessel_name', name: 'vessel_name', domain: 'Vessel', data_type: 'string' },
  { id: 'vessel_imo', name: 'vessel_imo', domain: 'Vessel', data_type: 'string' },
  { id: 'voyage_number', name: 'voyage_number', domain: 'Vessel', data_type: 'string' },

  // Route Geometry
  { id: 'route_geometry_type', name: 'route_geometry_type', domain: 'RouteGeometry', data_type: 'string' },
  { id: 'route_coordinates', name: 'route_coordinates', domain: 'RouteGeometry', data_type: 'geojson', is_array: true },
  { id: 'current_position_index', name: 'current_position_index', domain: 'RouteGeometry', data_type: 'number' },
  { id: 'current_coordinates', name: 'current_coordinates', domain: 'RouteGeometry', data_type: 'geojson' },

  // Metadata
  { id: 'map_token', name: 'map_token', domain: 'Metadata', data_type: 'string' },
  { id: 'shipment_followers', name: 'shipment_followers', domain: 'Metadata', data_type: 'array', is_array: true },
  { id: 'shipment_tags', name: 'shipment_tags', domain: 'Metadata', data_type: 'array', is_array: true },
  { id: 'created_by_name', name: 'created_by_name', domain: 'Metadata', data_type: 'string' },
  { id: 'created_by_email', name: 'created_by_email', domain: 'Metadata', data_type: 'string' },
];

export function ensureUniqueFieldName(existing: CanonicalField[], name: string, domain: DomainEntity) {
  const lower = name.toLowerCase();
  if (!existing.some((f) => f.name.toLowerCase() === lower)) return name;
  const suffixed = `${name}_${domain.toLowerCase()}`;
  if (!existing.some((f) => f.name.toLowerCase() === suffixed.toLowerCase())) return suffixed;
  let counter = 2;
  let candidate = `${name}_${counter}`;
  while (existing.some((f) => f.name.toLowerCase() === candidate.toLowerCase())) {
    counter += 1;
    candidate = `${name}_${counter}`;
  }
  return candidate;
}
