import Database from 'better-sqlite3';
import crypto from 'crypto';
import { ProviderExecutor, DataMappingEngine } from './provider_executor.ts';
import { buildShipsGoCreatePayload } from './carriers/carrier_mapping.ts';
import { ProviderRegistry } from './provider_registry.ts';
import { ProviderRouter } from './provider_router.ts';
import { canonicalDataService, CanonicalShipmentRecord } from './canonical_data_service.ts';
import { ShipmentDataManager } from './data_manager.ts';

export type RefreshMode = 'reapply' | 'api' | 'full';
type Status = 'queued' | 'running' | 'success' | 'failed';

export interface RefreshJob {
  id: string;
  shipment_id: string;
  mode: RefreshMode;
  status: Status;
  attempts: number;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

interface MergeContext {
  sourceEndpoint?: string;
  mode: RefreshMode;
}

export class RefreshService {
  private db: Database.Database;
  private registry: ProviderRegistry;
  private executor: ProviderExecutor;
  private router: ProviderRouter;
  private mapping: DataMappingEngine;
  private dataManager: ShipmentDataManager;
  private runningShipments: Set<string> = new Set();
  private providerTokens: Map<string, { tokens: number; last: number }> = new Map();

  constructor(opts: { registry: ProviderRegistry; executor: ProviderExecutor; router: ProviderRouter; dataManager: ShipmentDataManager }) {
    this.registry = opts.registry;
    this.executor = opts.executor;
    this.router = opts.router;
    this.dataManager = opts.dataManager;
    this.mapping = new DataMappingEngine(this.registry);
    this.db = new Database(`${process.cwd()}/data/app.db`);
    this.ensureTable();
    this.startWorker();
  }

