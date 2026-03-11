import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export interface Shipment {
  bl_number: string;
  client: string;
  container_number: string;
  carrier: string;
  carrier_code?: string;
  carrier_name?: string;
  origin: string;
  destination: string;
  origin_port?: string;
  destination_port?: string;
  cargo_type: string;
  cargo_weight: string;
  cargo_value: string;
  weight?: string;
  customer_ref: string;
  incoterm: string;
  special_instructions: string;
  created_at: string;
  updated_at: string;
  // Optional fields for tracking status
  status?: string;
  eta?: string;
  tracking_provider?: string;
  external_tracking_id?: string;
  last_tracking_update?: string;
}

export class ShipmentDataManager {
  private dataPath: string;
  private shipments: Shipment[] = [];

  constructor(customPath?: string) {
    this.dataPath = customPath || path.join(process.cwd(), 'data', 'shipments.csv');
    this.initialize();
  }

  private initialize() {
    if (!fs.existsSync(this.dataPath)) {
      this.createSampleData();
    } else {
      this.loadShipments();
    }
  }

  private createSampleData() {
    const sampleData: Shipment[] = [
      {
        bl_number: 'HLCU123456789',
        client: 'Acme Corp',
        container_number: 'HLBU1234567',
        carrier: 'Hapag-Lloyd',
        origin: 'Hamburg',
        destination: 'New York',
        origin_port: 'Hamburg',
        destination_port: 'New York',
        cargo_type: 'Electronics',
        cargo_weight: '15000',
        weight: '15000',
        cargo_value: '50000',
        customer_ref: 'REF001',
        incoterm: 'FOB',
        special_instructions: 'Handle with care',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'In Transit',
        eta: '2023-11-15',
        tracking_provider: 'ShipsGo',
      },
      {
        bl_number: 'MAEU987654321',
        client: 'Global Trade Ltd',
        container_number: 'MSKU9876543',
        carrier: 'Maersk',
        origin: 'Shanghai',
        destination: 'Rotterdam',
        origin_port: 'Shanghai',
        destination_port: 'Rotterdam',
        cargo_type: 'Textiles',
        cargo_weight: '12000',
        weight: '12000',
        cargo_value: '30000',
        customer_ref: 'REF002',
        incoterm: 'CIF',
        special_instructions: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'Arrived',
        eta: '2023-10-20',
        tracking_provider: 'ShipsGo',
      },
      {
        bl_number: 'CMAC456789012',
        client: 'Pacific Imports',
        container_number: 'CMAU4567890',
        carrier: 'CMA CGM',
        origin: 'Singapore',
        destination: 'Los Angeles',
        origin_port: 'Singapore',
        destination_port: 'Los Angeles',
        cargo_type: 'Machinery',
        cargo_weight: '20000',
        weight: '20000',
        cargo_value: '100000',
        customer_ref: 'REF003',
        incoterm: 'DDP',
        special_instructions: 'Keep dry',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'In Transit',
        eta: '2023-12-01',
        tracking_provider: 'ShipsGo',
      },
    ];
    this.shipments = sampleData;
    this._save_to_csv();
  }

