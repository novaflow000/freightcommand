import express, {Request, Response} from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {parse} from 'csv-parse/sync';
import {ShipmentDataManager} from './modules/data_manager.ts';
import {TrackingEngine} from './modules/tracking_engine.ts';
import {SettingsManager, CarrierStatusState, AdminSettings} from './modules/settings_manager.ts';
import {UserManager} from './modules/user_manager.ts';
import {ProviderRegistry, ProviderFieldMapping} from './modules/provider_registry.ts';
import {DomainEntity, TransformType} from './modules/canonical_schema.ts';
import {ProviderExecutor, normalizeProviderResponse} from './modules/provider_executor.ts';
import {ProviderRouter} from './modules/provider_router.ts';
import {canonicalDataService} from './modules/canonical_data_service.ts';
import {TrackingQueue} from './modules/tracking_queue.ts';
import {RefreshService} from './modules/refresh_service.ts';
import axios from 'axios';

// Import carrier connectors
import { HapagLloydConnector } from './modules/api_connectors/hapag_lloyd.ts';
import { MaerskConnector } from './modules/api_connectors/maersk.ts';
import { CmaCgmConnector } from './modules/api_connectors/cma_cgm.ts';

// Import tracking providers
import { normalizeCarrier } from './modules/carriers/carrier_mapping.ts';

export const app = express();
app.use(cors());
app.use(express.json({limit: '2mb'}));
app.use(express.urlencoded({extended: true}));

const upload = multer({dest: path.join(process.cwd(), 'tmp_uploads')});

// Core services
export const settingsManager = new SettingsManager();
export const dataManager = new ShipmentDataManager();
export const trackingEngine = new TrackingEngine(1800, settingsManager, dataManager, canonicalDataService);
export const userManager = new UserManager();
export const providerRegistry = new ProviderRegistry();
export const providerExecutor = new ProviderExecutor(providerRegistry);
export const providerRouter = new ProviderRouter(providerRegistry, providerExecutor);
export const trackingQueue = new TrackingQueue(providerRegistry, providerExecutor, providerRouter, dataManager);
export const refreshService = new RefreshService({ registry: providerRegistry, executor: providerExecutor, router: providerRouter, dataManager });

// Carrier validation helper
async function validateCarriers(): Promise<AdminSettings['status']> {
  const settings = settingsManager.getSettings();
  const now = new Date().toISOString();

  const hapagConnector = new HapagLloydConnector(
    settings.apiKeys.hapagLloyd.clientId,
    settings.apiKeys.hapagLloyd.clientSecret,
  );
  const maerskConnector = new MaerskConnector(
    settings.apiKeys.maersk.apiKey,
  );
  const cmaConnector = new CmaCgmConnector(
    settings.apiKeys.cmaCgm.apiKey,
  );

  const result: AdminSettings['status'] = {
    hapagLloyd: {status: 'missing'},
    maersk: {status: 'missing'},
    cmaCgm: {status: 'missing'},
    shipsGo: {status: 'missing'},
    vizion: {status: 'missing'},
    seaRates: {status: 'missing'},
    terminal49: {status: 'missing'},
  };

  const carriers: Array<{
    key: keyof typeof result;
    carrierName: string;
    run: () => Promise<any>;
    hasKeys: boolean;
  }> = [
    {
      key: 'hapagLloyd',
      carrierName: 'Hapag-Lloyd',
      run: () => hapagConnector.trackContainer('TESTHL'),
      hasKeys: Boolean(settings.apiKeys.hapagLloyd.clientId && settings.apiKeys.hapagLloyd.clientSecret),
    },
    {
      key: 'maersk',
      carrierName: 'Maersk',
      run: () => maerskConnector.trackContainer('TESTMSK'),
      hasKeys: Boolean(settings.apiKeys.maersk.apiKey),
    },
    {
      key: 'cmaCgm',
      carrierName: 'CMA CGM',
      run: () => cmaConnector.trackContainer('TESTCMA'),
      hasKeys: Boolean(settings.apiKeys.cmaCgm.apiKey),
    },
  ];

  for (const carrier of carriers) {
    if (!carrier.hasKeys) {
      result[carrier.key] = {status: 'missing', lastValidated: now, message: 'API key/secret missing'};
      continue;
    }
    try {
      const payload = await carrier.run();
      const simulated = payload?.simulated === true;
      result[carrier.key] = {
        status: simulated ? 'simulated' : 'ok',
        lastValidated: now,
        message: simulated ? 'Using simulated data (API not reachable)' : 'Credentials accepted',
      };
    } catch (err: any) {
      result[carrier.key] = {
        status: 'error',
        lastValidated: now,
        message: err?.message || 'Validation failed',
      };
    }
  }

  settingsManager.updateSettings({status: result});
  return result;
}

// --- Settings / Admin ---
app.get('/api/v1/admin/settings', (req: Request, res: Response) => {
  res.json(settingsManager.getSettings());
});

app.post('/api/v1/admin/settings', async (req: Request, res: Response) => {
  try {
    const updated = settingsManager.updateSettings(req.body);
    const status = await validateCarriers();
    res.json({...updated, status});
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to save settings'});
  }
});

