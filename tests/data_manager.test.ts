import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShipmentDataManager } from '../src/modules/data_manager';
import fs from 'fs';
import path from 'path';

const TEST_CSV_PATH = path.join(__dirname, 'test_shipments.csv');

describe('ShipmentDataManager', () => {
  let dataManager: ShipmentDataManager;

  beforeEach(() => {
    if (fs.existsSync(TEST_CSV_PATH)) {
      fs.unlinkSync(TEST_CSV_PATH);
    }
    // Initialize with a fresh path
    dataManager = new ShipmentDataManager(TEST_CSV_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_CSV_PATH)) {
      fs.unlinkSync(TEST_CSV_PATH);
    }
  });

  it('should create sample data if file does not exist', () => {
    // Constructor already called in beforeEach
    expect(fs.existsSync(TEST_CSV_PATH)).toBe(true);
    const shipments = dataManager.get_all_shipments();
    expect(shipments.length).toBeGreaterThan(0);
  });

  it('should add a new shipment', () => {
    const newShipment = {
      bl_number: 'TEST123456',
      client: 'Test Client',
      container_number: 'CONT123456',
      carrier: 'Test Carrier',
      origin: 'Origin',
      destination: 'Dest',
      cargo_type: 'Type',
      cargo_weight: '100',
      cargo_value: '1000',
      customer_ref: 'REF',
      incoterm: 'FOB',
      special_instructions: 'None'
    };
    
    dataManager.add_shipment(newShipment);
    const retrieved = dataManager.get_shipment_by_bl('TEST123456');
    expect(retrieved).toBeDefined();
    expect(retrieved?.client).toBe('Test Client');
  });

  it('should update an existing shipment', () => {
    const newShipment = {
      bl_number: 'TEST_UPDATE',
      client: 'Old Client',
      container_number: 'CONT_UPDATE',
      carrier: 'Carrier',
      origin: 'A',
      destination: 'B',
      cargo_type: 'T',
      cargo_weight: '1',
      cargo_value: '1',
      customer_ref: 'R',
      incoterm: 'I',
      special_instructions: 'S'
    };
    dataManager.add_shipment(newShipment);

    dataManager.update_shipment('TEST_UPDATE', { client: 'New Client' });
    const updated = dataManager.get_shipment_by_bl('TEST_UPDATE');
    expect(updated?.client).toBe('New Client');
  });

  it('should validate required fields', () => {
    expect(() => {
      // @ts-ignore - Testing runtime validation
      dataManager.add_shipment({ bl_number: 'MISSING_FIELDS' });
    }).toThrow('Missing required field');
  });
});