  public loadShipments(): Shipment[] {
    try {
      const fileContent = fs.readFileSync(this.dataPath, 'utf-8');
      this.shipments = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
      }) as Shipment[];
      return this.shipments;
    } catch (error) {
      console.error('Error loading shipments:', error);
      return [];
    }
  }

  private _save_to_csv() {
    try {
      const csvContent = stringify(this.shipments, {
        header: true,
        columns: [
          'bl_number',
          'client',
          'container_number',
          'carrier',
          'carrier_code',
          'carrier_name',
          'origin',
          'destination',
          'origin_port',
          'destination_port',
          'cargo_type',
          'cargo_weight',
          'weight',
          'cargo_value',
          'customer_ref',
          'incoterm',
          'special_instructions',
          'created_at',
          'updated_at',
          'status',
          'eta',
          'tracking_provider',
          'external_tracking_id',
          'last_tracking_update',
        ],
      });
      fs.writeFileSync(this.dataPath, csvContent);
    } catch (error) {
      console.error('Error saving shipments to CSV:', error);
    }
  }

  public add_shipment(shipmentData: Omit<Shipment, 'created_at' | 'updated_at'>): Shipment {
    this.validate_required(shipmentData);
    this.prevent_duplicates(shipmentData);

    const newShipment: Shipment = {
      ...shipmentData,
      carrier_name: shipmentData.carrier_name || shipmentData.carrier || '',
      carrier_code: shipmentData.carrier_code || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Default values for optional fields if not provided
      origin: shipmentData.origin || '',
      destination: shipmentData.destination || '',
      origin_port: shipmentData.origin_port || shipmentData.origin || '',
      destination_port: shipmentData.destination_port || shipmentData.destination || '',
      cargo_type: shipmentData.cargo_type || '',
      cargo_weight: shipmentData.cargo_weight || shipmentData.weight || '',
      weight: shipmentData.weight || shipmentData.cargo_weight || '',
      cargo_value: shipmentData.cargo_value || '',
      customer_ref: shipmentData.customer_ref || '',
      incoterm: shipmentData.incoterm || '',
      special_instructions: shipmentData.special_instructions || '',
      status: shipmentData.status || 'Tracking Requested',
      eta: shipmentData.eta || '',
      tracking_provider: shipmentData.tracking_provider || 'ShipsGo',
      external_tracking_id: shipmentData.external_tracking_id || '',
      last_tracking_update: shipmentData.last_tracking_update || '',
    };

    this.shipments.push(newShipment);
    this._save_to_csv();
    return newShipment;
  }

  private validate_required(data: Partial<Shipment>) {
    const idsPresent = Boolean(data.container_number || data.booking_number || data.bl_number);
    if (!idsPresent) throw new Error('At least one of container_number, booking_number, or bl_number is required');
    if (!data.carrier) throw new Error('Missing required field: carrier');
  }

  private prevent_duplicates(data: Partial<Shipment>) {
    const existing = this.find_by_identifiers(data.container_number, data.booking_number, data.bl_number);
    if (existing) {
      throw new Error('Shipment already exists (by container/booking/BL)');
    }
  }

  public upsert_shipment(shipmentData: Partial<Shipment>): Shipment {
    this.validate_required(shipmentData);
    const existing = this.find_by_identifiers(shipmentData.container_number, shipmentData.booking_number, shipmentData.bl_number);
    if (existing) {
      return this.update_shipment(existing.bl_number, shipmentData as any) as Shipment;
    }
    return this.add_shipment(shipmentData as any);
  }

  public update_shipment(bl_number: string, updates: Partial<Omit<Shipment, 'bl_number' | 'created_at' | 'updated_at'>>): Shipment | undefined {
    const index = this.shipments.findIndex((s) => s.bl_number === bl_number);
    if (index === -1) {
      return undefined;
    }

    this.shipments[index] = {
      ...this.shipments[index],
      ...updates,
      carrier_name: updates.carrier_name || updates.carrier || this.shipments[index].carrier_name || this.shipments[index].carrier,
      carrier_code: updates.carrier_code || this.shipments[index].carrier_code,
      updated_at: new Date().toISOString(),
    };

    this._save_to_csv();
    return this.shipments[index];
  }

  public delete_shipment(bl_number: string): boolean {
    const index = this.shipments.findIndex((s) => s.bl_number === bl_number);
    if (index === -1) {
      return false;
    }
    this.shipments.splice(index, 1);
    this._save_to_csv();
    return true;
  }

  public get_shipment_by_bl(bl_number: string): Shipment | undefined {
    return this.shipments.find((s) => s.bl_number === bl_number);
  }

  public find_by_identifiers(container?: string, booking?: string, bl?: string): Shipment | undefined {
    return this.shipments.find(
      (s) =>
        (!!container && s.container_number === container) ||
        (!!booking && s.booking_number === booking) ||
        (!!bl && s.bl_number === bl),
    );
  }

  public get_shipments_by_carrier(carrier: string): Shipment[] {
    return this.shipments.filter((s) => s.carrier === carrier);
  }

  public get_all_shipments(): Shipment[] {
    return this.shipments;
  }

  public export_template(): string {
    const headers = [
      'bl_number',
      'client',
      'container_number',
      'carrier',
      'origin',
      'destination',
      'origin_port',
      'destination_port',
      'cargo_type',
      'cargo_weight',
      'weight',
      'cargo_value',
      'customer_ref',
      'incoterm',
      'special_instructions',
      'tracking_provider',
    ];
    return headers.join(',');
  }
}

// Export DataManager alias for backward compatibility if needed, 
// but we should update consumers to use ShipmentDataManager
export { ShipmentDataManager as DataManager };