app.post('/api/v1/admin/settings/validate', async (_req: Request, res: Response) => {
  try {
    const status = await validateCarriers();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({error: err?.message || 'Validation failed'});
  }
});

// User management
app.get('/api/v1/admin/users', (_req: Request, res: Response) => {
  res.json(userManager.getAllUsers());
});

app.post('/api/v1/admin/users', (req: Request, res: Response) => {
  try {
    const created = userManager.addUser(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Invalid user payload'});
  }
});

app.put('/api/v1/admin/users/:id', (req: Request, res: Response) => {
  const updated = userManager.updateUser(req.params.id, req.body);
  if (!updated) return res.status(404).json({error: 'User not found'});
  res.json(updated);
});

app.delete('/api/v1/admin/users/:id', (req: Request, res: Response) => {
  const ok = userManager.deleteUser(req.params.id);
  if (!ok) return res.status(404).json({error: 'User not found'});
  res.status(204).send();
});

// Dynamic provider registry
app.get('/api/v1/admin/providers', (_req: Request, res: Response) => {
  const providers = providerRegistry.listProviders();
  const endpoints = providerRegistry.listEndpoints();
  const coverage = providerRegistry.listCoverage();

  const normalizePath = (p: string) => p.replace(/{{(.*?)}}/g, '{$1}');

  const enriched = providers.map((p) => {
    const auth_header = p.headers
      ? Object.keys(p.headers).find((h) => h.toLowerCase() !== 'content-type')
      : undefined;
    const eps = endpoints
      .filter((e) => e.provider_id === p.id)
      .map((e) => ({
        id: e.id,
        endpoint_name: e.endpoint_name,
        method: e.method,
        path: normalizePath(e.path),
      }));
    const carrier_codes = coverage.filter((c) => c.provider_id === p.id).map((c) => c.carrier_code);
    return {
      id: p.id,
      name: p.name,
      base_url: p.base_url,
      auth_type: p.auth_type,
      auth_header,
      is_active: p.is_active,
      priority: p.priority,
      endpoints: eps,
      carrier_codes,
    };
  });

  res.json(enriched);
});

app.post('/api/v1/admin/providers', (req: Request, res: Response) => {
  try {
    const saved = providerRegistry.upsertProvider(req.body);
    providerRegistry.reloadFromDatabase();
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to save provider'});
  }
});

app.put('/api/v1/admin/providers/:id', (req: Request, res: Response) => {
  try {
    const saved = providerRegistry.upsertProvider({...req.body, id: req.params.id});
    providerRegistry.reloadFromDatabase();
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to update provider'});
  }
});

app.delete('/api/v1/admin/providers/:id', (req: Request, res: Response) => {
  providerRegistry.deleteProvider(req.params.id);
  providerRegistry.reloadFromDatabase();
  res.status(204).send();
});

// Provider test connection
app.post('/api/v1/admin/providers/:id/test', async (req: Request, res: Response) => {
  try {
    const provider = providerRegistry.listProviders().find((p) => p.id === req.params.id);
    if (!provider) return res.status(404).json({error: 'Provider not found'});
    const headersTpl = provider.headers || {};
    const vars = {
      API_KEY: provider.api_key,
      api_key: provider.api_key,
      CLIENT_ID: provider.client_id,
      CLIENT_SECRET: provider.client_secret,
    };
    const interpolate = (template: any) =>
      typeof template === 'string'
        ? template.replace(/{{\s*([\w\.]+)\s*}}/g, (_m, k) => (vars as any)[k] ?? '')
        : template;
    const resolvedHeaders = Object.fromEntries(
      Object.entries(headersTpl).map(([k, v]) => [k, interpolate(v as any)]),
    );
    const start = Date.now();
    await axios.get(provider.base_url, {headers: resolvedHeaders, timeout: 8000});
    const latency = Date.now() - start;
    providerRegistry.upsertHealth({
      provider_id: provider.id,
      success_rate: 1,
      avg_latency_ms: latency,
      last_checked_at: new Date().toISOString(),
    });
    res.json({status: 'OK', latency: `${latency}ms`, auth: 'valid'});
  } catch (err: any) {
    const latency = err?.response?.duration || 0;
    res.status(500).json({status: 'ERROR', latency: `${latency}ms`, message: err?.message});
  }
});

// Provider endpoints
app.get('/api/v1/admin/provider-endpoints', (req: Request, res: Response) => {
  res.json(providerRegistry.listEndpoints(req.query.provider_id as string | undefined));
});

app.post('/api/v1/admin/provider-endpoints', (req: Request, res: Response) => {
  try {
    const saved = providerRegistry.upsertEndpoint(req.body);
    providerRegistry.reloadFromDatabase();
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to save endpoint'});
  }
});

app.put('/api/v1/admin/provider-endpoints/:id', (req: Request, res: Response) => {
  try {
    const saved = providerRegistry.upsertEndpoint({...req.body, id: req.params.id});
    providerRegistry.reloadFromDatabase();
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to update endpoint'});
  }
});

app.delete('/api/v1/admin/provider-endpoints/:id', (req: Request, res: Response) => {
  providerRegistry.deleteEndpoint(req.params.id);
  providerRegistry.reloadFromDatabase();
  res.status(204).send();
});

// Test a provider endpoint with sample variables
app.post('/admin/endpoints/:id/test', async (req: Request, res: Response) => {
  const endpoint = providerRegistry.listEndpoints().find((e) => e.id === req.params.id);
  if (!endpoint) return res.status(404).json({error: 'Endpoint not found'});
  const provider = providerRegistry.listProviders().find((p) => p.id === endpoint.provider_id);
  if (!provider) return res.status(404).json({error: 'Provider not found'});

  const vars = req.body?.variables || {};
  const replacements = {
    ...vars,
    API_KEY: provider.api_key,
    CLIENT_ID: provider.client_id,
    CLIENT_SECRET: provider.client_secret,
    api_key: provider.api_key,
    client_id: provider.client_id,
    client_secret: provider.client_secret,
  };

  const interpolate = (template: any): any => {
    if (typeof template === 'string') {
      return template.replace(/{{\s*([\w\.]+)\s*}}/g, (_, key) => replacements[key] ?? '');
    }
    if (Array.isArray(template)) return template.map((t) => interpolate(t));
    if (template && typeof template === 'object') {
      const out: any = {};
      Object.entries(template).forEach(([k, v]) => (out[k] = interpolate(v)));
      return out;
    }
    return template;
  };

  const body = interpolate(endpoint.body_template || {});
  const query = interpolate(endpoint.query_params_json || {});
  const url = provider.base_url.replace(/\/$/, '') + endpoint.path.replace(/{{\s*([\w\.]+)\s*}}/g, (_: string, key: string) => replacements[key] ?? '');
  const headersTemplateRaw = provider.headers || (provider as any).headers_json || {};
  const headersTemplate = typeof headersTemplateRaw === 'string' ? JSON.parse(headersTemplateRaw) : headersTemplateRaw;
  const headers = interpolate(headersTemplate);

  if (provider.auth_type === 'BEARER_TOKEN' && provider.api_key) {
    headers['Authorization'] = headers['Authorization'] || `Bearer ${provider.api_key}`;
  } else if (provider.auth_type === 'API_KEY' && provider.api_key && !headers['x-api-key']) {
    headers['x-api-key'] = provider.api_key;
  }

  const axios = (await import('axios')).default;
  const start = Date.now();
  const maskHeaders = (h: any) => {
    const m = {...h};
    if (m.Authorization) m.Authorization = '***';
    if (m['x-api-key']) m['x-api-key'] = '***';
    if (m['X-Shipsgo-User-Token']) m['X-Shipsgo-User-Token'] = '***';
    Object.keys(m).forEach((k) => {
      if (typeof m[k] === 'string' && provider.api_key && (m[k] as string).includes(provider.api_key)) m[k] = (m[k] as string).replace(provider.api_key, '***');
    });
    return m;
  };
  const maskedHeaders = maskHeaders(headers);

  const logEntry: any = {
    provider_id: provider.id,
    endpoint_id: endpoint.id,
    request_url: url,
    request_headers: maskedHeaders,
    request_body: body,
    created_at: new Date().toISOString(),
  };

  try {
    const response = await axios.request({
      url,
      method: endpoint.method,
      headers,
      data: ['GET','DELETE'].includes(endpoint.method) ? undefined : body,
      params: query,
      timeout: 15000,
    });
    const latency = Date.now() - start;
    logEntry.response_status = response.status;
    logEntry.response_body = response.data;
    logEntry.latency = latency;
    providerRegistry.pushApiLog(logEntry);
    res.json({
      status: response.status,
      latency_ms: latency,
      response_headers: response.headers,
      body: response.data,
      request: { method: endpoint.method, url, headers: maskedHeaders, body },
      resolved_template: body,
    });
  } catch (err: any) {
    const latency = Date.now() - start;
    logEntry.response_status = err?.response?.status || 500;
    logEntry.response_body = err?.response?.data || err?.message;
    logEntry.latency = latency;
    providerRegistry.pushApiLog(logEntry);
    res.status(err?.response?.status || 500).json({
      status: err?.response?.status || 500,
      latency_ms: latency,
      error: err?.message,
      body: err?.response?.data,
      request: { method: endpoint.method, url, headers: maskedHeaders, body },
      resolved_template: body,
    });
  }
});

// Endpoint logs (last 20)
app.get('/admin/endpoints/:id/logs', (req: Request, res: Response) => {
  const logs = providerRegistry.getApiLogs(req.params.id).slice(-20).reverse();
  res.json(logs);
});

// Auto-generate mappings from last successful log
app.post('/admin/endpoints/:id/auto-mappings', (req: Request, res: Response) => {
  const endpointId = req.params.id;
  const endpoint = providerRegistry.listEndpoints().find((e) => e.id === endpointId);
  if (!endpoint) return res.status(404).json({error: 'Endpoint not found'});
  const providerId = endpoint.provider_id;
  const logs = providerRegistry.getApiLogs(endpointId).filter((l) => (l.response_status || 0) < 400);
  if (logs.length === 0) return res.status(400).json({error: 'No successful responses to inspect'});
  const latest = logs[logs.length - 1].response_body;

  const flatten = (obj: any, prefix = ''): string[] => {
    if (obj === null || obj === undefined) return [];
    if (Array.isArray(obj)) {
      const arrPaths: string[] = [];
      obj.forEach((item) => {
        arrPaths.push(...flatten(item, `${prefix}[]`));
      });
      return arrPaths.length ? arrPaths : [`${prefix}[]`];
    }
    if (typeof obj !== 'object') return [prefix.replace(/^\./, '')];
    let paths: string[] = [];
    Object.entries(obj).forEach(([k, v]) => {
      paths = paths.concat(flatten(v, `${prefix}${prefix ? '.' : ''}${k}`));
    });
    return paths;
  };

  const externalFields = Array.from(new Set(flatten(latest)));
  const existing = providerRegistry.listMappings(providerId).map((m) => m.external_field);

  const snake = (s: string) =>
    s.replace(/\[\]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();

  const derive = (field: string): { internal: string; domain: DomainEntity; transformation?: TransformType } => {
    const lower = field.toLowerCase();

    // Shipment level
    if (lower === 'shipment.id') return { internal: 'shipment_id', domain: 'Shipment' };
    if (lower.includes('booking')) return { internal: 'booking_number', domain: 'Shipment' };
    if (lower.includes('container_count')) return { internal: 'container_count', domain: 'Shipment', transformation: 'number' };
    if (lower.includes('shipment.status')) return { internal: 'shipment_status', domain: 'Shipment' };
    if (lower.includes('shipment.message')) return { internal: 'shipment_message', domain: 'Shipment' };
    if (lower.includes('checked_at')) return { internal: 'checked_at', domain: 'Shipment', transformation: 'date' };
    if (lower.includes('created_at')) return { internal: 'created_at', domain: 'Shipment', transformation: 'date' });
    if (lower.includes('updated_at')) return { internal: 'updated_at', domain: 'Shipment', transformation: 'date' };

    // Carrier
    if (lower.includes('carrier') && lower.includes('scac') || lower.includes('carrier.code')) return { internal: 'carrier_code', domain: 'Carrier' };
    if (lower.includes('carrier') && lower.includes('name')) return { internal: 'carrier_name', domain: 'Carrier' };

    // Route
    if (lower.includes('port_of_loading')) {
      if (lower.includes('country.code')) return { internal: 'origin_country_code', domain: 'Route' };
      if (lower.includes('country.name')) return { internal: 'origin_country_name', domain: 'Route' };
      if (lower.includes('timezone')) return { internal: 'origin_timezone', domain: 'Route' };
      if (lower.includes('code')) return { internal: 'origin_port_code', domain: 'Route' };
      if (lower.includes('name')) return { internal: 'origin_port_name', domain: 'Route' };
      if (lower.includes('date_of_loading_initial')) return { internal: 'departure_time_initial', domain: 'Route', transformation: 'date' };
      if (lower.includes('date_of_loading')) return { internal: 'departure_time', domain: 'Route', transformation: 'date' };
    }
    if (lower.includes('port_of_discharge')) {
      if (lower.includes('country.code')) return { internal: 'destination_country_code', domain: 'Route' };
      if (lower.includes('country.name')) return { internal: 'destination_country_name', domain: 'Route' };
      if (lower.includes('timezone')) return { internal: 'destination_timezone', domain: 'Route' };
      if (lower.includes('code')) return { internal: 'destination_port_code', domain: 'Route' };
      if (lower.includes('name')) return { internal: 'destination_port_name', domain: 'Route' };
      if (lower.includes('date_of_discharge_initial')) return { internal: 'eta_initial', domain: 'Route', transformation: 'date' };
      if (lower.includes('date_of_discharge')) return { internal: 'eta', domain: 'Route', transformation: 'date' };
    }
    if (lower.includes('ts_count') || lower.includes('transshipment')) return { internal: 'transshipment_count', domain: 'Route', transformation: 'number' };
    if (lower.includes('transit_time')) return { internal: 'transit_time_days', domain: 'Route', transformation: 'number' };
    if (lower.includes('transit_percentage') || lower.includes('progress')) return { internal: 'transit_progress_percent', domain: 'Route', transformation: 'number' };
    if (lower.includes('co2')) return { internal: 'co2_emission', domain: 'Route', transformation: 'number' };
    if (lower.includes('eta')) return { internal: 'eta', domain: 'Route', transformation: 'date' };

    // Containers & events
    if (lower.includes('containers') && lower.includes('movements')) {
      if (lower.includes('event')) return { internal: 'event_type', domain: 'Event' };
      if (lower.includes('status')) return { internal: 'event_status', domain: 'Event' };
      if (lower.includes('timestamp') || lower.includes('time')) return { internal: 'event_timestamp', domain: 'Event', transformation: 'date' };
      if (lower.includes('location.name')) return { internal: 'event_location_name', domain: 'Event' };
      if (lower.includes('location.code')) return { internal: 'event_location_code', domain: 'Event' };
      if (lower.includes('country.code')) return { internal: 'event_country_code', domain: 'Event' };
      if (lower.includes('country.name')) return { internal: 'event_country_name', domain: 'Event' };
      if (lower.includes('timezone')) return { internal: 'event_timezone', domain: 'Event' };
      if (lower.includes('vessel.name')) return { internal: 'vessel_name', domain: 'Vessel' };
      if (lower.includes('vessel.imo')) return { internal: 'vessel_imo', domain: 'Vessel' };
      if (lower.includes('voyage')) return { internal: 'voyage_number', domain: 'Vessel' };
    }
    if (lower.includes('containers')) {
      if (lower.includes('number')) return { internal: 'container_number', domain: 'Container' };
      if (lower.includes('status')) return { internal: 'container_status', domain: 'Container' };
      if (lower.includes('size')) return { internal: 'container_size', domain: 'Container' };
      if (lower.includes('type')) return { internal: 'container_type', domain: 'Container' };
    }

    // GeoJSON route geometry
    if (lower.includes('geojson') || lower.includes('geometry') || lower.includes('features')) {
      if (lower.includes('geometry.type')) return { internal: 'route_geometry_type', domain: 'RouteGeometry' };
      if (lower.includes('geometry.coordinates')) return { internal: 'route_coordinates', domain: 'RouteGeometry', transformation: 'geojson' };
      if (lower.includes('current.index')) return { internal: 'current_position_index', domain: 'RouteGeometry', transformation: 'number' };
      if (lower.includes('current.coordinates')) return { internal: 'current_coordinates', domain: 'RouteGeometry', transformation: 'geojson' };
      if (lower.includes('events')) {
        if (lower.includes('timestamp')) return { internal: 'event_timestamp', domain: 'Event', transformation: 'date' };
        if (lower.includes('location.name')) return { internal: 'event_location_name', domain: 'Event' };
        if (lower.includes('location.code')) return { internal: 'event_location_code', domain: 'Event' };
        if (lower.includes('country.code')) return { internal: 'event_country_code', domain: 'Event' };
        if (lower.includes('country.name')) return { internal: 'event_country_name', domain: 'Event' };
        if (lower.includes('timezone')) return { internal: 'event_timezone', domain: 'Event' };
      }
      if (lower.includes('vessel.name')) return { internal: 'vessel_name', domain: 'Vessel' };
      if (lower.includes('vessel.imo')) return { internal: 'vessel_imo', domain: 'Vessel' };
      if (lower.includes('voyage')) return { internal: 'voyage_number', domain: 'Vessel' };
    }

    // Metadata
    if (lower.includes('tokens.map')) return { internal: 'map_token', domain: 'Metadata' };
    if (lower.includes('followers')) return { internal: 'shipment_followers', domain: 'Metadata', transformation: 'array' };
    if (lower.includes('tags')) return { internal: 'shipment_tags', domain: 'Metadata', transformation: 'array' };
    if (lower.includes('creator.name')) return { internal: 'created_by_name', domain: 'Metadata' };
    if (lower.includes('creator.email')) return { internal: 'created_by_email', domain: 'Metadata' };

    // fallback
    return { internal: snake(field), domain: 'Shipment' };
  };

  const created: ProviderFieldMapping[] = [];
  externalFields.forEach((field) => {
    if (!field || existing.includes(field)) return;
    const suggestion = derive(field);
    const is_array = field.includes('[]');
    const transformation =
      suggestion.transformation ||
      (/(timestamp|date|time|eta)/i.test(field) ? 'date' : undefined) ||
      (/(coordinate|geojson)/i.test(field) ? 'geojson' : undefined) ||
      (/(count|percentage|index|size)/i.test(field) ? 'number' : undefined);

    // ensure internal field exists
    providerRegistry.ensureInternalField(suggestion.internal, suggestion.domain, transformation || 'string');
    const map = providerRegistry.upsertMapping({
      provider_id: providerId,
      endpoint_id: endpointId,
      external_field: field,
      internal_field: suggestion.internal,
      domain_entity: suggestion.domain,
      is_array,
      transformation,
    });
    created.push(map);
  });

  res.json({created: created.length, mappings: created});
});

// Field mappings
app.get('/api/v1/admin/provider-mappings', (req: Request, res: Response) => {
  res.json(providerRegistry.listMappings(req.query.provider_id as string | undefined));
});

app.post('/api/v1/admin/provider-mappings', (req: Request, res: Response) => {
  try {
    const saved = providerRegistry.upsertMapping(req.body);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to save mapping'});
  }
});

app.put('/api/v1/admin/provider-mappings/:id', (req: Request, res: Response) => {
  try {
    const saved = providerRegistry.upsertMapping({...req.body, id: req.params.id});
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Unable to update mapping'});
  }
});

app.delete('/api/v1/admin/provider-mappings/:id', (req: Request, res: Response) => {
  providerRegistry.deleteMapping(req.params.id);
  res.status(204).send();
});

// Bulk delete mappings by provider + optional contains filter
app.post('/api/v1/admin/provider-mappings/bulk-delete', (req: Request, res: Response) => {
  const {provider_id, contains} = req.body || {};
  if (!provider_id) return res.status(400).json({error: 'provider_id is required'});
  providerRegistry.bulkDeleteMappings(provider_id, {contains});
  res.json({message: 'Deleted mappings', provider_id, contains: contains || null});
});

app.post('/api/v1/admin/provider-mappings/delete-ids', (req: Request, res: Response) => {
  const {ids} = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({error: 'ids array required'});
  providerRegistry.deleteMappingsByIds(ids);
  res.json({message: 'Deleted mappings', count: ids.length});
});

// Capabilities
app.get('/api/v1/admin/provider-capabilities', (req: Request, res: Response) => {
  res.json(providerRegistry.listCapabilities(req.query.provider_id as string | undefined));
});

app.post('/api/v1/admin/provider-capabilities', (req: Request, res: Response) => {
  const saved = providerRegistry.upsertCapability(req.body);
  res.status(201).json(saved);
});

app.delete('/api/v1/admin/provider-capabilities/:id', (req: Request, res: Response) => {
  providerRegistry.deleteCapability(req.params.id);
  res.status(204).send();
});

// Coverage
app.get('/api/v1/admin/provider-coverage', (req: Request, res: Response) => {
  res.json(providerRegistry.listCoverage(req.query.provider_id as string | undefined));
});

app.post('/api/v1/admin/provider-coverage', (req: Request, res: Response) => {
  const saved = providerRegistry.upsertCoverage(req.body);
  providerRegistry.reloadFromDatabase();
  res.status(201).json(saved);
});

app.delete('/api/v1/admin/provider-coverage/:id', (req: Request, res: Response) => {
  providerRegistry.deleteCoverage(req.params.id);
  providerRegistry.reloadFromDatabase();
  res.status(204).send();
});

// Health
app.get('/api/v1/admin/provider-health', (_req: Request, res: Response) => {
  res.json(providerRegistry.listHealth());
});

app.post('/api/v1/admin/provider-health', (req: Request, res: Response) => {
  const saved = providerRegistry.upsertHealth(req.body);
  res.status(201).json(saved);
});

// Endpoint tester + mapping suggestions
const flattenJson = (obj: any, prefix = '', out: Record<string, any> = {}) => {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flattenJson(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof obj === 'object') {
    Object.entries(obj).forEach(([k, v]) => flattenJson(v, prefix ? `${prefix}.${k}` : k, out));
    return out;
  }
  out[prefix] = obj;
  return out;
};

const suggestMappings = (payload: any, registry: typeof providerRegistry) => {
  const flat = flattenJson(payload);
  const internal = registry.listInternalFields();
  const suggestions: Array<{external_field: string; internal_field: string; score: number}> = [];
  Object.keys(flat).forEach((ext) => {
    internal.forEach((i) => {
      const score = i.name && ext.toLowerCase().includes(i.name.toLowerCase()) ? i.name.length / ext.length : 0;
      if (score > 0.35) suggestions.push({external_field: ext, internal_field: i.name, score});
    });
  });
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 20);
};

