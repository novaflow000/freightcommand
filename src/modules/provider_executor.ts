import axios, { AxiosRequestConfig } from 'axios';
import { ProviderRegistry, ProviderRecord, ProviderEndpoint } from './provider_registry.ts';

/**
 * Generic data mapping engine that applies Admin-defined mappings to any
 * provider/endpoint response. This is the single source of truth for
 * translating external payloads into the canonical schema.
 */
export class DataMappingEngine {
  private registry: ProviderRegistry;

  constructor(registry?: ProviderRegistry) {
    this.registry = registry || new ProviderRegistry();
  }

  private splitPath(path: string): string[] {
    const raw = path.split('.');
    const expanded: string[] = [];
    raw.forEach((segment) => {
      let s = segment;
      while (s.endsWith('[]')) {
        const base = s.replace(/\[\]+$/, '');
        if (base) expanded.push(base);
        expanded.push('[]');
        s = s.slice(0, -2);
        if (!s.endsWith('[]')) break;
      }
      if (segment.includes('[][]') && !segment.endsWith('[]')) return;
      if (!segment.endsWith('[]') && segment !== '[]' && !segment.includes('[][]')) expanded.push(segment);
    });
    return expanded.filter(Boolean);
  }

  private collectMatches(obj: any, segments: string[], indexes: number[] = []): Array<{ value: any; indexes: number[] }> {
    if (segments.length === 0) return [{ value: obj, indexes }];
    if (obj === undefined || obj === null) return [];
    const [head, ...rest] = segments;
    if (head === '[]') {
      if (!Array.isArray(obj)) return [];
      const results: Array<{ value: any; indexes: number[] }> = [];
      obj.forEach((item, idx) => {
        results.push(...this.collectMatches(item, rest, [...indexes, idx]));
      });
      return results;
    }
    return this.collectMatches(obj[head], rest, indexes);
  }

