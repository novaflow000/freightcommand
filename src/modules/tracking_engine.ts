import { DataFusionEngine, FusedShipmentData } from './data_fusion.ts';
import { SettingsManager } from './settings_manager.ts';
import { ShipmentDataManager } from './data_manager.ts';
import { CanonicalDataService } from './canonical_data_service.ts';

// Legacy interface for frontend compatibility
export interface FusedData {
  bl_number: string;
  client: string;
  container_number: string;
  carrier: string;
  origin: string;
  destination: string;
  eta: string;
  current_status: string;
  last_location?: { lat: number; lng: number };
  events: any[];
  cargo_type: string;
  cargo_weight: string;
  tracking_provider?: string;
  external_tracking_id?: string;
  last_tracking_update?: string;
}

export interface TrackingStatistics {
  total: number;
  in_transit: number;
  arrived: number;
  delayed: number;
  exceptions: number;
  last_updated: string;
}

export class TrackingEngine {
  private fusionEngine: DataFusionEngine;
  private isRunning: boolean = false;
  private updateIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private latestData: Map<string, FusedShipmentData> = new Map();
  private lastUpdateTimestamp: number = 0;
  private dataManager: ShipmentDataManager;
  private canonicalService?: CanonicalDataService;

  constructor(
    intervalSeconds: number = 1800,
    settingsManager?: SettingsManager,
    dataManager?: ShipmentDataManager,
    canonicalService?: CanonicalDataService,
  ) {
    this.dataManager = dataManager || new ShipmentDataManager();
    this.fusionEngine = new DataFusionEngine(this.dataManager, settingsManager);
    this.updateIntervalMs = intervalSeconds * 1000;
    this.canonicalService = canonicalService;
  }

  public start_tracking(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('Starting tracking engine background loop...');
    this.runUpdateLoop();
  }

  public stop_tracking(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('Tracking engine background loop stopped.');
  }

  private async runUpdateLoop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.update_all_shipments();
    } catch (error) {
      console.error('Error in tracking loop:', error);
    }

    if (this.isRunning) {
      this.timer = setTimeout(() => this.runUpdateLoop(), this.updateIntervalMs);
    }
  }

  public async update_all_shipments(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Updating all shipments...`);
    
    const shipments = this.dataManager.loadShipments();

    // Process in parallel with concurrency limit could be better, but Promise.all is fine for now
    const promises = shipments.map(async (shipment) => {
      return this.processShipmentWithRetry(shipment.bl_number);
    });

    await Promise.all(promises);
    this.lastUpdateTimestamp = Date.now();
    console.log(`[${new Date().toISOString()}] Update complete. Processed ${shipments.length} shipments.`);
  }

  private async processShipmentWithRetry(blNumber: string, attempt: number = 1): Promise<void> {
    try {
      const data = await this.fusionEngine.fuseShipment(blNumber);
      this.latestData.set(blNumber, data);
      this.canonicalService?.upsertFromFused(data);
    } catch (e) {
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
        // console.warn(`Retry attempt ${attempt} for ${blNumber} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processShipmentWithRetry(blNumber, attempt + 1);
      }
      console.error(`Failed to update ${blNumber} after ${attempt} attempts.`);
    }
  }

  public async get_shipment_status(blNumber: string): Promise<FusedShipmentData | undefined> {
    // Return from local cache if available
    if (this.latestData.has(blNumber)) {
      return this.latestData.get(blNumber);
    }
    
    // If not in memory (e.g. first run or new shipment), fetch it directly
    try {
      const data = await this.fusionEngine.fuseShipment(blNumber);
      this.latestData.set(blNumber, data);
      this.canonicalService?.upsertFromFused(data);
      return data;
    } catch (e) {
      console.error(`Error fetching status for ${blNumber}:`, e);
      return undefined;
    }
  }

  /**
   * Ensure a shipment has an external tracking registration as soon as it is injected.
   * This simply runs the fusion once so the provider connector can create the tracking id.
   */
  public async ensureTrackingRegistration(blNumber: string): Promise<void> {
    try {
      const data = await this.fusionEngine.fuseShipment(blNumber);
      this.latestData.set(blNumber, data);
      this.canonicalService?.upsertFromFused(data);
    } catch (e) {
      console.error(`Failed to register tracking for ${blNumber}:`, e);
    }
  }

  public get_statistics(): TrackingStatistics {
    const data = Array.from(this.latestData.values());
    return {
      total: data.length,
      in_transit: data.filter(d => d.tracking.status === 'In Transit').length,
      arrived: data.filter(d => d.tracking.status === 'Arrived').length,
      delayed: data.filter(d => ['Delayed', 'Hold', 'Exception'].includes(d.tracking.status)).length,
      exceptions: data.filter(d => d.sources.api_status === 'failed' || d.sources.api_status === 'cached_fallback_error').length,
      last_updated: new Date(this.lastUpdateTimestamp).toISOString()
    };
  }

  // Legacy method for API compatibility
  public async trackAllShipments(): Promise<FusedData[]> {
    // If cache is empty, trigger an immediate update
    if (this.latestData.size === 0) {
      await this.update_all_shipments();
    }
    
    return Array.from(this.latestData.values()).map(d => this.mapToLegacy(d));
  }

  private mapToLegacy(data: FusedShipmentData): FusedData {
    const normalizedEvents = (data.tracking.events || []).map((evt: any) => ({
      description: evt.description || evt.status || evt.event_type || 'Event',
      location: evt.location || evt.current_port || evt.port || '',
      timestamp: evt.timestamp || evt.time || new Date().toISOString(),
    }));

    return {
      bl_number: data.bl_number,
      client: data.client,
      container_number: data.tracking.container_number,
      carrier: data.tracking.carrier,
      origin: data.route.origin,
      destination: data.route.destination,
      eta: data.tracking.eta || '',
      current_status: data.tracking.status,
      last_location: data.tracking.location,
      events: normalizedEvents,
      cargo_type: data.cargo.type,
      cargo_weight: data.cargo.weight,
      tracking_provider: data.tracking.provider,
      external_tracking_id: data.tracking.tracking_id,
      last_tracking_update: data.sources.timestamp,
    };
  }
}