app.post('/api/v1/admin/provider-endpoints/:id/test', async (req: Request, res: Response) => {
  try {
    const endpoint = providerRegistry.listEndpoints().find((e) => e.id === req.params.id);
    if (!endpoint) return res.status(404).json({error: 'Endpoint not found'});
    const payload = await providerExecutor.executeProviderRequest(endpoint.provider_id, endpoint.endpoint_name, req.body || {});
    const suggestions = suggestMappings(payload, providerRegistry);
    res.json({payload, suggestions});
  } catch (err: any) {
    res.status(500).json({error: err?.message || 'Test failed'});
  }
});

// Internal fields for dropdowns
app.get('/internal-fields', (_req: Request, res: Response) => {
  res.json(providerRegistry.listInternalFields());
});

// Config/health for carriers (used by admin dashboard badges)
app.get('/api/v1/config/carriers', async (_req: Request, res: Response) => {
  const status = await validateCarriers();
  res.json({
    'Hapag-Lloyd': status.hapagLloyd.status === 'ok',
    'Maersk': status.maersk.status === 'ok',
    'CMA CGM': status.cmaCgm.status === 'ok',
  });
});

// --- Shipment injection & management ---
app.get('/api/v1/shipments/injected', (_req: Request, res: Response) => {
  res.json(dataManager.get_all_shipments());
});

