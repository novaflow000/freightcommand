import fs from 'fs';
import path from 'path';

export type CarrierStatusState =
  | { status: 'missing'; lastValidated?: string; message?: string }
  | { status: 'ok'; lastValidated: string; message?: string }
  | { status: 'simulated'; lastValidated: string; message?: string }
  | { status: 'error'; lastValidated?: string; message: string };

export interface AdminSettings {
  apiKeys: {
    hapagLloyd: { clientId: string; clientSecret: string };
    maersk: { apiKey: string };
    cmaCgm: { apiKey: string };
    shipsGo?: { apiKey: string };
    vizion?: { apiKey: string };
    seaRates?: { apiKey: string };
    terminal49?: { apiKey: string };
  };
  alerts: {
    delayThresholdDays: number;
    notifyOnArrival: boolean;
    notifyOnDelay: boolean;
    emailRecipients: string[];
    escalation?: string;
  };
  status: {
    hapagLloyd: CarrierStatusState;
    maersk: CarrierStatusState;
    cmaCgm: CarrierStatusState;
    shipsGo?: CarrierStatusState;
    vizion?: CarrierStatusState;
    seaRates?: CarrierStatusState;
    terminal49?: CarrierStatusState;
  };
}

export interface RouterSettings {
  enable_failover: boolean;
  max_failover_attempts: number;
  prefer_low_cost: boolean;
  prefer_low_latency: boolean;
  cost_weight: number;
  latency_weight: number;
  priority_weight: number;
  success_rate_weight: number;
}

export class SettingsManager {
  private settingsPath: string;
  private settings: AdminSettings;
  private routerSettings: RouterSettings;

  constructor() {
    this.settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    this.settings = this.loadSettings();
    this.routerSettings = this.loadRouterSettings();
  }

  private loadSettings(): AdminSettings {
    if (!fs.existsSync(this.settingsPath)) {
      return this.createDefaultSettings();
    }
    try {
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Error loading settings:', error);
      return this.createDefaultSettings();
    }
  }

  private createDefaultSettings(): AdminSettings {
    const defaults: AdminSettings = {
      apiKeys: {
        hapagLloyd: { clientId: '', clientSecret: '' },
        maersk: { apiKey: '' },
        cmaCgm: { apiKey: '' },
        shipsGo: { apiKey: '' },
        vizion: { apiKey: '' },
        seaRates: { apiKey: '' },
        terminal49: { apiKey: '' },
      },
      alerts: {
        delayThresholdDays: 2,
        notifyOnArrival: true,
        notifyOnDelay: true,
        emailRecipients: [],
        escalation: 'none',
      },
      status: {
        hapagLloyd: { status: 'missing' },
        maersk: { status: 'missing' },
        cmaCgm: { status: 'missing' },
        shipsGo: { status: 'missing' },
        vizion: { status: 'missing' },
        seaRates: { status: 'missing' },
        terminal49: { status: 'missing' },
      },
    };
    this.saveSettings(defaults);
    return defaults;
  }

  public getSettings(): AdminSettings {
    return this.settings;
  }

  public updateSettings(newSettings: Partial<AdminSettings>): AdminSettings {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings(this.settings);
    return this.settings;
  }

  private saveSettings(settings: AdminSettings) {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  private loadRouterSettings(): RouterSettings {
    const routerPath = path.join(process.cwd(), 'data', 'router-settings.json');
    if (!fs.existsSync(routerPath)) {
      return {
        enable_failover: true,
        max_failover_attempts: 3,
        prefer_low_cost: false,
        prefer_low_latency: true,
        cost_weight: 0.15,
        latency_weight: 0.20,
        priority_weight: 0.35,
        success_rate_weight: 0.30,
      };
    }
    try {
      return JSON.parse(fs.readFileSync(routerPath, 'utf-8'));
    } catch {
      return {
        enable_failover: true,
        max_failover_attempts: 3,
        prefer_low_cost: false,
        prefer_low_latency: true,
        cost_weight: 0.15,
        latency_weight: 0.20,
        priority_weight: 0.35,
        success_rate_weight: 0.30,
      };
    }
  }

  public getRouterSettings(): RouterSettings {
    return this.routerSettings;
  }

  public updateRouterSettings(settings: Partial<RouterSettings>): RouterSettings {
    this.routerSettings = { ...this.routerSettings, ...settings };
    const routerPath = path.join(process.cwd(), 'data', 'router-settings.json');
    try {
      const dir = path.dirname(routerPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(routerPath, JSON.stringify(this.routerSettings, null, 2));
    } catch (error) {
      console.error('Error saving router settings:', error);
    }
    return this.routerSettings;
  }
}
