import {SettingsManager} from '../settings_manager.ts';
import {TrackingProvider} from './base_provider.ts';
import {ShipsGoProvider} from './shipsgo.ts';
import {VizionProvider} from './vizion.ts';
import {SeaRatesProvider} from './searates.ts';
import {Terminal49Provider} from './terminal49.ts';

const providerCache: {[key: string]: TrackingProvider} = {};

export function getTrackingProvider(name: string | undefined, settings?: SettingsManager): TrackingProvider | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();

  const apiKeys = (settings?.getSettings()?.apiKeys || {}) as any;
  const shipsKey = apiKeys.shipsGo?.apiKey;
  const shipsEnv = process.env.SHIPSGO_API_KEY || '';
  const effectiveShipsKey = (shipsKey && shipsKey !== 'USE_ENV_OR_INSERT_TOKEN' ? shipsKey : shipsEnv) || '';

  if (key === 'shipsgo' && shipsKey === 'USE_ENV_OR_INSERT_TOKEN' && shipsEnv && providerCache[key]) {
    delete providerCache[key];
  }
  if (providerCache[key]) return providerCache[key];

  let provider: TrackingProvider | undefined;
  switch (key) {
    case 'shipsgo':
      provider = new ShipsGoProvider(effectiveShipsKey);
      break;
    case 'vizion':
      provider = new VizionProvider(apiKeys.vizion?.apiKey || process.env.VIZION_API_KEY || '');
      break;
    case 'searates':
      provider = new SeaRatesProvider(apiKeys.seaRates?.apiKey || process.env.SEARATES_API_KEY || '');
      break;
    case 'terminal49':
      provider = new Terminal49Provider(apiKeys.terminal49?.apiKey || process.env.TERMINAL49_API_KEY || '');
      break;
    default:
      return undefined;
  }

  if (provider) providerCache[key] = provider;
  return provider;
}

export const trackingProviders = ['ShipsGo', 'Vizion', 'SeaRates', 'Terminal49'];