app.post('/api/v1/shipments/injected', (req: Request, res: Response) => {
  try {
    const carrier_name = (req.body as any).carrier;
    const carrier_code = normalizeCarrier(carrier_name);
    const created = dataManager.upsert_shipment({
      ...req.body,
      carrier: carrier_name,
      carrier_name,
      carrier_code,
    });
    canonicalDataService.upsertInjected({
      id: created.bl_number || created.booking_number || created.container_number,
      bl_number: created.bl_number,
      container_number: created.container_number,
      booking_number: (req.body as any).booking_number,
      carrier: created.carrier,
      client: created.client,
      origin: created.origin_port,
      destination: created.destination_port,
    });
    // enqueue background tracking job
    trackingQueue.enqueue({
      bl_number: created.bl_number,
      container_number: created.container_number,
      booking_number: (req.body as any).booking_number,
      carrier: carrier_code,
      carrier_name,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({error: err?.message || 'Invalid payload'});
  }
});

app.put('/api/v1/shipments/injected/:bl', (req: Request, res: Response) => {
  const updated = dataManager.update_shipment(req.params.bl, req.body);
  if (!updated) return res.status(404).json({error: 'Shipment not found'});
  res.json(updated);
});

app.delete('/api/v1/shipments/injected/:bl', (req: Request, res: Response) => {
  const ok = dataManager.delete_shipment(req.params.bl);
  if (!ok) return res.status(404).json({error: 'Shipment not found'});
  res.status(204).send();
});

app.get('/api/v1/shipments/injected/template', (_req: Request, res: Response) => {
  const csv = dataManager.export_template();
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

app.post('/api/v1/shipments/injected/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({error: 'No file uploaded'});
  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const records = parse(content, {columns: true, skip_empty_lines: true});
    let success = 0;
    let failed = 0;
    records.forEach((row: any) => {
      try {
        const carrier_name = row.carrier;
        const carrier_code = normalizeCarrier(carrier_name);
        const created = dataManager.upsert_shipment({...row, carrier: carrier_name, carrier_name, carrier_code, status: 'Tracking Requested'} as any);
        canonicalDataService.upsertInjected({
          id: created.bl_number || created.booking_number || created.container_number,
          bl_number: created.bl_number,
          container_number: created.container_number,
          booking_number: created.booking_number,
          carrier: created.carrier,
          client: created.client,
          origin: created.origin_port,
          destination: created.destination_port,
        });
        trackingQueue.enqueue({
          bl_number: created.bl_number,
          container_number: created.container_number,
          booking_number: created.booking_number,
          carrier: carrier_code,
          carrier_name,
        });
        success += 1;
      } catch (_e) {
        failed += 1;
      }
    });
    res.json({stats: {success, failed}});
  } catch (err: any) {
    res.status(500).json({error: err?.message || 'Upload failed'});
  } finally {
    fs.rmSync(req.file.path, {force: true});
  }
});

// Bulk JSON import (from client-side parsed CSV/XLSX)
app.post('/api/v1/shipments/injected/bulk-json', (req: Request, res: Response) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({error: 'rows array required'});
  let success = 0;
  let failed = 0;
  const errors: any[] = [];
  rows.forEach((row, idx) => {
    try {
      const carrier_name = row.carrier;
      const carrier_code = normalizeCarrier(carrier_name);
      const created = dataManager.upsert_shipment({
        bl_number: row.bl_number,
        booking_number: row.booking_number,
        container_number: row.container_number,
        carrier: carrier_name,
        carrier_name,
        carrier_code,
        origin_port: row.origin_port,
        destination_port: row.destination_port,
        client: row.client,
        cargo_type: row.cargo_type,
        weight: row.weight,
        status: 'Tracking Requested',
      } as any);
      canonicalDataService.upsertInjected({
        id: created.bl_number || created.booking_number || created.container_number,
        bl_number: created.bl_number,
        container_number: created.container_number,
        booking_number: created.booking_number,
        carrier: created.carrier,
        client: created.client,
        origin: created.origin_port,
        destination: created.destination_port,
      });
      trackingQueue.enqueue({
        bl_number: created.bl_number,
        container_number: created.container_number,
        booking_number: created.booking_number,
        carrier: carrier_code,
        carrier_name,
      });
      success += 1;
    } catch (err: any) {
      failed += 1;
      errors.push({row: idx + 1, error: err?.message});
    }
  });
  res.json({stats: {success, failed}, errors});
});

// --- Tracking & analytics ---
app.get('/api/v1/shipments/tracking', async (_req: Request, res: Response) => {
  const data = canonicalDataService.getLegacyShipments();
  res.json(data);
});

app.get('/api/v1/shipments/tracking/:bl', async (req: Request, res: Response) => {
  const data = await trackingEngine.get_shipment_status(req.params.bl);
  if (!data) return res.status(404).json({error: 'Not found'});
  res.json(data);
});

// Shipment refresh / re-sync
const isValidMode = (m: any): m is 'reapply' | 'api' | 'full' => ['reapply', 'api', 'full'].includes(m);

app.post('/api/v1/shipments/:id/refresh', (req: Request, res: Response) => {
  const mode = req.body?.mode;
  if (!isValidMode(mode)) return res.status(400).json({error: 'mode must be reapply|api|full'});
  const jobs = refreshService.enqueue([req.params.id], mode);
  res.json({job_id: jobs[0].id, status: jobs[0].status});
});

app.post('/api/v1/shipments/refresh', (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.shipment_ids) ? req.body.shipment_ids : [];
  const mode = req.body?.mode;
  if (!ids.length) return res.status(400).json({error: 'shipment_ids array required'});
  if (!isValidMode(mode)) return res.status(400).json({error: 'mode must be reapply|api|full'});
  const jobs = refreshService.enqueue(ids, mode);
  res.json({job_ids: jobs.map((j) => j.id), status: 'queued'});
});

