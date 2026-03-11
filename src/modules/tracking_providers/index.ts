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
  if (providerCache[key]) return providerCache[key];

  const apiKeys = (settings?.getSettings()?.apiKeys || {}) as any;

  let provider: TrackingProvider | undefined;
  switch (key) {
    case 'shipsgo':
      provider = new ShipsGoProvider(apiKeys.shipsGo?.apiKey || process.env.SHIPSGO_API_KEY || '');
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
