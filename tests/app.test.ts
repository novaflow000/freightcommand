import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app, dataManager, trackingEngine } from '../src/app';

type Handler = (req: any, res: any, next?: any) => any;

const findHandler = (path: string, method: string): Handler => {
  const stack = (app as any)._router?.stack || [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route) continue;
    if (route.path === path) {
      const hit = route.stack.find((s: any) => s.method === method.toLowerCase());
      if (hit) return hit.handle;
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
};

const runHandler = (handler: Handler, { params = {}, body = {}, query = {} } = {}) =>
  new Promise<{ status: number; body: any }>((resolve) => {
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        resolve({ status: this.statusCode, body: payload });
      },
      send(payload: any) {
        resolve({ status: this.statusCode, body: payload });
      },
      end() {
        resolve({ status: this.statusCode, body: undefined });
      },
    };
    const req = { params, body, query };
    try {
      const maybe = handler(req, res, (err: any) =>
        resolve({ status: 500, body: { error: err?.message || String(err) } }),
      );
      if (maybe?.then) {
        (maybe as Promise<any>).catch((err) =>
          resolve({ status: 500, body: { error: err?.message || String(err) } }),
        );
      }
    } catch (err: any) {
      resolve({ status: 500, body: { error: err?.message || String(err) } });
    }
  });

describe('API Routes (handler-level, no network)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/shipments/injected', () => {
    it('should return list of shipments', async () => {
      vi.spyOn(dataManager, 'get_all_shipments').mockReturnValue([{ bl_number: 'TEST' } as any]);
      const handler = findHandler('/api/v1/shipments/injected', 'get');
      const res = await runHandler(handler);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].bl_number).toBe('TEST');
    });
  });

  describe('POST /api/v1/shipments/injected', () => {
    it('should add a shipment', async () => {
      const newShipment = { bl_number: 'NEW' };
      vi.spyOn(dataManager, 'upsert_shipment').mockReturnValue(newShipment as any);
      const handler = findHandler('/api/v1/shipments/injected', 'post');
      const res = await runHandler(handler, { body: newShipment });
      expect(res.status).toBe(201);
      expect(res.body.bl_number).toBe('NEW');
    });

    it('should return 400 on error', async () => {
      vi.spyOn(dataManager, 'upsert_shipment').mockImplementation(() => {
        throw new Error('Invalid data');
      });
      const handler = findHandler('/api/v1/shipments/injected', 'post');
      const res = await runHandler(handler, { body: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid data');
    });
  });

  describe('GET /api/v1/shipments/tracking/:bl', () => {
    it('should return tracking status', async () => {
      vi.spyOn(trackingEngine, 'get_shipment_status').mockResolvedValue({
        bl_number: 'BL123',
        tracking: { status: 'In Transit' },
      } as any);
      const handler = findHandler('/api/v1/shipments/tracking/:bl', 'get');
      const res = await runHandler(handler, { params: { bl: 'BL123' } });
      expect(res.status).toBe(200);
      expect(res.body.tracking.status).toBe('In Transit');
    });

    it('should return 404 if not found', async () => {
      vi.spyOn(trackingEngine, 'get_shipment_status').mockResolvedValue(undefined);
      const handler = findHandler('/api/v1/shipments/tracking/:bl', 'get');
      const res = await runHandler(handler, { params: { bl: 'UNKNOWN' } });
      expect(res.status).toBe(404);
    });
  });
});