app.get('/api/v1/refresh-jobs/:id', (req: Request, res: Response) => {
  const job = refreshService.getJob(req.params.id);
  if (!job) return res.status(404).json({error: 'Job not found'});
  res.json(job);
});

app.post('/api/v1/shipments/tracking/batch', async (_req: Request, res: Response) => {
  await trackingEngine.update_all_shipments();
  res.json({message: 'Batch tracking refresh triggered'});
});

app.get('/api/v1/analytics/performance', (_req: Request, res: Response) => {
  try {
    const snapshot = canonicalDataService.getAnalytics();
    const shipments = dataManager.get_all_shipments();
    const totalValue = shipments.reduce((sum, s) => sum + Number(s.cargo_value || 0), 0);
    const onTimeRate =
      snapshot.total === 0 ? 0 : Math.round(((snapshot.delivered || 0) / snapshot.total) * 100);
    res.json({
      total: snapshot.total,
      in_transit: snapshot.active,
      arrived: snapshot.delivered,
      delayed: snapshot.delayed,
      exceptions: snapshot.delayed,
      last_updated: snapshot.last_updated,
      total_value: totalValue,
      performance: onTimeRate,
      average_transit_time: 22,
      on_time_delivery_rate: onTimeRate,
      delay_reasons: {Weather: 4, Congestion: 3, Customs: 2},
    });
  } catch (err: any) {
    res.status(500).json({error: err?.message || 'Analytics failed'});
  }
});

