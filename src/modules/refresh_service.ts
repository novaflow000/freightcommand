import Database from 'better-sqlite3';
import crypto from 'crypto';
import { ProviderExecutor, DataMappingEngine } from './provider_executor.ts';
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

    let trackingId = shipment.external_tracking_id || shipment.container_number || shipment.bl_number;
    if (!trackingId && allowCreate) {
      const created = await this.callWithRetry(() =>
        this.executor.executeProviderRequest(provider.id, 'create_tracking', {
          container_number: shipment.container_number,
          bl_number: shipment.bl_number,
          booking_number: shipment.booking_number,
          carrier: shipment.carrier_code || shipment.carrier,
        }, { shipment_id: shipment.bl_number, bl_number: shipment.bl_number })
      );
      const providedId = (created as any)?.shipment?.id || (created as any)?.id || (created as any)?.shipment_id;
      if (providedId) {
        trackingId = String(providedId);
        this.dataManager.update_shipment(shipment.bl_number, {
          external_tracking_id: trackingId,
          tracking_provider: provider.name,
          last_tracking_update: new Date().toISOString(),
        });
      }
    }

    if (!trackingId) throw new Error('Missing tracking id');

    const ensureThrottle = async () => {
      while (!this.throttle(provider.id)) {
        await this.sleep(200);
      }
    };

    let working = canonicalDataService.getById(job.shipment_id);

    // get_shipment
    await ensureThrottle();
    const shipmentPayload = await this.callWithRetry(() =>
      this.executor.executeProviderRequest(provider.id, 'get_shipment', { shipment_id: trackingId }, { shipment_id: job.shipment_id, bl_number: shipment.bl_number })
    );
    const canonicalShipment = this.mapping.normalizeProviderResponse(provider.id, shipmentPayload, 'get_shipment');
    working = this.mergeCanonical(working, { ...canonicalShipment, id: job.shipment_id, bl_number: shipment.bl_number } as any, {
      sourceEndpoint: 'get_shipment',
      mode: job.mode,
    });

    // get_route
    await ensureThrottle();
    const routePayload = await this.callWithRetry(() =>
      this.executor.executeProviderRequest(provider.id, 'get_route', { shipment_id: trackingId }, { shipment_id: job.shipment_id, bl_number: shipment.bl_number })
    );
    const canonicalRoute = this.mapping.normalizeProviderResponse(provider.id, routePayload, 'get_route');
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
