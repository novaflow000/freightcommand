import { ProviderExecutor, normalizeProviderResponse } from './provider_executor.ts';
import { ProviderRegistry } from './provider_registry.ts';
import { ProviderRouter } from './provider_router.ts';
import { ShipmentDataManager } from './data_manager.ts';
import { canonicalDataService } from './canonical_data_service.ts';
import { normalizeCarrier, buildShipsGoCreatePayload } from './carriers/carrier_mapping.ts';

interface Job {
  bl_number?: string;
  container_number?: string;
  booking_number?: string;
  carrier?: string;
  carrier_name?: string;
  provider_tracking_id?: string;
}

export class TrackingQueue {
  private queue: Job[] = [];
  private processing = false;
  private registry: ProviderRegistry;
  private executor: ProviderExecutor;
  private router: ProviderRouter;
  private dataManager: ShipmentDataManager;

  constructor(registry: ProviderRegistry, executor: ProviderExecutor, router: ProviderRouter, dataManager: ShipmentDataManager) {
    this.registry = registry;
    this.executor = executor;
    this.router = router;
    this.dataManager = dataManager;
  }

  public enqueue(job: Job) {
    this.queue.push(job);
    this.run();
  }

  private async run() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;
      try {
        await this.processJob(job);
      } catch (err) {
        console.warn('Tracking job failed', err);
      }
    }
    this.processing = false;
  }

  private async processJob(job: Job) {
    // pick provider via router
    const carrierCode = normalizeCarrier(job.carrier || job.carrier_name || '');
    const providerOrder = this.router.selectProvider({ container_number: job.container_number, bl_number: job.bl_number, carrier: carrierCode });
    if (!providerOrder.length) return;
    const provider = providerOrder[0];
    // Step 1: create_tracking first to get shipment id – ShipsGo needs numeric id for get_shipment/get_route
    const looksLikeShipsGoId = (id: string) => id && /^\d+$/.test(String(id));
    let trackingId = job.provider_tracking_id && (provider.name !== 'ShipsGo' || looksLikeShipsGoId(job.provider_tracking_id))
      ? job.provider_tracking_id
      : undefined;

    // 1) POST create_tracking → get shipment id (required before get_shipment/get_route)
    try {
      const payload = buildShipsGoCreatePayload({
        bl_number: job.bl_number,
        container_number: job.container_number,
        booking_number: job.booking_number,
        carrier: job.carrier || job.carrier_name,
      });
      const created = await this.executor.executeProviderRequest(
        provider.id,
        'create_tracking',
        payload,
        { shipment_id: job.bl_number, bl_number: job.bl_number },
      );
      const returnedId = (created as any)?.shipment_id || (created as any)?.id || (created as any)?.tracking_id;
      const providerTrackingId = (created as any)?.shipment?.id || returnedId;

      if (providerTrackingId) {
        trackingId = String(providerTrackingId);
        job.provider_tracking_id = trackingId;
        console.log('ShipsGo provider_tracking_id (created):', trackingId);
      }
    } catch (err) {
      // proceed even if already exists
      console.warn('create_tracking failed or already exists', err?.toString?.());
      const existingId = (err as any)?.response?.data?.shipment?.id || (err as any)?.response?.data?.id;
      if (existingId) {
        trackingId = String(existingId);
        job.provider_tracking_id = trackingId;
        console.log('ShipsGo provider_tracking_id (existing):', trackingId);
      }
    }

    if (!trackingId) {
      console.warn('No valid ShipsGo tracking id after create_tracking – skip fetch (check API credits)');
      return;
    }

    // 2) GET get_shipment (using id from step 1)
    let shipmentPayload: any = null;
    try {
      shipmentPayload = await this.executor.executeProviderRequest(
        provider.id,
        'get_shipment',
        { shipment_id: trackingId },
        { shipment_id: job.bl_number, bl_number: job.bl_number },
      );
    } catch (err) {
      console.warn('get_shipment failed', err?.toString?.());
    }
    // 3) GET get_route (using same id from step 1)
    let routePayload: any = null;
    try {
      routePayload = await this.executor.executeProviderRequest(
        provider.id,
        'get_route',
        { shipment_id: trackingId },
        { shipment_id: job.bl_number, bl_number: job.bl_number },
      );
    } catch (err) {
      console.warn('get_route failed', err?.toString?.());
    }

    // normalize and persist
    if (shipmentPayload) {
      const normalized = normalizeProviderResponse(provider.id, shipmentPayload, this.registry, 'get_shipment');
      // Fallback: containers from raw payload if mapping missing
      if ((!normalized.containers || normalized.containers.length === 0) && (shipmentPayload as any)?.shipment?.container?.number) {
        normalized.containers = [
          {
            container_number: (shipmentPayload as any).shipment.container.number,
            container_status: (shipmentPayload as any).shipment.status,
          },
        ];
      }
      if (!normalized.shipment?.shipment_id) {
        normalized.shipment = { ...(normalized.shipment || {}), shipment_id: trackingId };
      }
      if (!normalized.shipment?.shipment_status) {
        normalized.shipment = { ...(normalized.shipment || {}), shipment_status: 'In Transit' };
      }
      canonicalDataService.upsertFromCanonical({
        ...normalized,
        id: normalized.shipment?.shipment_id || trackingId || job.bl_number || job.container_number || job.booking_number || `${Date.now()}`,
        bl_number: job.bl_number,
      });
      // also update injected data for dashboard legacy
      this.dataManager.update_shipment(job.bl_number || job.booking_number || job.container_number || '', {
        status: normalized.shipment?.shipment_status || 'In Transit',
        eta: normalized.route?.eta,
        tracking_provider: provider.name,
        external_tracking_id: trackingId,
        last_tracking_update: new Date().toISOString(),
      });
    }

    if (routePayload) {
      const normalizedRoute = normalizeProviderResponse(provider.id, routePayload, this.registry, 'get_route');
      // Fallback: if mappings didn't produce route_geometry but a geometry array exists, map it
      const rawCoords = (routePayload as any)?.route?.geometry?.coordinates;
      const rawType = (routePayload as any)?.route?.geometry?.type;
      if (!normalizedRoute.route_geometry && rawCoords) {
        normalizedRoute.route_geometry = { route_coordinates: rawCoords, route_geometry_type: rawType || 'LineString' };
      }
      if ((!normalizedRoute.containers || normalizedRoute.containers.length === 0) && (routePayload as any)?.shipment?.container?.number) {
        normalizedRoute.containers = [
          {
            container_number: (routePayload as any).shipment.container.number,
            container_status: (routePayload as any).shipment.status,
          },
        ];
      }
      if (!normalizedRoute.shipment?.shipment_id) {
        normalizedRoute.shipment = { ...(normalizedRoute.shipment || {}), shipment_id: trackingId };
      }
      if (!normalizedRoute.shipment?.shipment_status) {
        normalizedRoute.shipment = { ...(normalizedRoute.shipment || {}), shipment_status: 'In Transit' };
      }
      if (!normalizedRoute.route?.destination_port_name && (routePayload as any)?.shipment?.destination?.port) {
        normalizedRoute.route = { ...(normalizedRoute.route || {}), destination_port_name: (routePayload as any).shipment.destination.port };
      }
      if (!normalizedRoute.route?.origin_port_name && (routePayload as any)?.shipment?.origin?.port) {
        normalizedRoute.route = { ...(normalizedRoute.route || {}), origin_port_name: (routePayload as any).shipment.origin.port };
      }
      const routeId = normalizedRoute.shipment?.shipment_id || trackingId || job.bl_number || job.container_number || job.booking_number || `${Date.now()}`;
      canonicalDataService.upsertFromCanonical({
        ...normalizedRoute,
        id: routeId,
        bl_number: job.bl_number,
      });
      // Ensure route_geometry is persisted even if merges skipped
      const saved = canonicalDataService.getById(routeId);
      if (saved && rawCoords && (!saved.route_geometry || !(saved as any).route_geometry.route_coordinates)) {
        canonicalDataService.upsertFromCanonical({
          ...saved,
          id: routeId,
          route_geometry: { ...(saved.route_geometry || {}), route_coordinates: rawCoords, route_geometry_type: rawType || 'LineString' },
        });
      }
    }
  }
}