app.get('/api/v1/analytics/dashboard', (_req: Request, res: Response) => {
  const snapshot = canonicalDataService.getAnalytics();
  res.json({
    total: snapshot.total,
    in_transit: snapshot.active,
    delivered: snapshot.delivered,
    delayed: snapshot.delayed,
    performance: snapshot.total === 0 ? 0 : Math.round(((snapshot.delivered || 0) / snapshot.total) * 100),
  });
});

// Canonical data access layer
app.get('/api/v1/canonical/shipments', (req: Request, res: Response) => {
  const {provider, carrier, status, origin, destination, container, booking} = req.query;
  const rows = canonicalDataService.listCanonical({
    provider: provider as string,
    carrier: carrier as string,
    status: status as string,
    origin: origin as string,
    destination: destination as string,
    container: container as string,
    booking: booking as string,
  });
  res.json(rows);
});

app.get('/api/v1/canonical/analytics', (_req: Request, res: Response) => {
  res.json(canonicalDataService.getAnalytics());
});

app.get('/api/v1/canonical/search', (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  res.json(canonicalDataService.search(q));
});

app.get('/api/v1/canonical/alerts', (_req: Request, res: Response) => {
  res.json(canonicalDataService.alerts());
});

// Simple reports feed derived from shipments for UI demo
app.get('/api/v1/reports', (_req: Request, res: Response) => {
  const shipments = canonicalDataService.getLegacyShipments();
  const reports = shipments.slice(0, 10).map((s, idx) => ({
    id: idx + 1,
    name: `${s.carrier || 'Carrier'} – ${s.bl_number}`,
    date: new Date().toISOString().slice(0, 10),
    type: 'CSV',
    size: `${(5 + idx).toFixed(1)} MB`,
  }));
  res.json(reports);
});

