import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
  CANONICAL_FIELDS,
  CanonicalField,
  DomainEntity,
  TransformType,
  ensureUniqueFieldName,
} from './canonical_schema.ts';

export type AuthType = 'API_KEY' | 'BEARER_TOKEN' | 'OAUTH2' | 'CUSTOM_HEADER';

export interface ProviderRecord {
  id: string;
  name: string;
  base_url: string;
  auth_type: AuthType;
  api_key?: string;
  client_id?: string;
  client_secret?: string;
  headers?: Record<string, string>;
  is_active: boolean;
  priority?: number;
  multi_carrier?: boolean;
  supports_container_tracking?: boolean;
  supports_bl_tracking?: boolean;
  timeout_ms?: number;
  retry_attempts?: number;
  retry_delay_ms?: number;
  rate_limit_per_minute?: number;
  cost_per_request?: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderEndpoint {
  id: string;
  provider_id: string;
  endpoint_name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers_json?: any;
  query_params_json?: any;
  body_template?: any;
  path_params?: string[];
  response_root?: string;
  timeout_ms?: number;
  cache_ttl_seconds?: number;
  requires_auth?: boolean;
  version?: string;
  description?: string;
  created_at: string;
}

export interface ProviderFieldMapping {
  id: string;
  provider_id: string;
  endpoint_id?: string;
  external_field: string;
  internal_field: string; // canonical internal field name
  domain_entity: DomainEntity;
  transformation?: TransformType;
  is_array?: boolean;
  default_value?: string;
  required?: boolean;
  validation_regex?: string;
  custom_transform_fn?: string;
  notes?: string;
  created_at: string;
}

export interface ProviderCapability {
  id: string;
  provider_id: string;
  capability: string;
}

export interface ProviderCoverage {
  id: string;
  provider_id: string;
  carrier_code: string; // e.g. MSC, MAERSK, ALL
}

export interface ProviderHealth {
  provider_id: string;
  success_rate: number; // 0..1
  avg_latency_ms: number;
  last_checked_at: string;
}

interface StoreShape {
  providers: ProviderRecord[];
  endpoints: ProviderEndpoint[];
  mappings: ProviderFieldMapping[];
  internal_fields: CanonicalField[];
  capabilities: ProviderCapability[];
  coverage: ProviderCoverage[];
  health: ProviderHealth[];
  api_logs: ApiLog[];
}

export interface ApiLog {
  provider_id: string;
  endpoint_id: string;
  shipment_id?: string;
  bl_number?: string;
  request_url: string;
  request_headers: any;
  request_body: any;
  response_status: number;
  response_body: any;
  latency: number;
  created_at: string;
}
const DEFAULT_INTERNAL_FIELDS: CanonicalField[] = CANONICAL_FIELDS;

const DEFAULT_STORE: StoreShape = {
  providers: [],
  endpoints: [],
  mappings: [],
  internal_fields: DEFAULT_INTERNAL_FIELDS,
  capabilities: [],
  coverage: [],
  health: [],
  api_logs: [],
};

export class ProviderRegistry {
  private storePath: string;
  private encryptionKey: Buffer;
  private cache: StoreShape = DEFAULT_STORE;
  private db: Database.Database;
  private dbPath: string;

