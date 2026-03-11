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

export class SettingsManager {
  private settingsPath: string;
  private settings: AdminSettings;

  constructor() {
    this.settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    this.settings = this.loadSettings();
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
}