app.get('/api/v1/export/csv', (_req: Request, res: Response) => {
  try {
    const data = canonicalDataService.getLegacyShipments();
    const header = Object.keys(data[0] || {}).join(',');
    const lines = data.map((row: any) => Object.values(row).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.send([header, ...lines].join('\n'));
  } catch (err: any) {
    res.status(500).json({error: err?.message || 'Export failed'});
  }
});

// Add simple redirect endpoints for common paths
app.get('/providers', (_req: Request, res: Response) => {
  res.redirect('/api/v1/admin/providers');
});

app.get('/shipments', (_req: Request, res: Response) => {
  res.redirect('/api/v1/shipments/injected');

// Add root endpoint for basic server testing
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Freight Command API Server',
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0',
    endpoints: {
      api: '/api',
      providers: '/api/v1/admin/providers',
      shipments: '/api/v1/shipments/injected',
      analytics: '/api/v1/analytics/dashboard'
    }
  });
});

// Add simple test endpoints for verification
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'API Root Endpoint',
    version: '1.0',
    documentation: '/api/docs',
    endpoints: [
      '/api/v1/admin/*',
      '/api/v1/shipments/*',
      '/api/v1/analytics/*',
      '/api/v1/canonical/*'
    ]
  });
});

// --- Static frontend (Vite build) ---
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  // Serve SPA index for any non-API route (React Router).
  // But exclude specific API routes that should not be handled by SPA
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}
