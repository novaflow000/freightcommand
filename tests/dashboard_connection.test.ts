import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

vi.mock('axios', () => {
  const request = vi.fn();
  const create = vi.fn(() => ({ get: vi.fn(), post: vi.fn() }));
  return { default: { request, create }, request, create };
});

import axios from 'axios';
import { ProviderRegistry } from '../src/modules/provider_registry';
import { ProviderExecutor } from '../src/modules/provider_executor';
import { ProviderRouter } from '../src/modules/provider_router';
import { ShipmentDataManager } from '../src/modules/data_manager';
import { TrackingQueue } from '../src/modules/tracking_queue';
import { canonicalDataService } from '../src/modules/canonical_data_service';

describe('Dashboard ↔ Provider configuration integration', () => {
  const containerNumber = 'HLXU29384756';
  const carrier = 'HLC';
  const blNumber = 'SG-DIAG-BL-001';

  let tmpDir: string;
  let registry: ProviderRegistry;
  let executor: ProviderExecutor;
  let router: ProviderRouter;
  let dataManager: ShipmentDataManager;
  let queue: TrackingQueue;
  let requests: any[];

  const clearCanonical = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canonicalDataService as any).shipments = new Map();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requests = [];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-diag-'));

    registry = new ProviderRegistry(tmpDir);
    executor = new ProviderExecutor(registry);
    router = new ProviderRouter(registry, executor);
    dataManager = new ShipmentDataManager(path.join(tmpDir, 'shipments.csv'));

    // strip sample data to keep the test focused on the injected shipment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dataManager as any).shipments = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dataManager as any)._save_to_csv();

    queue = new TrackingQueue(registry, executor, router, dataManager);
    clearCanonical();

    const provider = registry.upsertProvider({
      name: 'ShipsGo',
      base_url: 'https://api.shipsgonet.com',
      auth_type: 'API_KEY',
      api_key: 'demo-token',
      is_active: true,
      supports_container_tracking: true,
      supports_bl_tracking: true,
    });

    registry.upsertCoverage({ provider_id: provider.id, carrier_code: carrier });
    registry.upsertCoverage({ provider_id: provider.id, carrier_code: 'CMDU' });

    registry.upsertEndpoint({
      provider_id: provider.id,
      endpoint_name: 'create_tracking',
      method: 'POST',
      path: '/v2/ocean/shipments',
      body_template: {
        container_number: '{{container_number}}',
        booking_number: '{{booking_number}}',
        carrier: '{{carrier}}',
      },
    });

    registry.upsertEndpoint({
      provider_id: provider.id,
      endpoint_name: 'get_shipment',
      method: 'GET',
      path: '/v2/ocean/shipments/{{shipment_id}}',
    });

    registry.upsertEndpoint({
      provider_id: provider.id,
      endpoint_name: 'get_route',
      method: 'GET',
      path: '/v2/ocean/shipments/{{shipment_id}}/geojson',
    });

    const map = (
      external_field: string,
      internal_field: string,
      domain_entity: any,
      transformation?: any,
    ) =>
      registry.upsertMapping({
        provider_id: provider.id,
        external_field,
        internal_field,
        domain_entity,
        transformation,
      });

    map('shipment.id', 'shipment_id', 'Shipment');
    map('shipment.status', 'shipment_status', 'Shipment');
    map('shipment.eta', 'eta', 'Route', 'date');
    map('shipment.container.number', 'container_number', 'Container');
    map('shipment.origin.port', 'origin_port_name', 'Route');
    map('shipment.destination.port', 'destination_port_name', 'Route');
    map('shipment.carrier.code', 'carrier_code', 'Carrier');
    map('shipment.carrier.name', 'carrier_name', 'Carrier');
    map('route.geometry.coordinates', 'route_coordinates', 'RouteGeometry', 'geojson');
    map('route.geometry.type', 'route_geometry_type', 'RouteGeometry');
    map('route.events[].timestamp', 'event_timestamp', 'Event', 'date');
    map('route.events[].location.name', 'event_location_name', 'Event');
    map('route.events[].status', 'event_status', 'Event');

    const axiosMock = (axios as any).request as ReturnType<typeof vi.fn>;
    axiosMock.mockImplementation(async (config: any) => {
      requests.push(config);

      if (config.method === 'POST' && String(config.url).includes('/v2/ocean/shipments')) {
        return { status: 201, data: { shipment_id: 'sg-demo-1' }, headers: {} };
      }

      if (String(config.url).endsWith('/geojson')) {
        return {
          status: 200,
          data: {
            shipment: {
              id: 'sg-demo-1',
              status: 'In Transit',
              container: { number: containerNumber },
              origin: { port: 'Casablanca' },
              destination: { port: 'New York' },
              eta: '2026-03-20T00:00:00Z',
              carrier: { code: carrier, name: 'Hapag-Lloyd' },
            },
            route: {
              geometry: { type: 'LineString', coordinates: [[33.57, -7.58], [40.71, -74.0]] },
              events: [
                { timestamp: '2026-03-01T10:00:00Z', location: { name: 'Casablanca' }, status: 'DEPARTED' },
                { timestamp: '2026-03-15T10:00:00Z', location: { name: 'New York' }, status: 'ARRIVAL' },
              ],
            },
          },
          headers: {},
        };
      }

      if (config.method === 'GET' && String(config.url).includes('/v2/ocean/shipments/')) {
        return {
          status: 200,
          data: {
            shipment: {
              id: 'sg-demo-1',
              status: 'In Transit',
              container: { number: containerNumber },
              origin: { port: 'Casablanca' },
              destination: { port: 'New York' },
              eta: '2026-03-20T00:00:00Z',
              carrier: { code: carrier, name: 'Hapag-Lloyd' },
            },
          },
          headers: {},
        };
      }

      throw new Error(`Unexpected axios request to ${config.url}`);
    });
  });

  afterEach(() => {
    clearCanonical();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('pipes injected shipments through configured provider endpoints into the dashboard', async () => {
    const diagLog: string[] = [];

    const provider = registry.listProviders().find((p) => p.name === 'ShipsGo');
    expect(provider?.is_active).toBe(true);
    const endpoints = registry.listEndpoints(provider?.id);
    expect(endpoints.map((e) => e.endpoint_name)).toEqual(
      expect.arrayContaining(['create_tracking', 'get_shipment', 'get_route']),
    );
    expect(registry.listProviders().length).toBe(1);
    expect(registry.listCoverage().length).toBeGreaterThanOrEqual(1);
    diagLog.push('API configuration loaded');

    const injected = dataManager.upsert_shipment({
      bl_number: blNumber,
      container_number: containerNumber,
      carrier,
      origin: 'Casablanca',
      destination: 'New York',
      client: 'Diagnostics',
      cargo_type: 'General',
      cargo_weight: '10000',
      cargo_value: '50000',
      customer_ref: 'REF-DIAG',
      incoterm: 'FOB',
      special_instructions: '',
      status: 'tracking_requested',
    } as any);

    diagLog.push('Shipment injected');

    const ranked = router.selectProvider({
      container_number: containerNumber,
      bl_number: blNumber,
      carrier,
    });
    expect(ranked.length).toBeGreaterThan(0);

    const execSpy = vi.spyOn(executor, 'executeProviderRequest');

    // @ts-ignore access private for deterministic processing
    await queue.processJob({
      bl_number: injected.bl_number,
      container_number: injected.container_number,
      carrier: injected.carrier,
    });

    diagLog.push('Tracking request sent');

    expect(execSpy).toHaveBeenCalledTimes(3);

    expect(requests).toHaveLength(3);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toContain('/v2/ocean/shipments');
    expect(requests[0].headers['x-api-key']).toBe('demo-token');
    expect(requests[1].url).toContain('/v2/ocean/shipments/sg-demo-1');
    expect(String(requests[2].url)).toContain('/geojson');

    diagLog.push('Shipment data received');

    const canonical = canonicalDataService.listCanonical();
    expect(canonical).toHaveLength(1);
    const record = canonical[0];

    expect(record.shipment.shipment_id).toBe('sg-demo-1');
    expect(record.shipment.shipment_status).toBe('In Transit');
    expect(record.containers[0].container_number).toBe(containerNumber);
    expect(record.route.destination_port_name).toBe('New York');
    expect(record.route_geometry?.route_coordinates?.length).toBeGreaterThanOrEqual(2);

    diagLog.push('Canonical model updated');

    const analytics = canonicalDataService.getAnalytics();
    expect(analytics.total).toBe(1);
    expect(analytics.active).toBe(1);
    expect(analytics.delayed).toBe(0);

    const updatedShipment = dataManager.get_shipment_by_bl(blNumber);
    expect(updatedShipment?.status).toBe('In Transit');

    const legacy = canonicalDataService.getLegacyShipments();
    expect(legacy[0].route.length).toBeGreaterThan(0);
    expect(legacy[0].bl_number).toBe(blNumber);

    diagLog.push('Dashboard refreshed');
    console.info('[dashboard-diag]', diagLog.join(' -> '));

    expect(diagLog).toEqual(
      expect.arrayContaining([
        'API configuration loaded',
        'Shipment injected',
        'Tracking request sent',
        'Shipment data received',
        'Canonical model updated',
        'Dashboard refreshed',
      ]),
    );
  });

  it('sends booking_number (not container_number) when CSA0418719 is used as booking ref', async () => {
    clearCanonical();
    const bookingRef = 'CSA0418719';
    const injected = dataManager.upsert_shipment({
      bl_number: bookingRef,
      booking_number: bookingRef,
      container_number: '',
      carrier: 'CMA CGM',
      origin: '',
      destination: '',
      client: 'Test',
      cargo_type: '',
      cargo_weight: '',
      cargo_value: '',
      customer_ref: '',
      incoterm: '',
      special_instructions: '',
      status: 'Tracking Requested',
    } as any);

    await queue.processJob({
      bl_number: injected.bl_number,
      booking_number: injected.booking_number,
      container_number: injected.container_number,
      carrier: 'CMA CGM',
    });

    expect(requests).toHaveLength(3);
    const createBody = requests[0].data;
    expect(createBody.booking_number).toBe(bookingRef);
    expect(createBody.container_number).toBeUndefined();
    expect(createBody.carrier).toBe('CMDU');
  });
});
