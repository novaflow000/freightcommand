import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export interface Shipment {
  bl_number: string;
  booking_number?: string;
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

  /** Ensure we have enough demo shipments for map/KPIs. Call after load if count is low. */
  public ensureDemoShipments(): void {
    if (this.shipments.length >= 18) return;
    this.shipments = [];
    this.createSampleData();
  }

  private createSampleData() {
    const base = new Date().toISOString();
    const sampleData: Shipment[] = [
      { bl_number: 'HLCU123456789', client: 'Acme Corp', container_number: 'HLBU1234567', carrier: 'Hapag-Lloyd', origin: 'Casablanca', destination: 'New York', origin_port: 'Casablanca', destination_port: 'New York', cargo_type: 'Electronics', cargo_weight: '15000', weight: '15000', cargo_value: '50000', customer_ref: 'REF001', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-15', tracking_provider: 'ShipsGo' },
      { bl_number: 'MAEU987654321', client: 'Global Trade Ltd', container_number: 'MSKU9876543', carrier: 'Maersk', origin: 'Tanger Med', destination: 'Rotterdam', origin_port: 'Tanger Med', destination_port: 'Rotterdam', cargo_type: 'Textiles', cargo_weight: '12000', weight: '12000', cargo_value: '30000', customer_ref: 'REF002', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'Delivered', eta: '2024-11-20', tracking_provider: 'ShipsGo' },
      { bl_number: 'CMAC456789012', client: 'Pacific Imports', container_number: 'CMAU4567890', carrier: 'CMA CGM', origin: 'Casablanca', destination: 'Shanghai', origin_port: 'Casablanca', destination_port: 'Shanghai', cargo_type: 'Machinery', cargo_weight: '20000', weight: '20000', cargo_value: '100000', customer_ref: 'REF003', incoterm: 'DDP', special_instructions: 'Keep dry', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-25', tracking_provider: 'ShipsGo' },
      { bl_number: 'HLAG111222333', client: 'EuroFreight', container_number: 'HLBG1112223', carrier: 'Hapag-Lloyd', origin: 'Jorf Lasfar', destination: 'Antwerp', origin_port: 'Jorf Lasfar', destination_port: 'Antwerp', cargo_type: 'Chemicals', cargo_weight: '18000', weight: '18000', cargo_value: '75000', customer_ref: 'REF004', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'Delayed', eta: '2024-12-20', tracking_provider: 'ShipsGo' },
      { bl_number: 'MSCU444555666', client: 'Mediterranean Co', container_number: 'MSCA4445556', carrier: 'MSC', origin: 'Mohammedia', destination: 'Dubai', origin_port: 'Mohammedia', destination_port: 'Dubai', cargo_type: 'Consumer Goods', cargo_weight: '14000', weight: '14000', cargo_value: '45000', customer_ref: 'REF005', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-18', tracking_provider: 'ShipsGo' },
      { bl_number: 'OOLU777888999', client: 'Asia Pacific Ltd', container_number: 'OOLB7778889', carrier: 'OOCL', origin: 'Tanger Med', destination: 'Savannah', origin_port: 'Tanger Med', destination_port: 'Savannah', cargo_type: 'Auto Parts', cargo_weight: '16000', weight: '16000', cargo_value: '62000', customer_ref: 'REF006', incoterm: 'DDP', special_instructions: '', created_at: base, updated_at: base, status: 'Pending', eta: '2025-01-05', tracking_provider: 'ShipsGo' },
      { bl_number: 'EGLV000111222', client: 'China Export Co', container_number: 'EGLB0001112', carrier: 'Evergreen', origin: 'Casablanca', destination: 'Santos', origin_port: 'Casablanca', destination_port: 'Santos', cargo_type: 'Phosphates', cargo_weight: '22000', weight: '22000', cargo_value: '85000', customer_ref: 'REF007', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-28', tracking_provider: 'ShipsGo' },
      { bl_number: 'COSU333444555', client: 'South America Inc', container_number: 'COSA3334445', carrier: 'COSCO', origin: 'Jorf Lasfar', destination: 'Los Angeles', origin_port: 'Jorf Lasfar', destination_port: 'Los Angeles', cargo_type: 'Coffee', cargo_weight: '11000', weight: '11000', cargo_value: '38000', customer_ref: 'REF008', incoterm: 'FOB', special_instructions: 'Temperature control', created_at: base, updated_at: base, status: 'Delivered', eta: '2024-11-30', tracking_provider: 'ShipsGo' },
      { bl_number: 'HLCU201001011', client: 'Atlantic Trading', container_number: 'HLBU2010011', carrier: 'Hapag-Lloyd', origin: 'Casablanca', destination: 'Singapore', origin_port: 'Casablanca', destination_port: 'Singapore', cargo_type: 'Textiles', cargo_weight: '13000', weight: '13000', cargo_value: '42000', customer_ref: 'REF009', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-22', tracking_provider: 'ShipsGo' },
      { bl_number: 'MAEU201002022', client: 'North Euro', container_number: 'MSKU2010022', carrier: 'Maersk', origin: 'Tanger Med', destination: 'Houston', origin_port: 'Tanger Med', destination_port: 'Houston', cargo_type: 'Petrochemicals', cargo_weight: '19000', weight: '19000', cargo_value: '92000', customer_ref: 'REF010', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'Delayed', eta: '2024-12-25', tracking_provider: 'ShipsGo' },
      { bl_number: 'CMAC201003033', client: 'Med Shipping', container_number: 'CMAU2010033', carrier: 'CMA CGM', origin: 'Mohammedia', destination: 'Antwerp', origin_port: 'Mohammedia', destination_port: 'Antwerp', cargo_type: 'Fertilizers', cargo_weight: '24000', weight: '24000', cargo_value: '58000', customer_ref: 'REF011', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-18', tracking_provider: 'ShipsGo' },
      { bl_number: 'MSCU201004044', client: 'Gulf Imports', container_number: 'MSCA2010044', carrier: 'MSC', origin: 'Jorf Lasfar', destination: 'Dubai', origin_port: 'Jorf Lasfar', destination_port: 'Dubai', cargo_type: 'Phosphates', cargo_weight: '26000', weight: '26000', cargo_value: '78000', customer_ref: 'REF012', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-20', tracking_provider: 'ShipsGo' },
      { bl_number: 'HLAG201005055', client: 'EuroPhos', container_number: 'HLBG2010055', carrier: 'Hapag-Lloyd', origin: 'Casablanca', destination: 'Rotterdam', origin_port: 'Casablanca', destination_port: 'Rotterdam', cargo_type: 'Phosphates', cargo_weight: '22000', weight: '22000', cargo_value: '66000', customer_ref: 'REF013', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'Delivered', eta: '2024-11-28', tracking_provider: 'ShipsGo' },
      { bl_number: 'OOLU201006066', client: 'Auto Global', container_number: 'OOLB2010066', carrier: 'OOCL', origin: 'Tanger Med', destination: 'Shanghai', origin_port: 'Tanger Med', destination_port: 'Shanghai', cargo_type: 'Auto Parts', cargo_weight: '15000', weight: '15000', cargo_value: '95000', customer_ref: 'REF014', incoterm: 'DDP', special_instructions: '', created_at: base, updated_at: base, status: 'Pending', eta: '2025-01-10', tracking_provider: 'ShipsGo' },
      { bl_number: 'EGLV201007077', client: 'Brazil Connect', container_number: 'EGLB2010077', carrier: 'Evergreen', origin: 'Jorf Lasfar', destination: 'Santos', origin_port: 'Jorf Lasfar', destination_port: 'Santos', cargo_type: 'Phosphoric Acid', cargo_weight: '20000', weight: '20000', cargo_value: '72000', customer_ref: 'REF015', incoterm: 'CIF', special_instructions: 'Hazardous', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-30', tracking_provider: 'ShipsGo' },
      { bl_number: 'COSU201008088', client: 'Asia Link', container_number: 'COSA2010088', carrier: 'COSCO', origin: 'Mohammedia', destination: 'Singapore', origin_port: 'Mohammedia', destination_port: 'Singapore', cargo_type: 'Consumer Goods', cargo_weight: '14000', weight: '14000', cargo_value: '54000', customer_ref: 'REF016', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-26', tracking_provider: 'ShipsGo' },
      { bl_number: 'MAEU201009099', client: 'TexTrade', container_number: 'MSKU2010099', carrier: 'Maersk', origin: 'Casablanca', destination: 'Houston', origin_port: 'Casablanca', destination_port: 'Houston', cargo_type: 'Chemicals', cargo_weight: '17000', weight: '17000', cargo_value: '81000', customer_ref: 'REF017', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'Delayed', eta: '2024-12-28', tracking_provider: 'ShipsGo' },
      { bl_number: 'MSCU201010100', client: 'Nordic Freight', container_number: 'MSCA2010100', carrier: 'MSC', origin: 'Tanger Med', destination: 'Antwerp', origin_port: 'Tanger Med', destination_port: 'Antwerp', cargo_type: 'Furniture', cargo_weight: '11000', weight: '11000', cargo_value: '39000', customer_ref: 'REF018', incoterm: 'CIF', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-15', tracking_provider: 'ShipsGo' },
      { bl_number: 'CMAC201011111', client: 'Pacific Routes', container_number: 'CMAU2010111', carrier: 'CMA CGM', origin: 'Jorf Lasfar', destination: 'Los Angeles', origin_port: 'Jorf Lasfar', destination_port: 'Los Angeles', cargo_type: 'Machinery', cargo_weight: '18000', weight: '18000', cargo_value: '88000', customer_ref: 'REF019', incoterm: 'DDP', special_instructions: '', created_at: base, updated_at: base, status: 'Delivered', eta: '2024-11-25', tracking_provider: 'ShipsGo' },
      { bl_number: 'HLCU201012122', client: 'Atlantic Bridge', container_number: 'HLBU2010122', carrier: 'Hapag-Lloyd', origin: 'Mohammedia', destination: 'New York', origin_port: 'Mohammedia', destination_port: 'New York', cargo_type: 'Electronics', cargo_weight: '12000', weight: '12000', cargo_value: '47000', customer_ref: 'REF020', incoterm: 'FOB', special_instructions: '', created_at: base, updated_at: base, status: 'In Transit', eta: '2024-12-20', tracking_provider: 'ShipsGo' },
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
          'booking_number',
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
    // Use container/booking as bl_number when bl_number is empty so records are findable for tracking
    const blNumber = shipmentData.bl_number || shipmentData.container_number || (shipmentData as any).booking_number || '';

    const newShipment: Shipment = {
      ...shipmentData,
      bl_number: blNumber,
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
    let index = this.shipments.findIndex((s) => s.bl_number === bl_number);
    if (index === -1) {
      index = this.shipments.findIndex((s) => s.container_number === bl_number || s.booking_number === bl_number);
    }
    if (index === -1) {
      return undefined;
    }

    const u = updates as Record<string, unknown>;
    const merged = {
      ...this.shipments[index],
      ...updates,
      carrier_name: updates.carrier_name || updates.carrier || this.shipments[index].carrier_name || this.shipments[index].carrier,
      carrier_code: updates.carrier_code || this.shipments[index].carrier_code,
      updated_at: new Date().toISOString(),
    };
    if (u.bl_number && (merged.bl_number === '' || !merged.bl_number)) {
      merged.bl_number = String(u.bl_number);
    }
    if (u.booking_number !== undefined) {
      merged.booking_number = String(u.booking_number);
    }
    this.shipments[index] = merged;
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
    if (!bl_number) return undefined;
    return (
      this.shipments.find((s) => s.bl_number === bl_number) ||
      this.shipments.find((s) => s.container_number === bl_number) ||
      this.shipments.find((s) => s.booking_number === bl_number)
    );
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
      'booking_number',
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