  private ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_jobs (
        id TEXT PRIMARY KEY,
        shipment_id TEXT,
        mode TEXT,
        status TEXT,
        attempts INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT,
        started_at TEXT,
        finished_at TEXT
      );
    `);
  }

  public enqueue(shipmentIds: string[], mode: RefreshMode): RefreshJob[] {
    const now = new Date().toISOString();
    const jobs: RefreshJob[] = [];
    const stmt = this.db.prepare(
      `INSERT INTO refresh_jobs (id, shipment_id, mode, status, attempts, created_at) VALUES (@id, @shipment_id, @mode, @status, @attempts, @created_at)`
    );
    const tx = this.db.transaction((rows: RefreshJob[]) => rows.forEach((r) => stmt.run(r)));

    shipmentIds.forEach((sid) => {
      const job: RefreshJob = {
        id: crypto.randomUUID(),
        shipment_id: sid,
        mode,
        status: 'queued',
        attempts: 0,
        created_at: now,
      };
      jobs.push(job);
    });
    tx(jobs);
    return jobs;
  }

  public getJob(id: string): RefreshJob | undefined {
    return this.db.prepare('SELECT * FROM refresh_jobs WHERE id = ?').get(id);
  }

  private nextJob(): RefreshJob | undefined {
    const row = this.db.prepare("SELECT * FROM refresh_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get();
    return row;
  }

  private markRunning(id: string) {
    this.db
      .prepare("UPDATE refresh_jobs SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  private markResult(id: string, status: Status, error?: string) {
    this.db
      .prepare('UPDATE refresh_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?')
      .run(status, error || null, new Date().toISOString(), id);
  }

  private async sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private throttle(providerId: string) {
    const bucket = this.providerTokens.get(providerId) || { tokens: 5, last: Date.now() };
    const now = Date.now();
    const refill = Math.floor((now - bucket.last) / 1000); // 1 token/sec
    if (refill > 0) {
      bucket.tokens = Math.min(5, bucket.tokens + refill);
      bucket.last = now;
    }
    if (bucket.tokens <= 0) return false;
    bucket.tokens -= 1;
    this.providerTokens.set(providerId, bucket);
    return true;
  }

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastErr: any;
    while (attempt < 3) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const code = err?.response?.status;
        if (code === 429 || (code >= 500 && code < 600)) {
          await this.sleep(500 * Math.pow(2, attempt));
          attempt += 1;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private mergeCanonical(existing: CanonicalShipmentRecord | undefined, incoming: CanonicalShipmentRecord, ctx: MergeContext): CanonicalShipmentRecord {
    const merged: CanonicalShipmentRecord = existing ? JSON.parse(JSON.stringify(existing)) : { ...incoming };

    const overwriteScalar = (target: any, source: any) => {
      Object.entries(source || {}).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;
        target[k] = v;
      });
    };

    merged.bl_number = incoming.bl_number || merged.bl_number;
    merged.client = incoming.client || merged.client;

    overwriteScalar((merged as any).shipment || (merged.shipment = {}), incoming.shipment || {});
    overwriteScalar((merged as any).carrier || (merged.carrier = {}), incoming.carrier || {});
    overwriteScalar((merged as any).route || (merged.route = {}), incoming.route || {});

    if (incoming.containers?.length) {
      merged.containers = merged.containers || [];
      incoming.containers.forEach((c, idx) => {
        merged.containers![idx] = { ...(merged.containers![idx] || {}), ...c };
      });
    }

    const dedupEvents = (list: any[]) => {
      const map = new Map<string, any>();
      list.forEach((e) => {
        const key = `${e.event_type || ''}|${e.event_timestamp || ''}|${e.event_location_code || ''}`;
        map.set(key, { ...(map.get(key) || {}), ...e });
      });
      return Array.from(map.values());
    };

    if (incoming.events?.length) {
      if (ctx.sourceEndpoint === 'get_route') {
        merged.events = incoming.events;
      } else {
        merged.events = dedupEvents([...(merged.events || []), ...incoming.events]);
      }
    }
    if (!merged.events?.length && incoming.containers?.[0]?.events?.length) {
      merged.events = incoming.containers[0].events;
    }

    if (incoming.route_geometry && ctx.sourceEndpoint === 'get_route') {
      merged.route_geometry = incoming.route_geometry;
    } else if (incoming.route_geometry && !merged.route_geometry) {
      merged.route_geometry = incoming.route_geometry;
    }

    if (!merged.shipment?.shipment_status) {
      (merged as any).shipment = merged.shipment || {};
      merged.shipment!.shipment_status =
        incoming.shipment?.shipment_status ||
        merged.events?.[0]?.event_status ||
        merged.containers?.[0]?.container_status ||
        'In Transit';
    }

    if (incoming.vessels?.length) {
      merged.vessels = incoming.vessels;
    }

    merged.metadata = {
      ...(merged.metadata || {}),
      ...(incoming.metadata || {}),
      last_refresh_at: new Date().toISOString(),
      last_refresh_mode: ctx.mode,
    };

    return merged;
  }

  private async reapplyFromLogs(job: RefreshJob) {
    const logs = this.registry.getApiLogsByShipment(job.shipment_id);
    if (!logs.length) throw new Error('No api_logs found for shipment');

    const endpointLookup = new Map(this.registry.listEndpoints().map((e) => [e.id, e]));
    // Apply get_shipment first, then get_route
    const ordered = logs.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    let working = canonicalDataService.getById(job.shipment_id);

    ordered.forEach((log) => {
      const endpoint = endpointLookup.get(log.endpoint_id);
      if (!endpoint) return;
      const canonical = this.mapping.normalizeProviderResponse(log.provider_id, log.response_body, endpoint.endpoint_name);
      const enriched: CanonicalShipmentRecord = {
        id: job.shipment_id,
        bl_number: job.shipment_id,
        ...canonical,
      } as any;
      working = this.mergeCanonical(working, enriched, { sourceEndpoint: endpoint.endpoint_name, mode: job.mode });
    });

    if (working) {
      canonicalDataService.upsertFromCanonical({ ...working, id: job.shipment_id, bl_number: job.shipment_id });
    }
  }

  private async refreshFromApi(job: RefreshJob, allowCreate: boolean) {
    const shipment = this.dataManager.get_shipment_by_bl(job.shipment_id);
    if (!shipment) throw new Error('Shipment not found in data manager');

    const providerOrder = this.router.selectProvider({
      container_number: shipment.container_number,
      bl_number: shipment.bl_number,
      carrier: shipment.carrier_code || shipment.carrier,
    });
    if (!providerOrder.length) throw new Error('No provider available');
    const provider = providerOrder[0];

    const existingCanonical = canonicalDataService.getById(job.shipment_id);
    const prevShipmentId = existingCanonical?.shipment?.shipment_id as string;
    const looksLikeShipsGoId = (id: string) => id && /^\d+$/.test(String(id));
    let rawId = shipment.external_tracking_id || (looksLikeShipsGoId(prevShipmentId) ? prevShipmentId : undefined) || shipment.container_number || shipment.bl_number;
    const validForShipsGo = rawId && !String(rawId).startsWith('sim-') && (provider.name !== 'ShipsGo' || looksLikeShipsGoId(rawId));
    let trackingId = validForShipsGo ? rawId : undefined;

    // 1) POST create_tracking first → get shipment id (required before get_shipment/get_route)
    // Always attempt create when no valid id – even for "Refresh" (api mode)
    if (!trackingId) {
      try {
        const payload = buildShipsGoCreatePayload({
          bl_number: shipment.bl_number,
          container_number: shipment.container_number,
          booking_number: (shipment as any).booking_number,
          carrier: shipment.carrier_code || shipment.carrier,
        });
        const created = await this.callWithRetry(() =>
          this.executor.executeProviderRequest(provider.id, 'create_tracking', payload, {
            shipment_id: shipment.bl_number,
            bl_number: shipment.bl_number,
          })
        );
        const providedId = (created as any)?.shipment?.id || (created as any)?.id || (created as any)?.shipment_id;
        if (providedId) {
          trackingId = String(providedId);
          this.dataManager.update_shipment(shipment.bl_number || job.shipment_id, {
            external_tracking_id: trackingId,
            tracking_provider: provider.name,
            last_tracking_update: new Date().toISOString(),
          });
        }
      } catch (createErr: any) {
        const status = createErr?.response?.status;
        const body = createErr?.response?.data;
        if (status === 402 || body?.message === 'NOT_ENOUGH_CREDITS') {
          throw new Error('ShipsGo: No API credits. Add credits at shipsgo.com to enable tracking.');
        }
        const existingId = body?.shipment?.id || body?.id;
        if (existingId) {
          trackingId = String(existingId);
          this.dataManager.update_shipment(shipment.bl_number || job.shipment_id, {
            external_tracking_id: trackingId,
            tracking_provider: provider.name,
            last_tracking_update: new Date().toISOString(),
          });
        } else {
          throw createErr;
        }
      }
    }

    if (!trackingId) throw new Error('Missing tracking id. Use Full re-sync to create tracking first, or ensure ShipsGo has API credits.');

    // 2) GET get_shipment (using id from step 1)
    const ensureThrottle = async () => {
      while (!this.throttle(provider.id)) {
        await this.sleep(200);
      }
    };

    let working = canonicalDataService.getById(job.shipment_id);

    // get_shipment - ShipsGo returns { shipment: {...} } but executor extracts inner object; wrap for mappings that expect shipment.xxx
    await ensureThrottle();
    let shipmentPayload: any;
    try {
      shipmentPayload = await this.callWithRetry(() =>
        this.executor.executeProviderRequest(provider.id, 'get_shipment', { shipment_id: trackingId }, { shipment_id: job.shipment_id, bl_number: shipment.bl_number })
      );
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new Error(`Shipment ${trackingId} not found on ShipsGo. Use Full re-sync to create it first (requires API credits).`);
      }
      throw err;
    }

    const wrappedForMapping = shipmentPayload && typeof shipmentPayload === 'object' ? { shipment: shipmentPayload } : shipmentPayload;
    let canonicalShipment = this.mapping.normalizeProviderResponse(provider.id, wrappedForMapping, 'get_shipment');

    if (provider.name === 'ShipsGo' && shipmentPayload) {
      const s = shipmentPayload as any;
      if (s.status && !canonicalShipment.shipment?.shipment_status) {
        canonicalShipment.shipment = { ...(canonicalShipment.shipment || {}), shipment_status: s.status };
      } else if (s.status) {
        canonicalShipment.shipment!.shipment_status = s.status;
      }
      if (s.reference && !canonicalShipment.shipment?.reference) {
        canonicalShipment.shipment = { ...(canonicalShipment.shipment || {}), reference: s.reference };
      }
      const movements = s?.containers?.[0]?.movements || [];
      if (movements.length && (!canonicalShipment.events?.length || !canonicalShipment.events[0]?.event_type)) {
        const evts = movements.map((m: any) => ({
          event_type: m.event || 'EVENT',
          event_status: m.status || 'UNKNOWN',
          event_timestamp: m.timestamp,
          event_location_name: m.location?.name,
          event_location_code: m.location?.code,
          vessel_name: m.vessel?.name,
          voyage: m.voyage,
        }));
        canonicalShipment.events = evts;
        if (canonicalShipment.containers?.[0]) {
          canonicalShipment.containers[0].events = evts;
        }
      }
    }

    working = this.mergeCanonical(working, { ...canonicalShipment, id: job.shipment_id, bl_number: shipment.bl_number } as any, {
      sourceEndpoint: 'get_shipment',
      mode: job.mode,
    });

    // 3) GET get_route (using same id from step 1)
    await ensureThrottle();
    const routePayload = await this.callWithRetry(() =>
      this.executor.executeProviderRequest(provider.id, 'get_route', { shipment_id: trackingId }, { shipment_id: job.shipment_id, bl_number: shipment.bl_number })
    );
    const canonicalRoute = this.mapping.normalizeProviderResponse(provider.id, routePayload, 'get_route');
    // Build route_geometry from GeoJSON features if mapping didn't produce it
    if (Array.isArray(routePayload) && !canonicalRoute.route_geometry?.route_coordinates) {
      const coords: number[][] = [];
      routePayload.forEach((f: any) => {
        if (f?.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
          f.geometry.coordinates.forEach((c: number[]) => coords.push(c));
        } else if (f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
          coords.push(f.geometry.coordinates);
        }
      });
      if (coords.length > 0) {
        (canonicalRoute as any).route_geometry = { route_coordinates: coords, route_geometry_type: 'LineString' };
      }
    }
    working = this.mergeCanonical(working, { ...canonicalRoute, id: job.shipment_id, bl_number: shipment.bl_number } as any, {
      sourceEndpoint: 'get_route',
      mode: job.mode,
    });

    if (working) {
      working.metadata = {
        ...(working.metadata || {}),
        last_api_update_at: new Date().toISOString(),
        last_refresh_at: new Date().toISOString(),
        last_refresh_mode: job.mode,
      };
      canonicalDataService.upsertFromCanonical({ ...working, id: job.shipment_id, bl_number: shipment.bl_number });
    }
  }

  private async processJob(job: RefreshJob) {
    this.markRunning(job.id);
    this.runningShipments.add(job.shipment_id);
    try {
      if (job.mode === 'reapply') {
        await this.reapplyFromLogs(job);
      } else if (job.mode === 'api') {
        await this.refreshFromApi(job, false);
      } else if (job.mode === 'full') {
        await this.refreshFromApi(job, true);
      }
      this.markResult(job.id, 'success');
    } catch (err: any) {
      this.markResult(job.id, 'failed', err?.message || String(err));
    } finally {
      this.runningShipments.delete(job.shipment_id);
    }
  }

  private startWorker() {
    const loop = async () => {
      const job = this.nextJob();
      if (!job) {
        setTimeout(loop, 2000);
        return;
      }
      if (this.runningShipments.has(job.shipment_id)) {
        // wait and retry later to avoid concurrent refresh on same shipment
        setTimeout(loop, 500);
        return;
      }
      await this.processJob(job);
      setImmediate(loop);
    };
    setImmediate(loop);
  }
}
