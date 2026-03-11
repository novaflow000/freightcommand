import { Shipment, ShipmentDataManager } from './data_manager.ts';
import { HapagLloydConnector } from './api_connectors/hapag_lloyd.ts';
import { MaerskConnector } from './api_connectors/maersk.ts';
import { CmaCgmConnector } from './api_connectors/cma_cgm.ts';
import { SettingsManager } from './settings_manager.ts';
import { deriveInTransitLocation, getPortCoordinates } from './geo_utils.ts';
import { getTrackingProvider } from './tracking_providers/index.ts';

export interface FusedShipmentData {
  bl_number: string;
  client: string;
  cargo: {
    type: string;
    weight: string;
    value: string;
    volume?: string;
    ref: string;
  };
  route: {
    origin: string;
    destination: string;
    incoterm: string;
    geometry?: Array<[number, number]>;
  };
  tracking: {
    container_number: string;
    carrier: string;
    status: string;
    provider?: string;
    tracking_id?: string;
    location?: { lat: number; lng: number; name?: string };
    eta?: string;
    events: any[];
    vessel_position?: { lat: number; lng: number; timestamp: string };
  };
  sources: {
    injected_at: string;
    api_source: string;
    api_status: string;
    fusion_id: string;
    timestamp: string;
    tracking_provider?: string;
    external_tracking_id?: string;
    original_values?: {
      status?: string;
      eta?: string;
    };
  };
}

export class DataFusionEngine {
  private dataManager: ShipmentDataManager;
  private hapagConnector: HapagLloydConnector;
  private maerskConnector: MaerskConnector;
  private cmaConnector: CmaCgmConnector;
  private settingsManager?: SettingsManager;
  
  // Cache storage: BL Number -> { data, timestamp }
  private cache: Map<string, { data: FusedShipmentData, timestamp: number }> = new Map();
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  constructor(dataManager?: ShipmentDataManager, settingsManager?: SettingsManager) {
    this.settingsManager = settingsManager;
    this.dataManager = dataManager || new ShipmentDataManager();
    this.refreshConnectors();
  }

  /**
   * Rebuild carrier connectors from the latest stored settings (or env fallback)
   * so key updates in the admin UI take effect without restarting the server.
   */
  private refreshConnectors() {
    const settings = this.settingsManager?.getSettings();
    const hapagKeys = settings?.apiKeys.hapagLloyd;
    const maerskKey = settings?.apiKeys.maersk.apiKey;
    const cmaKey = settings?.apiKeys.cmaCgm.apiKey;

    this.hapagConnector = new HapagLloydConnector(
      hapagKeys?.clientId || process.env.HAPAG_LLOYD_CLIENT_ID || '',
      hapagKeys?.clientSecret || process.env.HAPAG_LLOYD_CLIENT_SECRET || ''
    );
    this.maerskConnector = new MaerskConnector(maerskKey || process.env.MAERSK_API_KEY || '');
    this.cmaConnector = new CmaCgmConnector(cmaKey || process.env.CMA_CGM_API_KEY || '');
  }