  private applyTransform(value: any, transform?: string, customFn?: string) {
    if (value === undefined) return value;
    
    // Apply custom transformation function if provided
    if (customFn) {
      try {
        const fn = new Function('value', customFn);
        return fn(value);
      } catch (err) {
        console.error('Custom transform function failed:', err);
      }
    }

    switch (transform) {
      case 'date':
        try {
          return new Date(value).toISOString();
        } catch {
          return value;
        }
      case 'number':
        return Number(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'geojson':
        return value;
      case 'boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

  private extractArrays(segments: string[]) {
    const arrays: { name: string; indexPosition: number }[] = [];
    let arrayCounter = 0;
    segments.forEach((seg, idx) => {
      if (seg === '[]') {
        const name = segments[idx - 1] || `level_${arrays.length}`;
        arrays.push({ name, indexPosition: arrayCounter });
        arrayCounter += 1;
      }
    });
    return arrays;
  }

  private getArrayIndex(arrays: { name: string; indexPosition: number }[], name: string, indexes: number[]): number | undefined {
    const entry = arrays.find((a) => a.name.includes(name));
    if (!entry) return undefined;
    return indexes[entry.indexPosition];
  }

  private mergeValue(target: any, key: string, value: any, isArray?: boolean) {
    if (!isArray) {
      target[key] = value;
      return;
    }
    const existing = target[key];
    if (existing === undefined) {
      target[key] = [value];
    } else if (Array.isArray(existing)) {
      target[key].push(value);
    } else {
      target[key] = [existing, value];
    }
  }

  public normalizeProviderResponse(provider_id: string, payload: any, endpoint_name?: string): CanonicalizedPayload {
    // ensure fresh view of mappings (in case Admin edited them while server is running)
    this.registry.reloadFromDatabase();

    const endpoint = endpoint_name
      ? this.registry.listEndpoints(provider_id).find((e) => e.endpoint_name === endpoint_name)
      : undefined;
    const endpointId = endpoint?.id;
    const mappings = this.registry.listMappings(provider_id, endpointId);

    const canonical: CanonicalizedPayload = {
      shipment: {},
      carrier: {},
      route: {},
      containers: [],
      events: [],
      vessels: [],
      route_geometry: {},
      metadata: {},
    };

    mappings.forEach((m) => {
      const segments = this.splitPath(m.external_field);
      const matches = this.collectMatches(payload, segments);
      const arrays = this.extractArrays(segments);

      matches.forEach((match) => {
        let value = match.value;
        
        // Apply default value if field is missing
        if (value === undefined || value === null) {
          if (m.default_value !== undefined) {
            value = m.default_value;
          } else if (m.required) {
            console.warn(`Required field missing: ${m.external_field}`);
            return;
          } else {
            return;
          }
        }

        // Validate with regex if provided
        if (m.validation_regex && typeof value === 'string') {
          const regex = new RegExp(m.validation_regex);
          if (!regex.test(value)) {
            console.warn(`Validation failed for ${m.external_field}: ${value}`);
            return;
          }
        }

        const transformed = this.applyTransform(value, m.transformation, m.custom_transform_fn);
        const containerIdx = this.getArrayIndex(arrays, 'containers', match.indexes);
        const movementIdx = this.getArrayIndex(arrays, 'movements', match.indexes);
        const featureIdx = this.getArrayIndex(arrays, 'features', match.indexes);

        switch (m.domain_entity) {
          case 'Shipment':
            this.mergeValue(canonical.shipment, m.internal_field, transformed, m.is_array);
            break;
          case 'Carrier':
            this.mergeValue(canonical.carrier, m.internal_field, transformed, m.is_array);
            break;
          case 'Route':
            this.mergeValue(canonical.route, m.internal_field, transformed, m.is_array);
            break;
          case 'Container': {
            const idx = containerIdx ?? canonical.containers.length;
            canonical.containers[idx] = canonical.containers[idx] || { events: [] };
            this.mergeValue(canonical.containers[idx], m.internal_field, transformed, m.is_array);
            break;
          }
          case 'Event': {
            if (containerIdx !== undefined) {
              const cIdx = containerIdx;
              canonical.containers[cIdx] = canonical.containers[cIdx] || { events: [] };
              const events = (canonical.containers[cIdx].events = canonical.containers[cIdx].events || []);
              const eIdx = movementIdx ?? events.length;
              events[eIdx] = events[eIdx] || {};
              this.mergeValue(events[eIdx], m.internal_field, transformed, m.is_array);
            } else if (featureIdx !== undefined) {
              canonical.events[featureIdx] = canonical.events[featureIdx] || {};
              this.mergeValue(canonical.events[featureIdx], m.internal_field, transformed, m.is_array);
            } else {
              const eIdx = m.is_array ? canonical.events.length : 0;
              canonical.events[eIdx] = canonical.events[eIdx] || {};
              this.mergeValue(canonical.events[eIdx], m.internal_field, transformed, m.is_array);
            }
            break;
          }
          case 'Vessel': {
            if (containerIdx !== undefined) {
              const cIdx = containerIdx;
              canonical.containers[cIdx] = canonical.containers[cIdx] || { events: [] };
              const vessel = (canonical.containers[cIdx].vessel = canonical.containers[cIdx].vessel || {});
              this.mergeValue(vessel, m.internal_field, transformed, m.is_array);
            } else if (featureIdx !== undefined) {
              canonical.vessels[featureIdx] = canonical.vessels[featureIdx] || {};
              this.mergeValue(canonical.vessels[featureIdx], m.internal_field, transformed, m.is_array);
            } else {
              const vIdx = m.is_array ? canonical.vessels.length : 0;
              canonical.vessels[vIdx] = canonical.vessels[vIdx] || {};
              this.mergeValue(canonical.vessels[vIdx], m.internal_field, transformed, m.is_array);
            }
            break;
          }
          case 'RouteGeometry': {
            canonical.route_geometry = canonical.route_geometry || {};
            this.mergeValue(canonical.route_geometry, m.internal_field, transformed, m.is_array);
            break;
          }
          case 'Metadata': {
            canonical.metadata = canonical.metadata || {};
            this.mergeValue(canonical.metadata, m.internal_field, transformed, m.is_array);
            break;
          }
          default:
            break;
        }
      });
    });

    return canonical;
  }
}

// Simple template replace: {{var}}
const interpolate = (template: any, vars: Record<string, any>) => {
  if (typeof template === 'string') {
    return template.replace(/{{\s*([\w\.]+)\s*}}/g, (_, key) => {
      return vars[key] ?? '';
    });
  }
  if (Array.isArray(template)) return template.map((t) => interpolate(t, vars));
  if (typeof template === 'object' && template !== null) {
    const out: any = {};
    Object.entries(template).forEach(([k, v]) => (out[k] = interpolate(v, vars)));
    return out;
  }
  return template;
};

export class ProviderExecutor {
  private registry: ProviderRegistry;

  constructor(registry?: ProviderRegistry) {
    this.registry = registry || new ProviderRegistry();
  }

  private disallowHeaderKeys(bodyTemplate: any) {
    if (!bodyTemplate || typeof bodyTemplate !== 'object') return;
    const forbidden = ['content-type', 'authorization', 'x-api-key', 'x-shipsgo-user-token'];
    const keys = Object.keys(bodyTemplate).map((k) => k.toLowerCase());
    if (keys.some((k) => forbidden.includes(k))) {
      throw new Error('Headers are not allowed in request template. Move header fields to provider headers_json.');
    }
  }

  private resolvePath(base: string, path: string, vars: Record<string, any>) {
    const replacedPath = path.replace(/{{\s*([\w\.]+)\s*}}/g, (_match: string, key: string) => vars[key] ?? '');
    return base.replace(/\/$/, '') + replacedPath;
  }

  private buildHeaders(provider: ProviderRecord, headersTemplate: any, vars: Record<string, any>): Record<string, string> {
    const base: Record<string, string> = { 'Content-Type': 'application/json' };
    const resolvedTemplate = interpolate(headersTemplate || {}, vars);

    Object.assign(base, resolvedTemplate);

    if (provider.auth_type === 'BEARER_TOKEN' && provider.api_key) {
      base['Authorization'] = `Bearer ${provider.api_key}`;
    } else if (provider.auth_type === 'API_KEY' && provider.api_key && !base['x-api-key']) {
      // optional convenience
      base['x-api-key'] = provider.api_key;
    }

    return base;
  }

  private async executeWithRetry(
    config: AxiosRequestConfig,
    retries: number,
    delay: number,
  ): Promise<any> {
    let lastError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await axios.request(config);
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          // Don't retry on 4xx errors (client errors)
          if (err?.response?.status && err.response.status >= 400 && err.response.status < 500) {
            throw err;
          }
          await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  public async executeProviderRequest(
    provider_id: string,
    endpoint_name: string,
    data: Record<string, any>,
    opts?: { shipment_id?: string; bl_number?: string },
  ) {
    const provider = this.registry.listProviders().find((p) => p.id === provider_id && p.is_active);
    if (!provider) throw new Error('Provider not found or inactive');
    const endpoint = this.registry
      .listEndpoints(provider_id)
      .find((e) => e.endpoint_name === endpoint_name);
    if (!endpoint) throw new Error('Endpoint not found');

    this.disallowHeaderKeys(endpoint.body_template);
    // Prefer provider api_key from admin panel; fall back to env for ShipsGo
    const effectiveApiKey =
      (provider.api_key && String(provider.api_key).trim())
        ? provider.api_key
        : (provider.name === 'ShipsGo' && process.env.SHIPSGO_API_KEY)
          ? process.env.SHIPSGO_API_KEY
          : provider.api_key;
    const vars = {
      ...data,
      API_KEY: effectiveApiKey,
      CLIENT_ID: provider.client_id,
      CLIENT_SECRET: provider.client_secret,
      api_key: effectiveApiKey,
      client_id: provider.client_id,
      client_secret: provider.client_secret,
    };
    const headersTpl = endpoint.headers_json ?? provider.headers ?? {};
    const queryTpl = endpoint.query_params_json ?? {};
    const bodyTpl = endpoint.body_template ?? {};

    const headers = this.buildHeaders(provider, headersTpl, vars);
    const query = interpolate(queryTpl, vars);
    let body = interpolate(bodyTpl, vars);
    if (body && typeof body === 'object' && endpoint_name === 'create_tracking' && provider.name === 'ShipsGo') {
      body = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== undefined && v !== null));
    }

    const url = this.resolvePath(provider.base_url, endpoint.path, vars);
    const timeout = endpoint.timeout_ms || provider.timeout_ms || 15000;
    const config: AxiosRequestConfig = {
      url,
      method: endpoint.method,
      headers,
      data: endpoint.method === 'GET' ? undefined : body,
      params: query,
      timeout,
    };

    const retries = provider.retry_attempts ?? 3;
    const retryDelay = provider.retry_delay_ms ?? 1000;

    const start = Date.now();
    try {
      const res = await this.executeWithRetry(config, retries, retryDelay);
      let payload = res.data;
      if (endpoint.response_root) {
        const path = endpoint.response_root.split('.');
        payload = path.reduce((obj: any, key) => obj?.[key], res.data);
      }
      const latency = Date.now() - start;
      // Persist log for refresh / reapply
      this.registry.pushApiLog({
        provider_id: provider.id,
        endpoint_id: endpoint.id,
        shipment_id: opts?.shipment_id,
        bl_number: opts?.bl_number,
        request_url: url,
        request_headers: headers,
        request_body: body,
        response_status: res.status,
        response_body: res.data,
        latency,
        created_at: new Date().toISOString(),
      });
      return payload;
    } catch (err: any) {
      const latency = Date.now() - start;
      this.registry.pushApiLog({
        provider_id: provider.id,
        endpoint_id: endpoint.id,
        shipment_id: opts?.shipment_id,
        bl_number: opts?.bl_number,
        request_url: url,
        request_headers: headers,
        request_body: body,
        response_status: err?.response?.status || 500,
        response_body: err?.response?.data || err?.message,
        latency,
        created_at: new Date().toISOString(),
      });
      throw err;
    }
  }
}

export interface CanonicalizedPayload {
  shipment: Record<string, any>;
  carrier?: Record<string, any>;
  route?: Record<string, any>;
  containers: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  vessels: Array<Record<string, any>>;
  route_geometry?: Record<string, any>;
  metadata?: Record<string, any>;
}

// Thin wrapper for backward compatibility
export function normalizeProviderResponse(
  provider_id: string,
  payload: any,
  registry?: ProviderRegistry,
  endpoint_name?: string,
): CanonicalizedPayload {
  const engine = new DataMappingEngine(registry);
  return engine.normalizeProviderResponse(provider_id, payload, endpoint_name);
}
