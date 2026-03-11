import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrackingEngine } from '../src/modules/tracking_engine';
import { DataFusionEngine } from '../src/modules/data_fusion';

// Mock DataFusionEngine
vi.mock('../src/modules/data_fusion', () => {
  return {
    DataFusionEngine: vi.fn().mockImplementation(function() {
      return {
        fuseShipment: vi.fn((bl) => {
          if (bl === 'BL123') {
            return {
              bl_number: 'BL123',
              tracking: { status: 'In Transit', eta: '2023-01-01' },
              sources: { api_status: 'success' }
            };
          }
          throw new Error('Not found');
        })
      };
    })
  };
});

describe('TrackingEngine', () => {
  let engine: TrackingEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TrackingEngine(1); // 1 second interval
  });

  afterEach(() => {
    engine.stop_tracking();
  });

  it('should start and stop tracking loop', async () => {
    // This is hard to test without mocking setTimeout or using fake timers.
    // We can test if the loop runs by checking if update_all_shipments is called.
    // But update_all_shipments is public, so we can spy on it.
    
    const spy = vi.spyOn(engine, 'update_all_shipments').mockResolvedValue();
    engine.start_tracking();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(spy).toHaveBeenCalled();
    
    engine.stop_tracking();
  });

  it('should get shipment status from cache or fetch', async () => {
    const status = await engine.get_shipment_status('BL123');
    expect(status).toBeDefined();
    expect(status?.tracking.status).toBe('In Transit');
  });

  it('should return undefined for unknown shipment', async () => {
    const status = await engine.get_shipment_status('UNKNOWN');
    expect(status).toBeUndefined();
  });

  it('should calculate statistics correctly', async () => {
    // We need to populate the internal map.
    // Since latestData is private, we can populate it by calling get_shipment_status or update_all_shipments.
    await engine.get_shipment_status('BL123');
    
    const stats = engine.get_statistics();
    expect(stats.total).toBe(1);
    expect(stats.in_transit).toBe(1);
    expect(stats.arrived).toBe(0);
  });
});