  constructor(baseDir?: string) {
    this.storePath = path.join(baseDir || process.cwd(), 'data', 'providers.json');
    this.dbPath = path.join(baseDir || process.cwd(), 'data', 'app.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.ensureTables();
    const secret = process.env.PROVIDER_SECRET || 'freight-command-secret-key';
    this.encryptionKey = crypto.createHash('sha256').update(secret).digest();
    if (this.encryptionKey.length !== 32) {
      throw new Error('Invalid encryption key length. Key must be 256 bits.');
    }
    this.loadFromDb();
    // If database is empty, seed from JSON file once
    if (!this.cache.providers.length) {
      this.loadFromSeedFile();
      this.persistToDb();
      this.loadFromDb();
    }
  }

  private loadFromSeedFile() {
    if (!fs.existsSync(this.storePath)) {
      this.cache = DEFAULT_STORE;
      return;
    }
    try {
      const content = fs.readFileSync(this.storePath, 'utf-8');
      this.cache = this.normalizeParsed(JSON.parse(content) as StoreShape);
    } catch (err) {
      console.error('Failed to load provider seed file, recreating', err);
      this.cache = DEFAULT_STORE;
    }
  }

  private normalizeParsed(parsed: StoreShape): StoreShape {
    // migrate missing internal_fields
    if (!parsed.internal_fields || parsed.internal_fields.length === 0) parsed.internal_fields = DEFAULT_INTERNAL_FIELDS;
    // upgrade internal field shape (domain + data_type)
    parsed.internal_fields = parsed.internal_fields.map((f: any) => {
      const field = CANONICAL_FIELDS.find((cf) => cf.name === f.name) || f;
      return {
        id: field.id || field.name,
        name: field.name,
        domain: field.domain || this.inferDomain(field.name),
        data_type: field.data_type || this.coerceDataType(field.name),
        description: field.description,
        is_array: field.is_array,
      } as CanonicalField;
    });

    // canonical defaults first to avoid duplicates
    CANONICAL_FIELDS.forEach((cf) => {
      if (!parsed.internal_fields.some((f) => f.name === cf.name)) parsed.internal_fields.push(cf);
    });

    if (!parsed.capabilities) parsed.capabilities = [];
    if (!parsed.coverage) parsed.coverage = [];
    if (!parsed.health) parsed.health = [];
    if (!parsed.api_logs) parsed.api_logs = [];

    // migrate mappings from old shape
    if (parsed.mappings?.length) {
      parsed.mappings = parsed.mappings.map((m: any) => {
        if (!m) return m;
        const internalName =
          m.internal_field ||
          parsed.internal_fields.find((f) => f.id === m.internal_field_id)?.name ||
          '';
        const domain = m.domain_entity || this.inferDomain(internalName || m.external_field, m.external_field);
        return {
          id: m.id || `map_${Date.now()}`,
          provider_id: m.provider_id,
          endpoint_id: m.endpoint_id,
          external_field: m.external_field,
          internal_field: internalName,
          domain_entity: domain,
          transformation: m.transformation,
          is_array: m.is_array ?? (typeof m.external_field === 'string' && m.external_field.includes('[]')),
          created_at: m.created_at || new Date().toISOString(),
        } as ProviderFieldMapping;
      });
    }
    return parsed;
  }

  private ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT,
        base_url TEXT,
        auth_type TEXT,
        api_key TEXT,
        client_id TEXT,
        client_secret TEXT,
        headers_json TEXT,
        is_active INTEGER,
        priority INTEGER,
        multi_carrier INTEGER,
        supports_container_tracking INTEGER,
        supports_bl_tracking INTEGER,
        timeout_ms INTEGER,
        retry_attempts INTEGER,
        retry_delay_ms INTEGER,
        rate_limit_per_minute INTEGER,
        cost_per_request REAL,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        endpoint_name TEXT,
        method TEXT,
        path TEXT,
        headers_json TEXT,
        query_params_json TEXT,
        body_template TEXT,
        path_params TEXT,
        response_root TEXT,
        timeout_ms INTEGER,
        cache_ttl_seconds INTEGER,
        requires_auth INTEGER,
        version TEXT,
        description TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS mappings (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        endpoint_id TEXT,
        external_field TEXT,
        internal_field TEXT,
        domain_entity TEXT,
        transformation TEXT,
        is_array INTEGER,
        default_value TEXT,
        required INTEGER,
        validation_regex TEXT,
        custom_transform_fn TEXT,
        notes TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS coverage (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        carrier_code TEXT
      );
      CREATE TABLE IF NOT EXISTS capabilities (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        capability TEXT
      );
      CREATE TABLE IF NOT EXISTS health (
        provider_id TEXT PRIMARY KEY,
        success_rate REAL,
        avg_latency_ms REAL,
        last_checked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS api_logs (
        provider_id TEXT,
        endpoint_id TEXT,
        shipment_id TEXT,
        bl_number TEXT,
        request_url TEXT,
        request_headers TEXT,
        request_body TEXT,
        response_status INTEGER,
        response_body TEXT,
        latency INTEGER,
        created_at TEXT
      );
    `);
    try { this.db.exec(`ALTER TABLE api_logs ADD COLUMN shipment_id TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE api_logs ADD COLUMN bl_number TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE providers ADD COLUMN timeout_ms INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE providers ADD COLUMN retry_attempts INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE providers ADD COLUMN retry_delay_ms INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE providers ADD COLUMN rate_limit_per_minute INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE providers ADD COLUMN cost_per_request REAL`); } catch {}
    try { this.db.exec(`ALTER TABLE endpoints ADD COLUMN timeout_ms INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE endpoints ADD COLUMN cache_ttl_seconds INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE endpoints ADD COLUMN requires_auth INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE endpoints ADD COLUMN version TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE endpoints ADD COLUMN description TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE mappings ADD COLUMN default_value TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE mappings ADD COLUMN required INTEGER`); } catch {}
    try { this.db.exec(`ALTER TABLE mappings ADD COLUMN validation_regex TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE mappings ADD COLUMN custom_transform_fn TEXT`); } catch {}
    try { this.db.exec(`ALTER TABLE mappings ADD COLUMN notes TEXT`); } catch {}
  }

  private loadFromDb() {
    const providers = this.db.prepare('SELECT * FROM providers').all();
    const endpoints = this.db.prepare('SELECT * FROM endpoints').all();
    const mappings = this.db.prepare('SELECT * FROM mappings').all();
    const coverage = this.db.prepare('SELECT * FROM coverage').all();
    const capabilities = this.db.prepare('SELECT * FROM capabilities').all();
    const health = this.db.prepare('SELECT * FROM health').all();
    const api_logs = this.db.prepare('SELECT * FROM api_logs').all();

    this.cache.providers = providers.map((p: any) => ({
      ...p,
      api_key: p.api_key,
      client_secret: p.client_secret,
      headers: p.headers_json ? JSON.parse(p.headers_json) : undefined,
      is_active: Boolean(p.is_active),
      multi_carrier: Boolean(p.multi_carrier),
      supports_container_tracking: p.supports_container_tracking !== 0,
      supports_bl_tracking: p.supports_bl_tracking !== 0,
    }));

    this.cache.endpoints = endpoints.map((e: any) => ({
      ...e,
      headers_json: e.headers_json ? JSON.parse(e.headers_json) : undefined,
      query_params_json: e.query_params_json ? JSON.parse(e.query_params_json) : undefined,
      body_template: e.body_template ? JSON.parse(e.body_template) : undefined,
      path_params: e.path_params ? JSON.parse(e.path_params) : [],
      requires_auth: e.requires_auth !== 0,
    }));

    this.cache.mappings = mappings.map((m: any) => ({
      ...m,
      is_array: Boolean(m.is_array),
      required: Boolean(m.required),
    }));

    this.cache.coverage = coverage;
    this.cache.capabilities = capabilities;
    this.cache.health = health;
    this.cache.api_logs = api_logs.map((l: any) => ({
      ...l,
      request_headers: l.request_headers ? JSON.parse(l.request_headers) : undefined,
      request_body: l.request_body ? JSON.parse(l.request_body) : undefined,
      response_body: l.response_body ? JSON.parse(l.response_body) : undefined,
    }));

    // Always ensure internal fields are present
    this.cache.internal_fields = DEFAULT_INTERNAL_FIELDS;
  }

  private persistToDb() {
    const tx = this.db.transaction(() => {
      this.db.exec('DELETE FROM providers; DELETE FROM endpoints; DELETE FROM mappings; DELETE FROM coverage; DELETE FROM capabilities; DELETE FROM health; DELETE FROM api_logs;');
      const insertProvider = this.db.prepare(`INSERT OR REPLACE INTO providers
        (id, name, base_url, auth_type, api_key, client_id, client_secret, headers_json, is_active, priority, multi_carrier, supports_container_tracking, supports_bl_tracking, timeout_ms, retry_attempts, retry_delay_ms, rate_limit_per_minute, cost_per_request, created_at, updated_at)
        VALUES (@id, @name, @base_url, @auth_type, @api_key, @client_id, @client_secret, @headers_json, @is_active, @priority, @multi_carrier, @supports_container_tracking, @supports_bl_tracking, @timeout_ms, @retry_attempts, @retry_delay_ms, @rate_limit_per_minute, @cost_per_request, @created_at, @updated_at)`);
      const insertEndpoint = this.db.prepare(`INSERT OR REPLACE INTO endpoints
        (id, provider_id, endpoint_name, method, path, headers_json, query_params_json, body_template, path_params, response_root, timeout_ms, cache_ttl_seconds, requires_auth, version, description, created_at)
        VALUES (@id, @provider_id, @endpoint_name, @method, @path, @headers_json, @query_params_json, @body_template, @path_params, @response_root, @timeout_ms, @cache_ttl_seconds, @requires_auth, @version, @description, @created_at)`);
      const insertMapping = this.db.prepare(`INSERT OR REPLACE INTO mappings
        (id, provider_id, endpoint_id, external_field, internal_field, domain_entity, transformation, is_array, default_value, required, validation_regex, custom_transform_fn, notes, created_at)
        VALUES (@id, @provider_id, @endpoint_id, @external_field, @internal_field, @domain_entity, @transformation, @is_array, @default_value, @required, @validation_regex, @custom_transform_fn, @notes, @created_at)`);
      const insertCoverage = this.db.prepare(`INSERT OR REPLACE INTO coverage
        (id, provider_id, carrier_code) VALUES (@id, @provider_id, @carrier_code)`);
      const insertCapability = this.db.prepare(`INSERT OR REPLACE INTO capabilities
        (id, provider_id, capability) VALUES (@id, @provider_id, @capability)`);
      const insertHealth = this.db.prepare(`INSERT OR REPLACE INTO health
        (provider_id, success_rate, avg_latency_ms, last_checked_at) VALUES (@provider_id, @success_rate, @avg_latency_ms, @last_checked_at)`);
      const insertApiLog = this.db.prepare(`INSERT INTO api_logs
        (provider_id, endpoint_id, shipment_id, bl_number, request_url, request_headers, request_body, response_status, response_body, latency, created_at)
        VALUES (@provider_id, @endpoint_id, @shipment_id, @bl_number, @request_url, @request_headers, @request_body, @response_status, @response_body, @latency, @created_at)`);

      this.cache.providers.forEach((p) =>
        insertProvider.run({
          ...p,
          api_key: p.api_key,
          client_id: p.client_id ?? null,
          client_secret: p.client_secret ?? null,
          headers_json: p.headers ? JSON.stringify(p.headers) : null,
          is_active: p.is_active ? 1 : 0,
          multi_carrier: p.multi_carrier ? 1 : 0,
          supports_container_tracking: p.supports_container_tracking ? 1 : 0,
          supports_bl_tracking: p.supports_bl_tracking ? 1 : 0,
          timeout_ms: p.timeout_ms ?? null,
          retry_attempts: p.retry_attempts ?? null,
          retry_delay_ms: p.retry_delay_ms ?? null,
          rate_limit_per_minute: p.rate_limit_per_minute ?? null,
          cost_per_request: p.cost_per_request ?? null,
        })
      );
      this.cache.endpoints.forEach((e) =>
        insertEndpoint.run({
          ...e,
          headers_json: e.headers_json ? JSON.stringify(e.headers_json) : null,
          query_params_json: e.query_params_json ? JSON.stringify(e.query_params_json) : null,
          body_template: e.body_template ? JSON.stringify(e.body_template) : null,
          path_params: e.path_params ? JSON.stringify(e.path_params) : '[]',
          timeout_ms: e.timeout_ms ?? null,
          cache_ttl_seconds: e.cache_ttl_seconds ?? null,
          requires_auth: e.requires_auth ? 1 : 0,
          version: e.version ?? null,
          description: e.description ?? null,
        })
      );
      this.cache.mappings.forEach((m) =>
        insertMapping.run({
          ...m,
          is_array: m.is_array ? 1 : 0,
          default_value: m.default_value ?? null,
          required: m.required ? 1 : 0,
          validation_regex: m.validation_regex ?? null,
          custom_transform_fn: m.custom_transform_fn ?? null,
          notes: m.notes ?? null,
        })
      );
      this.cache.coverage.forEach((c) => insertCoverage.run(c));
      this.cache.capabilities.forEach((c) => insertCapability.run(c));
      this.cache.health.forEach((h) => insertHealth.run(h));
      this.cache.api_logs.forEach((l) =>
        insertApiLog.run({
          ...l,
          shipment_id: l.shipment_id ?? null,
          bl_number: l.bl_number ?? null,
          request_headers: l.request_headers ? JSON.stringify(l.request_headers) : null,
          request_body: l.request_body ? JSON.stringify(l.request_body) : null,
          response_body: l.response_body ? JSON.stringify(l.response_body) : null,
        })
      );
    });
    tx();
  }

  private enc(value?: string): string | undefined {
    if (!value) return undefined;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  private dec(value?: string): string | undefined {
    if (!value) return undefined;
    try {
      const raw = Buffer.from(value, 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const data = raw.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      return dec.toString('utf8');
    } catch (err) {
      console.error('Decryption failed:', err);
      return undefined;
    }
  }

  private inferDomain(name: string, externalField?: string): DomainEntity {
    const lower = name.toLowerCase();
    const ext = (externalField || '').toLowerCase();
    if (lower.includes('carrier') || ext.includes('carrier')) return 'Carrier';
    if (lower.includes('route_geometry') || ext.includes('geojson') || ext.includes('geometry')) return 'RouteGeometry';
    if (lower.includes('route') || lower.includes('port') || ext.includes('route') || ext.includes('port')) return 'Route';
    if (lower.includes('container') || ext.includes('container')) return 'Container';
    if (lower.includes('event') || ext.includes('event') || ext.includes('movement')) return 'Event';
    if (lower.includes('vessel') || lower.includes('voyage') || ext.includes('vessel') || ext.includes('voyage')) return 'Vessel';
    if (lower.includes('token') || lower.includes('tag') || lower.includes('follower') || lower.includes('creator') || ext.includes('token') || ext.includes('tag')) return 'Metadata';
    return 'Shipment';
  }

  private coerceDataType(name: string, transformation?: TransformType): CanonicalField['data_type'] {
    if (transformation) return transformation;
    const lower = name.toLowerCase();
    if (lower.includes('time') || lower.includes('date')) return 'date';
    if (lower.includes('percent') || lower.includes('count') || lower.includes('index') || lower.includes('number')) return 'number';
    if (lower.includes('coordinate') || lower.includes('geo')) return 'geojson';
    if (lower.includes('tag') || lower.includes('follower')) return 'array';
    return 'string';
  }

  public listProviders(): ProviderRecord[] {
    return this.cache.providers.map((p) => ({ ...p, api_key: this.dec(p.api_key), client_secret: this.dec(p.client_secret) }));
  }

  private save() {
    this.persistToDb();
  }

  /**
   * Force a fresh load from the database, clearing any in-memory cache so newly
   * saved providers/endpoints are visible immediately.
   */
  public reloadFromDatabase() {
    this.cache = DEFAULT_STORE;
    this.loadFromDb();
  }

  public upsertProvider(payload: Partial<ProviderRecord> & { name: string; base_url: string; auth_type: AuthType }): ProviderRecord {
    const now = new Date().toISOString();
    let record = this.cache.providers.find((p) => p.id === payload.id);
    if (!record) {
      record = {
        id: payload.id || `prov_${Date.now()}`,
        name: payload.name,
        base_url: payload.base_url,
        auth_type: payload.auth_type,
        api_key: this.enc(payload.api_key),
        client_id: payload.client_id,
        client_secret: this.enc(payload.client_secret),
        headers: payload.headers || {},
        is_active: payload.is_active ?? true,
        priority: payload.priority ?? 10,
        multi_carrier: payload.multi_carrier ?? false,
        supports_container_tracking: payload.supports_container_tracking ?? true,
        supports_bl_tracking: payload.supports_bl_tracking ?? false,
        timeout_ms: payload.timeout_ms ?? 15000,
        retry_attempts: payload.retry_attempts ?? 3,
        retry_delay_ms: payload.retry_delay_ms ?? 1000,
        rate_limit_per_minute: payload.rate_limit_per_minute ?? 60,
        cost_per_request: payload.cost_per_request ?? 0,
        created_at: now,
        updated_at: now,
      };
      this.cache.providers.push(record);
    } else {
      Object.assign(record, {
        name: payload.name ?? record.name,
        base_url: payload.base_url ?? record.base_url,
        auth_type: payload.auth_type ?? record.auth_type,
        api_key: payload.api_key ? this.enc(payload.api_key) : record.api_key,
        client_id: payload.client_id ?? record.client_id,
        client_secret: payload.client_secret ? this.enc(payload.client_secret) : record.client_secret,
        headers: payload.headers ?? record.headers,
        is_active: payload.is_active ?? record.is_active,
        priority: payload.priority ?? record.priority ?? 10,
        multi_carrier: payload.multi_carrier ?? record.multi_carrier,
        supports_container_tracking: payload.supports_container_tracking ?? record.supports_container_tracking,
        supports_bl_tracking: payload.supports_bl_tracking ?? record.supports_bl_tracking,
        timeout_ms: payload.timeout_ms ?? record.timeout_ms,
        retry_attempts: payload.retry_attempts ?? record.retry_attempts,
        retry_delay_ms: payload.retry_delay_ms ?? record.retry_delay_ms,
        rate_limit_per_minute: payload.rate_limit_per_minute ?? record.rate_limit_per_minute,
        cost_per_request: payload.cost_per_request ?? record.cost_per_request,
        updated_at: now,
      });
    }
    this.save();
    return { ...record, api_key: this.dec(record.api_key), client_secret: this.dec(record.client_secret) } as ProviderRecord;
  }

  public deleteProvider(id: string) {
    this.cache.providers = this.cache.providers.filter((p) => p.id !== id);
    this.cache.endpoints = this.cache.endpoints.filter((e) => e.provider_id !== id);
    this.cache.mappings = this.cache.mappings.filter((m) => m.provider_id !== id);
    this.save();
  }

  public listEndpoints(provider_id?: string): ProviderEndpoint[] {
    const rows = provider_id
      ? this.cache.endpoints.filter((e) => e.provider_id === provider_id)
      : this.cache.endpoints;
    return rows;
  }

  public upsertEndpoint(payload: Partial<ProviderEndpoint> & { provider_id: string; endpoint_name: string; method: ProviderEndpoint['method']; path: string; headers_json?: any; query_params_json?: any; body_template?: any; path_params?: string[]; response_root?: string; request_template?: any }): ProviderEndpoint {
    const now = new Date().toISOString();
    let row = this.cache.endpoints.find((e) => e.id === payload.id);
    if (!row) {
      row = {
        id: payload.id || `ep_${Date.now()}`,
        provider_id: payload.provider_id,
        endpoint_name: payload.endpoint_name,
        method: payload.method,
        path: payload.path,
        headers_json: payload.headers_json,
        query_params_json: payload.query_params_json,
        body_template: payload.body_template ?? payload.request_template,
        path_params: payload.path_params || [],
        response_root: payload.response_root,
        timeout_ms: payload.timeout_ms,
        cache_ttl_seconds: payload.cache_ttl_seconds,
        requires_auth: payload.requires_auth ?? true,
        version: payload.version,
        description: payload.description,
        created_at: now,
      };
      this.cache.endpoints.push(row);
    } else {
      Object.assign(row, {
        endpoint_name: payload.endpoint_name ?? row.endpoint_name,
        method: payload.method ?? row.method,
        path: payload.path ?? row.path,
        headers_json: payload.headers_json ?? row.headers_json,
        query_params_json: payload.query_params_json ?? row.query_params_json,
        body_template: (payload.body_template ?? payload.request_template) ?? row.body_template,
        path_params: payload.path_params ?? row.path_params,
        response_root: payload.response_root ?? row.response_root,
        timeout_ms: payload.timeout_ms ?? row.timeout_ms,
        cache_ttl_seconds: payload.cache_ttl_seconds ?? row.cache_ttl_seconds,
        requires_auth: payload.requires_auth ?? row.requires_auth,
        version: payload.version ?? row.version,
        description: payload.description ?? row.description,
      });
    }
    this.save();
    return row;
  }

  public deleteEndpoint(id: string) {
    this.cache.endpoints = this.cache.endpoints.filter((e) => e.id !== id);
    this.save();
  }

  public listMappings(provider_id?: string, endpoint_id?: string): ProviderFieldMapping[] {
    let rows = provider_id
      ? this.cache.mappings.filter((m) => m.provider_id === provider_id)
      : this.cache.mappings;
    if (endpoint_id) {
      rows = rows.filter((m) => !m.endpoint_id || m.endpoint_id === endpoint_id);
    }
    return rows;
  }

  public upsertMapping(payload: Partial<ProviderFieldMapping> & { provider_id: string; external_field: string; internal_field: string; domain_entity: DomainEntity }): ProviderFieldMapping {
    const now = new Date().toISOString();
    let row = this.cache.mappings.find((m) => m.id === payload.id);
    if (!row) {
      row = {
        id: payload.id || `map_${Date.now()}`,
        provider_id: payload.provider_id,
        endpoint_id: payload.endpoint_id,
        external_field: payload.external_field,
        internal_field: payload.internal_field,
        domain_entity: payload.domain_entity,
        transformation: payload.transformation,
        is_array: payload.is_array ?? payload.external_field.includes('[]'),
        default_value: payload.default_value,
        required: payload.required ?? false,
        validation_regex: payload.validation_regex,
        custom_transform_fn: payload.custom_transform_fn,
        notes: payload.notes,
        created_at: now,
      };
      this.cache.mappings.push(row);
    } else {
      Object.assign(row, {
        external_field: payload.external_field ?? row.external_field,
        internal_field: payload.internal_field ?? row.internal_field,
        domain_entity: payload.domain_entity ?? row.domain_entity,
        transformation: payload.transformation ?? row.transformation,
        is_array: payload.is_array ?? row.is_array,
        endpoint_id: payload.endpoint_id ?? row.endpoint_id,
        default_value: payload.default_value ?? row.default_value,
        required: payload.required ?? row.required,
        validation_regex: payload.validation_regex ?? row.validation_regex,
        custom_transform_fn: payload.custom_transform_fn ?? row.custom_transform_fn,
        notes: payload.notes ?? row.notes,
      });
    }
    this.save();
    return row;
  }

  public deleteMapping(id: string) {
    this.cache.mappings = this.cache.mappings.filter((m) => m.id !== id);
    this.save();
  }

  public bulkDeleteMappings(provider_id: string, opts?: {contains?: string}) {
    const term = opts?.contains?.toLowerCase();
    this.cache.mappings = this.cache.mappings.filter((m) => {
      if (m.provider_id !== provider_id) return true;
      if (!term) return false; // delete all for provider if no term
      return !m.external_field.toLowerCase().includes(term);
    });
    this.save();
  }

  public deleteMappingsByIds(ids: string[]) {
    const set = new Set(ids);
    this.cache.mappings = this.cache.mappings.filter((m) => !set.has(m.id));
    this.save();
  }

  public listInternalFields(): CanonicalField[] {
    if (!this.cache.internal_fields || this.cache.internal_fields.length === 0) {
      this.cache.internal_fields = DEFAULT_INTERNAL_FIELDS;
      this.save();
    }
    return this.cache.internal_fields;
  }

  public ensureInternalField(name: string, domain: DomainEntity, data_type: CanonicalField['data_type'] = 'string'): CanonicalField {
    const existing = this.cache.internal_fields.find((f) => f.name.toLowerCase() === name.toLowerCase() && f.domain === domain);
    if (existing) return existing;
    const uniqueName = ensureUniqueFieldName(this.cache.internal_fields, name, domain);
    const field: CanonicalField = {
      id: uniqueName,
      name: uniqueName,
      domain,
      data_type,
    };
    this.cache.internal_fields.push(field);
    this.save();
    return field;
  }

  public listCapabilities(provider_id?: string): ProviderCapability[] {
    return provider_id ? this.cache.capabilities.filter((c) => c.provider_id === provider_id) : this.cache.capabilities;
  }

  public upsertCapability(payload: { id?: string; provider_id: string; capability: string }): ProviderCapability {
    let row = this.cache.capabilities.find((c) => c.id === payload.id);
    if (!row) {
      row = { id: payload.id || `cap_${Date.now()}`, provider_id: payload.provider_id, capability: payload.capability };
      this.cache.capabilities.push(row);
    } else {
      row.capability = payload.capability;
    }
    this.save();
    return row;
  }

  public deleteCapability(id: string) {
    this.cache.capabilities = this.cache.capabilities.filter((c) => c.id !== id);
    this.save();
  }

  public listCoverage(provider_id?: string): ProviderCoverage[] {
    return provider_id ? this.cache.coverage.filter((c) => c.provider_id === provider_id) : this.cache.coverage;
  }

  public upsertCoverage(payload: { id?: string; provider_id: string; carrier_code: string }): ProviderCoverage {
    let row = this.cache.coverage.find((c) => c.id === payload.id);
    if (!row) {
      row = { id: payload.id || `cov_${Date.now()}`, provider_id: payload.provider_id, carrier_code: payload.carrier_code };
      this.cache.coverage.push(row);
    } else {
      row.carrier_code = payload.carrier_code;
    }
    this.save();
    return row;
  }

  public deleteCoverage(id: string) {
    this.cache.coverage = this.cache.coverage.filter((c) => c.id !== id);
    this.save();
  }

  public listHealth(): ProviderHealth[] {
    return this.cache.health;
  }

  public upsertHealth(payload: ProviderHealth) {
    const existing = this.cache.health.find((h) => h.provider_id === payload.provider_id);
    if (existing) {
      Object.assign(existing, payload);
    } else {
      this.cache.health.push(payload);
    }
    this.save();
    return payload;
  }

  public pushApiLog(entry: ApiLog) {
    // Mask keys
    const masked = {...entry};
    if (masked.request_headers?.Authorization) masked.request_headers.Authorization = '***';
    this.cache.api_logs.push(masked);
    // cap size to avoid unbounded growth
    if (this.cache.api_logs.length > 5000) this.cache.api_logs = this.cache.api_logs.slice(-4000);
    this.save();
  }

  public getApiLogs(endpoint_id: string): ApiLog[] {
    return this.cache.api_logs.filter((l) => l.endpoint_id === endpoint_id);
  }

  public getApiLogsByShipment(shipment_id: string, opts?: { endpoint_id?: string }): ApiLog[] {
    let rows = this.cache.api_logs.filter((l) => l.shipment_id === shipment_id);
    if (opts?.endpoint_id) rows = rows.filter((l) => l.endpoint_id === opts.endpoint_id);
    return rows;
  }

  public findInternalField(name: string): CanonicalField | undefined {
    return this.listInternalFields().find((f) => f.name.toLowerCase() === name.toLowerCase());
  }

  public validateProvider(provider: Partial<ProviderRecord>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!provider.name?.trim()) errors.push('Provider name is required');
    if (!provider.base_url?.trim()) errors.push('Base URL is required');
    if (provider.base_url && !provider.base_url.match(/^https?:\/\/.+/)) errors.push('Base URL must start with http:// or https://');
    if (!provider.auth_type) errors.push('Auth type is required');
    if (provider.priority !== undefined && (provider.priority < 0 || provider.priority > 100)) errors.push('Priority must be between 0 and 100');
    if (provider.timeout_ms !== undefined && provider.timeout_ms < 1000) errors.push('Timeout must be at least 1000ms');
    if (provider.retry_attempts !== undefined && (provider.retry_attempts < 0 || provider.retry_attempts > 10)) errors.push('Retry attempts must be between 0 and 10');
    if (provider.rate_limit_per_minute !== undefined && provider.rate_limit_per_minute < 1) errors.push('Rate limit must be at least 1 request per minute');
    return { valid: errors.length === 0, errors };
  }

  public validateEndpoint(endpoint: Partial<ProviderEndpoint>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!endpoint.endpoint_name?.trim()) errors.push('Endpoint name is required');
    if (!endpoint.method) errors.push('HTTP method is required');
    if (!endpoint.path?.trim()) errors.push('Path is required');
    if (endpoint.path && !endpoint.path.startsWith('/')) errors.push('Path must start with /');
    if (endpoint.timeout_ms !== undefined && endpoint.timeout_ms < 1000) errors.push('Timeout must be at least 1000ms');
    if (endpoint.cache_ttl_seconds !== undefined && endpoint.cache_ttl_seconds < 0) errors.push('Cache TTL cannot be negative');
    try {
      if (endpoint.body_template && typeof endpoint.body_template === 'string') JSON.parse(endpoint.body_template);
    } catch {
      errors.push('Body template must be valid JSON');
    }
    return { valid: errors.length === 0, errors };
  }

  public validateMapping(mapping: Partial<ProviderFieldMapping>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!mapping.external_field?.trim()) errors.push('External field is required');
    if (!mapping.internal_field?.trim()) errors.push('Internal field is required');
    if (!mapping.domain_entity) errors.push('Domain entity is required');
    if (mapping.validation_regex) {
      try {
        new RegExp(mapping.validation_regex);
      } catch {
        errors.push('Validation regex is invalid');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  public exportConfiguration(): string {
    const config = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      providers: this.listProviders().map(p => ({ ...p, api_key: '***', client_secret: '***' })),
      endpoints: this.cache.endpoints,
      mappings: this.cache.mappings,
      coverage: this.cache.coverage,
      capabilities: this.cache.capabilities,
    };
    return JSON.stringify(config, null, 2);
  }

  public importConfiguration(jsonConfig: string): { success: boolean; message: string; imported: { providers: number; endpoints: number; mappings: number } } {
    try {
      const config = JSON.parse(jsonConfig);
      let providersCount = 0;
      let endpointsCount = 0;
      let mappingsCount = 0;

      if (config.providers) {
        config.providers.forEach((p: any) => {
          const validation = this.validateProvider(p);
          if (validation.valid) {
            this.upsertProvider(p);
            providersCount++;
          }
        });
      }

      if (config.endpoints) {
        config.endpoints.forEach((e: any) => {
          const validation = this.validateEndpoint(e);
          if (validation.valid) {
            this.upsertEndpoint(e);
            endpointsCount++;
          }
        });
      }

      if (config.mappings) {
        config.mappings.forEach((m: any) => {
          const validation = this.validateMapping(m);
          if (validation.valid) {
            this.upsertMapping(m);
            mappingsCount++;
          }
        });
      }

      if (config.coverage) {
        config.coverage.forEach((c: any) => this.upsertCoverage(c));
      }

      if (config.capabilities) {
        config.capabilities.forEach((c: any) => this.upsertCapability(c));
      }

      return {
        success: true,
        message: 'Configuration imported successfully',
        imported: { providers: providersCount, endpoints: endpointsCount, mappings: mappingsCount }
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Import failed: ${err.message}`,
        imported: { providers: 0, endpoints: 0, mappings: 0 }
      };
    }
  }
}
