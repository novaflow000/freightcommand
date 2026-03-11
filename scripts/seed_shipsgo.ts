import { ProviderRegistry } from '../src/modules/provider_registry.ts';
import { SettingsManager } from '../src/modules/settings_manager.ts';

const token = process.env.SHIPSGO_API_KEY || 'demo-shipsgo-token';

async function main() {
  const registry = new ProviderRegistry();
  const provider = registry.upsertProvider({
    name: 'ShipsGo',
    base_url: 'https://api.shipsgo.com',
    auth_type: 'CUSTOM_HEADER',
    api_key: token,
    headers: {
      'X-Shipsgo-User-Token': '{{API_KEY}}',
      'Content-Type': 'application/json',
    },
    is_active: true,
    supports_container_tracking: true,
    supports_bl_tracking: true,
    multi_carrier: true,
    priority: 5,
  });

  // Coverage for common SCAC codes
  ['CMA', 'MSC', 'COS', 'HLC'].forEach((code) =>
    registry.upsertCoverage({ provider_id: provider.id, carrier_code: code }),
  );

  // Endpoints
  registry.upsertEndpoint({
    provider_id: provider.id,
    endpoint_name: 'create_tracking',
    method: 'POST',
    path: '/v2/ocean/shipments',
    headers_json: {
      'X-Shipsgo-User-Token': '{{API_KEY}}',
      'Content-Type': 'application/json',
    },
    body_template: {
      reference: '{{reference}}',
      container_number: '{{container_number}}',
      booking_number: '{{booking_number}}',
      carrier: '{{carrier}}',
      tags: ['platform'],
    },
  });

  registry.upsertEndpoint({
    provider_id: provider.id,
    endpoint_name: 'get_shipment',
    method: 'GET',
    path: '/v2/ocean/shipments/{{shipment_id}}',
    headers_json: {
      'X-Shipsgo-User-Token': '{{API_KEY}}',
      'Content-Type': 'application/json',
    },
  });

  registry.upsertEndpoint({
    provider_id: provider.id,
    endpoint_name: 'get_route',
    method: 'GET',
    path: '/v2/ocean/shipments/{{shipment_id}}/geojson',
    headers_json: {
      'X-Shipsgo-User-Token': '{{API_KEY}}',
      'Content-Type': 'application/json',
    },
  });

  // Seed settings for tracking providers
  const settings = new SettingsManager();
  settings.updateSettings({
    apiKeys: {
      ...settings.getSettings().apiKeys,
      shipsGo: { apiKey: token },
    },
    status: {
      ...settings.getSettings().status,
      shipsGo: { status: token ? 'ok' : 'missing', lastValidated: new Date().toISOString() },
    },
  });

  console.log('ShipsGo provider seeded with id', provider.id);
  if (!process.env.SHIPSGO_API_KEY) {
    console.warn('NOTE: SHIPSGO_API_KEY not set; using demo token. Set env and rerun for production.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