  public async fuseShipment(blNumber: string): Promise<FusedShipmentData> {
    // Ensure connectors reflect the most recent credentials
    this.refreshConnectors();
    const now = Date.now();
    const cached = this.cache.get(blNumber);

    // Cache Strategy: Return valid cache if available
    if (cached && (now - cached.timestamp < this.CACHE_TTL)) {
      // console.log(`[Cache] Hit for ${blNumber}`);
      return cached.data;
    }

    // Step 1: Retrieve injected data via DataManager
    const shipment = this.dataManager.get_shipment_by_bl(blNumber);
    if (!shipment) {
      throw new Error(`Shipment with BL ${blNumber} not found in injected data.`);
    }

    // Step 2: Identify tracking provider (aggregator preferred) and call connector
    let trackingData: any = {};
    let apiStatus = 'success';
    let apiSource = shipment.carrier;
    let usedFallback = false;
    let routeData: any = undefined;

    try {
      const provider = getTrackingProvider(shipment.tracking_provider || 'ShipsGo', this.settingsManager);
      if (provider) {
        apiSource = provider.name;
        let trackingId = shipment.external_tracking_id;
        if (!trackingId) {
          trackingId = await provider.createTracking(
            shipment.container_number,
            shipment.bl_number,
            shipment.carrier,
          );
          this.dataManager.update_shipment(shipment.bl_number, {
            external_tracking_id: trackingId,
            tracking_provider: provider.name,
            last_tracking_update: new Date().toISOString(),
          });
        }

        const unified = await provider.getShipment(trackingId as string);
        trackingData = {
          ...unified,
          provider: provider.name,
          tracking_id: trackingId,
        };
        routeData = unified.route;
      } else if (shipment.carrier === 'Hapag-Lloyd') {
        trackingData = await this.hapagConnector.trackContainer(shipment.container_number);
      } else if (shipment.carrier === 'Maersk') {
        trackingData = await this.maerskConnector.trackContainer(shipment.container_number);
      } else if (shipment.carrier === 'CMA CGM') {
        trackingData = await this.cmaConnector.trackContainer(shipment.container_number);
      } else {
        apiStatus = 'skipped';
        apiSource = 'Unknown Carrier';
        console.warn(`Unknown carrier: ${shipment.carrier} for BL ${blNumber}`);
        usedFallback = true;
      }
    } catch (error: any) {
      console.error(`API tracking failed for ${blNumber}:`, error);
      
      // Error Handling: If API fails, use expired cache (last known data) if available
      if (cached) {
        console.warn(`[Cache] Using expired data for ${blNumber} due to API failure.`);
        const expiredData = { ...cached.data };
        expiredData.sources = { 
          ...expiredData.sources, 
          api_status: 'cached_fallback_error',
          timestamp: new Date().toISOString() // Update timestamp to show when it was served
        };
        return expiredData;
      }

      apiStatus = 'failed';
      usedFallback = true;
      // Fallback to basic info if API fails and no cache
      trackingData = {
        status: shipment.status || 'Unknown',
        simulated: false 
      };
    }

    // Step 4: Merge sources & Step 5: Add metadata
    // Priority Rule: API data overrides injected data if not using fallback
    const fusionId = `fusion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const fusedData: FusedShipmentData = {
      bl_number: shipment.bl_number,
      client: shipment.client,
      cargo: {
        type: shipment.cargo_type,
        weight: shipment.cargo_weight,
        value: shipment.cargo_value,
        ref: shipment.customer_ref,
      },
      route: {
        origin: shipment.origin,
        destination: shipment.destination,
        incoterm: shipment.incoterm,
        geometry: routeData?.route_geometry,
      },
      tracking: {
        container_number: shipment.container_number,
        carrier: shipment.carrier,
        // Priority: Use API status if available, otherwise injected
        status: (usedFallback ? shipment.status : trackingData.status) || shipment.status || 'Unknown',
        provider: trackingData.provider || shipment.tracking_provider,
        tracking_id: trackingData.tracking_id || shipment.external_tracking_id,
        location: trackingData.location,
        eta: (usedFallback ? shipment.eta : trackingData.eta) || shipment.eta,
        events: trackingData.events || [],
        vessel_position: trackingData.vessel_position,
      },
      sources: {
        injected_at: shipment.created_at,
        api_source: apiSource,
        api_status: trackingData.simulated ? 'simulated' : apiStatus,
        fusion_id: fusionId,
        timestamp: timestamp,
        tracking_provider: trackingData.provider || shipment.tracking_provider,
        external_tracking_id: trackingData.tracking_id || shipment.external_tracking_id,
        // Traceability: Keep original injected values
        original_values: {
          status: shipment.status,
          eta: shipment.eta
        }
      },
    };

    // Derive a plausible position when API location is missing/simulated/invalid
    const derivedLocation = deriveInTransitLocation(
      shipment.origin,
      shipment.destination,
      shipment.bl_number,
    );
    const destPort = getPortCoordinates(shipment.destination);
    const originPort = getPortCoordinates(shipment.origin);

    const hasValidLocation =
      trackingData.location &&
      typeof trackingData.location.lat === 'number' &&
      typeof trackingData.location.lng === 'number' &&
      !(trackingData.location.lat === 0 && trackingData.location.lng === 0);

    if (hasValidLocation && !trackingData.simulated) {
      fusedData.tracking.location = trackingData.location;
    } else if (fusedData.tracking.status === 'Arrived' && destPort) {
      fusedData.tracking.location = { lat: destPort[0], lng: destPort[1] };
    } else if (derivedLocation) {
      fusedData.tracking.location = derivedLocation;
    } else if (originPort) {
      // fallback: origin port (still at quay)
      fusedData.tracking.location = { lat: originPort[0], lng: originPort[1] };
    }

    // Persist last tracking snapshot to injected storage for traceability
    this.dataManager.update_shipment(shipment.bl_number, {
      status: fusedData.tracking.status,
      eta: fusedData.tracking.eta,
      tracking_provider: fusedData.tracking.provider || shipment.tracking_provider,
      external_tracking_id: fusedData.tracking.tracking_id || shipment.external_tracking_id,
      last_tracking_update: timestamp,
    });

    // Update Cache only if we successfully got data (or simulated data from connector)
    // If we completely failed and used injected fallback, we might still want to cache it briefly 
    // to avoid hammering the logic, but for now let's cache everything.
    this.cache.set(blNumber, { data: fusedData, timestamp: now });

    return fusedData;
  }
}
