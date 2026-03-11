import { describe, it, expect } from 'vitest';
import { DataMappingEngine } from '../src/modules/provider_executor.ts';

describe('DataMappingEngine', () => {
  it('applies nested and array mappings from admin configuration', () => {
    const stubRegistry: any = {
      reloadFromDatabase: () => {},
      listMappings: () => ([
        {
          provider_id: 'prov1',
          endpoint_id: 'ep1',
          external_field: 'shipment.route.port_of_loading.location.name',
          internal_field: 'origin_port_name',
          domain_entity: 'Route',
          transformation: 'string',
          is_array: false,
        },
        {
          provider_id: 'prov1',
          endpoint_id: 'ep1',
          external_field: 'shipment.containers[].movements[].event_type',
          internal_field: 'event_type',
          domain_entity: 'Event',
          transformation: 'string',
          is_array: false,
        },
        {
          provider_id: 'prov1',
          endpoint_id: 'ep1',
          external_field: 'geojson.features[].geometry.coordinates[]',
          internal_field: 'route_coordinates',
          domain_entity: 'RouteGeometry',
          transformation: 'array',
          is_array: true,
        },
      ]),
      listEndpoints: () => [],
    };

    const engine = new DataMappingEngine(stubRegistry as any);
    const payload = {
      shipment: {
        route: { port_of_loading: { location: { name: 'Hamburg' } } },
        containers: [
          { movements: [{ event_type: 'LOAD', location: { code: 'DEHAM' }, event_time: '2026-03-01T00:00:00Z' }] },
        ],
      },
      geojson: {
        features: [
          { geometry: { coordinates: [[10, 20], [30, 40]] }, properties: { vessel: { name: 'Evergreen' } } },
        ],
      },
    };

    const canonical = engine.normalizeProviderResponse('prov1', payload, 'get_route');

    expect(canonical.route?.origin_port_name).toBe('Hamburg');
    expect(canonical.containers[0].events?.length).toBe(1);
    expect(canonical.containers[0].events?.[0].event_type).toBe('LOAD');
    expect(Array.isArray((canonical.route_geometry as any).route_coordinates)).toBe(true);
  });
});
